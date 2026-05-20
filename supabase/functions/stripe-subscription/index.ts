import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.11.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Pricing (must match the frontend pricing object exactly) ─────────────────
// plans: starter=$10/mo (30-day trial), pro=$30/mo, agency=$150/mo
// hosting add-on (our server): $5/mo
// extras (monthly): seo=$10, ads=$30, analytics=$20, social=$50
// one-off: airbnb scrape=$10
// Starter plan: first month free via 30-day trial — $0 charged today for subscription

const PLANS: Record<string, { amount: number; name: string; trialDays: number }> = {
  starter: { amount: 1000,  name: "Starter Plan", trialDays: 30 },
  pro:     { amount: 3000,  name: "Pro Plan",      trialDays: 0  },
  agency:  { amount: 15000, name: "Agency Plan",   trialDays: 0  },
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

    // ── create_payment_intent ────────────────────────────────────────────────
    // Creates a PaymentIntent + subscription for embedded Stripe Elements.
    // Returns client_secret so the frontend can render the embedded payment form.
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

      // ── Create or retrieve the subscription with trial if starter plan ───
      // We create the subscription in advance so we can get the first invoice's
      // PaymentIntent client_secret for the embedded element.
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

      if (planCfg.trialDays > 0) {
        subParams.trial_period_days = planCfg.trialDays;
      }

      // Add hosting add-on
      if (hosting_choice === "our") {
        const hostingPriceId = await getOrCreateRecurringPrice(
          stripe, "propbook_hosting_our", HOSTING_ADDON.amount, HOSTING_ADDON.name
        );
        (subParams.items as Stripe.SubscriptionCreateParams.Item[]).push({ price: hostingPriceId });
      }

      // Add extras
      for (const extra of extras) {
        if (!EXTRAS[extra]) continue;
        const extPriceId = await getOrCreateRecurringPrice(
          stripe, `propbook_extra_${extra}`, EXTRAS[extra].amount, EXTRAS[extra].name
        );
        (subParams.items as Stripe.SubscriptionCreateParams.Item[]).push({ price: extPriceId });
      }

      const subscription = await stripe.subscriptions.create(subParams);

      const invoice = subscription.latest_invoice as Stripe.Invoice;

      // ── Get or create PaymentIntent ────────────────────────────────────────
      // During trial periods, Stripe may not auto-create a payment intent.
      // In that case we create one manually for the invoice amount.
      let paymentIntent = invoice.payment_intent as Stripe.PaymentIntent | null;

      if (!paymentIntent) {
        // Finalize the invoice to trigger PaymentIntent creation
        const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
        paymentIntent = (finalizedInvoice as Stripe.Invoice).payment_intent as Stripe.PaymentIntent | null;

        // If still no payment intent (e.g. $0 trial invoice), create one manually
        if (!paymentIntent) {
          const totalAmount = (finalizedInvoice as Stripe.Invoice).total || 0;
          paymentIntent = await stripe.paymentIntents.create({
            amount: Math.max(totalAmount, 0),
            currency: "usd",
            customer: customerId,
            metadata: {
              subscription_id: subscription.id,
              invoice_id: invoice.id,
              plan,
              user_id: user_id || "",
            },
          });
          // Attach it to the invoice
          await stripe.invoices.update(invoice.id, {
            metadata: { payment_intent_id: paymentIntent.id },
          });
        }
      }

      if (!paymentIntent?.client_secret) {
        console.error("stripe-subscription: PaymentIntent still null. Invoice status:", invoice.status, "total:", invoice.total, "sub status:", subscription.status);
        throw new Error("Could not create payment intent for first invoice");
      }

      return new Response(
        JSON.stringify({
          client_secret: paymentIntent.client_secret,
          subscription_id: subscription.id,
          payment_intent_id: paymentIntent.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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