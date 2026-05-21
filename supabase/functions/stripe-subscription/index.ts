import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.11.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Pricing ───────────────────────────────────────────────────────────────────
// plans: starter=$10/mo, pro=$30/mo, agency=$150/mo
// hosting add-on (our server): $5/mo
// extras (monthly): seo=$10, ads=$30, analytics=$20, social=$50
// one-off: airbnb scrape=$10
// All plans charge from day 1 — no free trials

const PLANS: Record<string, { amount: number; name: string }> = {
  starter: { amount: 1000,  name: "Starter Plan" },
  pro:     { amount: 3000,  name: "Pro Plan"      },
  agency:  { amount: 15000, name: "Agency Plan"   },
};

const HOSTING_ADDON = { amount: 500, name: "Hosting (our server)" };

const EXTRAS: Record<string, { amount: number; name: string }> = {
  seo:       { amount: 1000,  name: "AI SEO" },
  ads:       { amount: 3000,  name: "Ads & Marketing" },
  analytics: { amount: 2000,  name: "Analytics" },
  social:    { amount: 5000,  name: "Social Media Marketing" },
};

const SCRAPE_PRICE = { amount: 1000, name: "Airbnb Listing Import (one-time)" };

// Get or create a Stripe Price with a lookup_key (idempotent)
async function getOrCreateRecurringPrice(
  stripe: Stripe,
  lookupKey: string,
  amount: number,
  nickname: string,
): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (existing.data.length > 0) return existing.data[0].id;

  const product = await stripe.products.create({ name: nickname });
  const price = await stripe.prices.create({
    unit_amount: amount,
    currency: "usd",
    recurring: { interval: "month" },
    product: product.id,
    lookup_key: lookupKey,
    nickname,
  });
  return price.id;
}

