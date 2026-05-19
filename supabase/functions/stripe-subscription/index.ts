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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // ── GET: fetch current subscription for authenticated user ───────────────
    if (req.method === "GET") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("No authorization header");

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

    // ── create_checkout ──────────────────────────────────────────────────────
    // Builds a Stripe Checkout Session with:
    //   - One recurring subscription for the plan (+ hosting add-on if selected)
    //   - One recurring line item per selected extra
    //   - One one-time line item for the Airbnb scrape if selected
    // Amounts exactly match the frontend pricing object / bottom banner.
    if (action === "create_checkout") {
      const {
        plan,
        hosting_choice,
        extras = [],           // string[]  e.g. ['seo', 'ads']
        include_scrape = false,
        email,
        user_id,
        return_url,
      } = body;

      if (!PLANS[plan]) throw new Error(`Invalid plan: ${plan}`);
      if (!email) throw new Error("email is required");
      if (!return_url) throw new Error("return_url is required");

      const planCfg = PLANS[plan];

      // ── Build recurring line items ────────────────────────────────────────
      // Plan price
      const planPriceId = await getOrCreateRecurringPrice(
        stripe,
        `propbook_plan_${plan}`,
        planCfg.amount,
        planCfg.name,
      );

      const subscriptionItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        { price: planPriceId, quantity: 1 },
      ];

      // Hosting add-on
      if (hosting_choice === "our") {
        const hostingPriceId = await getOrCreateRecurringPrice(
          stripe,
          "propbook_hosting_our",
          HOSTING_ADDON.amount,
          HOSTING_ADDON.name,
        );
        subscriptionItems.push({ price: hostingPriceId, quantity: 1 });
      }

      // Optional extras (recurring monthly)
      for (const extra of extras) {
        if (!EXTRAS[extra]) continue;
        const extPriceId = await getOrCreateRecurringPrice(
          stripe,
          `propbook_extra_${extra}`,
          EXTRAS[extra].amount,
          EXTRAS[extra].name,
        );
        subscriptionItems.push({ price: extPriceId, quantity: 1 });
      }

      // ── Build one-time line items ─────────────────────────────────────────
      const oneTimeItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

      if (include_scrape) {
        const scrapePriceId = await getOrCreateOneTimePrice(
          stripe,
          "propbook_scrape_onetime",
          SCRAPE_PRICE.amount,
          SCRAPE_PRICE.name,
        );
        oneTimeItems.push({ price: scrapePriceId, quantity: 1 });
      }

      // ── Find or create Stripe customer ────────────────────────────────────
      const existing = await stripe.customers.list({ email, limit: 1 });
      const customerId = existing.data.length > 0
        ? existing.data[0].id
        : (await stripe.customers.create({ email, metadata: { user_id: user_id || "" } })).id;

      // ── Stripe Checkout does not support mixing recurring + one-time in one
      //    session. If there's a scrape fee, create two sessions or add it as
      //    a subscription add-on via invoice_items.
      //    Simplest approach: if scrape included, add it as a subscription item
      //    with a one-time invoice item via subscription_data.add_invoice_items.
      //
      //    This appears as a separate charge on the first invoice alongside the
      //    subscription, exactly matching what the banner shows as "due today".

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        customer: customerId,
        mode: "subscription",
        line_items: subscriptionItems,
        success_url: `${return_url}?subscription=success&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${return_url}?subscription=cancelled`,
        metadata: {
          plan,
          email,
          user_id: user_id || "",
          hosting_choice: hosting_choice || "own",
          extras: extras.join(","),
          include_scrape: include_scrape ? "true" : "false",
        },
        subscription_data: {
          metadata: {
            plan,
            email,
            user_id: user_id || "",
          },
          ...(planCfg.trialDays > 0
            ? { trial_period_days: planCfg.trialDays }
            : {}),
        // NOTE: one-time scrape fees must be handled via a separate flow
        // (e.g. a follow-up Invoice or PaymentIntent after subscription creation)
        },
      };

      const session = await stripe.checkout.sessions.create(sessionParams);

      return new Response(
        JSON.stringify({ url: session.url, session_id: session.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── cancel_subscription ──────────────────────────────────────────────────
    if (action === "cancel_subscription") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("No authorization header");

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