async function getOrCreateOneTimePrice(
  stripe: Stripe,
  lookupKey: string,
  amount: number,
  nickname: string,
): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (existing.data.length > 0) return existing.data[0].id;

  const product = await stripe.products.create({ name: nickname });
  const price = await stripe.prices.create({
    unit_amount: amount,
    currency: "usd",
    product: product.id,
    lookup_key: lookupKey,
    nickname,
  });
  return price.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // ── GET: fetch current subscription for authenticated user ───────────────
    if (req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("No authorization header");

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authError || !user) throw new Error("Unauthorized");

      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_subscription_id, stripe_subscription_status, stripe_subscription_plan, stripe_subscription_amount, stripe_subscription_period_end")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.stripe_subscription_id) {
        return new Response(JSON.stringify({ subscription: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
        const item = (sub as any).items?.data?.[0];
        return new Response(
          JSON.stringify({
            subscription: {
              id: sub.id,
              status: sub.status,
              plan: item?.price?.nickname || profile.stripe_subscription_plan,
              amount: item?.price?.unit_amount || profile.stripe_subscription_amount || 0,
              interval: item?.price?.recurring?.interval || "month",
              current_period_end: sub.current_period_end,
              cancel_at_period_end: sub.cancel_at_period_end,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        return new Response(JSON.stringify({ subscription: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    const body = await req.json();
    const { action } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── create_payment_intent ────────────────────────────────────────────────
    if (action === "create_checkout") {
      const {
        plan,
        hosting_choice,
        extras = [],
        include_scrape = false,
        email,
        user_id,
        return_url,
      } = body;

      if (!PLANS[plan]) throw new Error(`Invalid plan: ${plan}`);
      if (!email) throw new Error("email is required");
      if (!user_id) throw new Error("user_id is required");

      const planCfg = PLANS[plan];

      // Calculate total amount in cents
      let totalAmount = planCfg.amount;
      if (hosting_choice === "our") totalAmount += HOSTING_ADDON.amount;
      for (const extra of extras) {
        if (EXTRAS[extra]) totalAmount += EXTRAS[extra].amount;
      }
      if (include_scrape) totalAmount += SCRAPE_PRICE.amount;

      // ── Find or create Stripe customer ─────────────────────────────────
      const existing = await stripe.customers.list({ email, limit: 1 });
      const customerId = existing.data.length > 0
        ? existing.data[0].id
        : (await stripe.customers.create({ email, metadata: { user_id: user_id || "" } })).id;

      // ── Check for existing incomplete subscription (idempotent retry) ────
      // On retry, if the user already has an incomplete subscription for the same plan,
      // reuse it and just create a fresh PaymentIntent. This avoids creating duplicate
      // subscriptions each time the user retries a failed payment.
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_subscription_id, stripe_subscription_status, stripe_subscription_plan')
        .eq('id', user_id)
        .maybeSingle();

      let subscription: Stripe.Subscription;

      if (profile?.stripe_subscription_id) {
        // Reuse existing subscription — check it's for the same plan and still incomplete
        try {
          const existingSub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
          const existingPlan = (existingSub.metadata as Record<string, string>).plan || '';

          if (existingPlan === plan && existingSub.status === 'incomplete') {
            // Same plan, incomplete — reuse it and create a new PaymentIntent
            subscription = existingSub;
          } else if (existingSub.status === 'active' || existingSub.status === 'trialing') {
            throw new Error('You already have an active subscription. Cancel it first to change plans.');
          } else {
            // Different plan or terminal state — create a fresh subscription
            subscription = await createNewSubscription();
          }
        } catch (err: any) {
          if (err.message?.startsWith('You already have')) throw err;
          // Sub was deleted in Stripe but profile still has the ID — create fresh
          subscription = await createNewSubscription();
        }
      } else {
        // No existing subscription — create one
        subscription = await createNewSubscription();
      }

      // ── Save subscription ID to profile so UI can poll and show it ─────────
      try {
        await supabase
          .from('profiles')
          .update({
            stripe_subscription_id: subscription.id,
            stripe_subscription_status: subscription.status,
            stripe_subscription_plan: plan,
            stripe_subscription_amount: planCfg.amount,
          })
          .eq('id', user_id);
      } catch (err) {
        console.error('Failed to persist subscription ID to profile:', err);
      }

      // ── Helper: create a brand-new subscription ───────────────────────────
      async function createNewSubscription(): Promise<Stripe.Subscription> {
        const subParams: Stripe.SubscriptionCreateParams = {
          customer: customerId,
          items: [{ price: await getOrCreateRecurringPrice(stripe, `propbook_plan_${plan}`, planCfg.amount, planCfg.name) }],
          metadata: {
            plan,
            email,
            user_id: user_id || "",
            hosting_choice: hosting_choice || "own",
            extras: extras.join(","),
            include_scrape: include_scrape ? "true" : "false",
          },
          payment_behavior: "default_incomplete",
          payment_settings: { save_default_payment_method: "on_subscription" },
          expand: ["latest_invoice.payment_intent"],
        };

        if (hosting_choice === "our") {
          const hostingPriceId = await getOrCreateRecurringPrice(stripe, "propbook_hosting_our", HOSTING_ADDON.amount, HOSTING_ADDON.name);
          (subParams.items as Stripe.SubscriptionCreateParams.Item[]).push({ price: hostingPriceId });
        }

        for (const extra of extras) {
          if (!EXTRAS[extra]) continue;
          const extPriceId = await getOrCreateRecurringPrice(stripe, `propbook_extra_${extra}`, EXTRAS[extra].amount, EXTRAS[extra].name);
          (subParams.items as Stripe.SubscriptionCreateParams.Item[]).push({ price: extPriceId });
        }

        return stripe.subscriptions.create(subParams);
      }

      const invoice = subscription.latest_invoice as Stripe.Invoice;

// ── Get or create PaymentIntent ────────────────────────────────────────
      // Invoice states: draft (awaiting finalization) or finalized (already processed by Stripe).
      // For draft invoices: finalize first to get the PaymentIntent.
      // For already-finalized invoices: create a new PaymentIntent manually.
      // On retry (subscription reused): always ensure we have a fresh PI that hasn't been confirmed.
      let paymentIntent = invoice.payment_intent as Stripe.PaymentIntent | null;

      if (invoice.status === 'draft') {
        const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
        paymentIntent = (finalizedInvoice as Stripe.Invoice).payment_intent as Stripe.PaymentIntent | null;
      }

      if (!paymentIntent || paymentIntent.status !== 'requires_payment_method') {
        // PaymentIntent already confirmed/used OR missing — create a fresh one manually
        // This handles the retry case where the original PI was already confirmed (400 from Stripe)
        paymentIntent = await stripe.paymentIntents.create({
          amount: invoice.total || totalAmount,
          currency: "usd",
          customer: customerId,
          metadata: { subscription_id: subscription.id, invoice_id: invoice.id, plan, user_id: user_id || "" },
        });
      }

      if (!paymentIntent?.client_secret) {
        console.error('stripe-subscription: PaymentIntent still null. Invoice status:', invoice.status, 'total:', invoice.total, 'sub status:', subscription.status);
        throw new Error('Could not create payment intent for first invoice');
      }

      return new Response(
        JSON.stringify({ client_secret: paymentIntent.client_secret, subscription_id: subscription.id, payment_intent_id: paymentIntent.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── create_checkout_session ──────────────────────────────────────────────
    if (action === 'create_checkout_session') {
      const {
        plan,
        hosting_choice,
        extras = [],
        include_scrape = false,
        email,
        user_id,
        return_url,
      } = body;

      if (!PLANS[plan]) throw new Error(`Invalid plan: ${plan}`);
      if (!email) throw new Error('email is required');
      if (!user_id) throw new Error('user_id is required');

      const planCfg = PLANS[plan];

      // Build line items for the Checkout Session
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
        price_data: {
          currency: 'usd',
          product_data: { name: planCfg.name + ' Plan' },
          unit_amount: planCfg.amount,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }];

      if (hosting_choice === 'our') {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: { name: 'Hosting (our server)' },
            unit_amount: HOSTING_ADDON.amount,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        });
      }

      for (const extra of extras) {
        if (!EXTRAS[extra]) continue;
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: { name: EXTRAS[extra].name },
            unit_amount: EXTRAS[extra].amount,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        });
      }

      // Find or create Stripe customer
      const existing = await stripe.customers.list({ email, limit: 1 });
      const customerId = existing.data.length > 0
        ? existing.data[0].id
        : (await stripe.customers.create({ email, metadata: { user_id: user_id || '' } })).id;

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: lineItems,
        success_url: `${return_url}?paid=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${return_url}?canceled=true`,
        customer: customerId,
        metadata: {
          user_id: user_id || '',
          plan,
          hosting_choice: hosting_choice || 'own',
          extras: extras.join(','),
          include_scrape: include_scrape ? 'true' : 'false',
        },
        subscription_data: {
          metadata: {
            user_id: user_id || '',
            plan,
            hosting_choice: hosting_choice || 'own',
            extras: extras.join(','),
          },
        },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
      });

      return new Response(
        JSON.stringify({ url: session.url, session_id: session.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── get_session ──────────────────────────────────────────────────────────
    if (action === 'get_session') {
      const { session_id } = body;
      if (!session_id) throw new Error('session_id required');

      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ['subscription'],
      });

      return new Response(
        JSON.stringify({
          status: session.status,
          subscription_id: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
          customer_email: session.customer_email,
          amount_total: session.amount_total,
          customer_id: session.customer,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── cancel_subscription ──────────────────────────────────────────────────
    if (action === "cancel_subscription") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("No authorization header");

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authError || !user) throw new Error("Unauthorized");

      const { subscription_id } = body;
      if (!subscription_id) throw new Error("subscription_id required");

      await stripe.subscriptions.update(subscription_id, { cancel_at_period_end: true });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("stripe-subscription error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});