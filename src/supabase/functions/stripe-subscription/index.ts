import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.11.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the calling user's JWT and get their user record
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    // Validate the user's JWT using the anon key (public key)
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    let body: Record<string, any> = {};
    try {
      body = await req.json();
    } catch {
      // No body — fine for GET requests
    }
    const { action, plan, hosting_choice, extras, include_scrape, email, user_id, return_url, session_id } = body;

    // Price IDs — set in stripe-server .env
    const priceIds: Record<string, string | undefined> = {
      starter: Deno.env.get("STRIPE_PRICE_STARTER"),
      pro:     Deno.env.get("STRIPE_PRICE_PRO"),
      agency:  Deno.env.get("STRIPE_PRICE_AGENCY"),
    };

    // ── GET_SESSION ──────────────────────────────────────────────────────────
    if (action === "get_session") {
      if (!session_id) throw new Error("Missing session_id");

      const sess = await stripe.checkout.sessions.retrieve(session_id);

      // Map Stripe subscription statuses to our simplified statuses
      let subStatus = "inactive";
      if (sess.subscription) {
        const sub = await stripe.subscriptions.retrieve(sess.subscription as string);
        subStatus = sub.status === "active" || sub.status === "trialing"
          ? "active"
          : sub.status === "past_due"
          ? "past_due"
          : "inactive";
      }

      return new Response(
        JSON.stringify({
          status: sess.status,
          subscription_id: sess.subscription,
          customer_id: sess.customer,
          sub_status: subStatus,
          amount_total: sess.amount_total,
          customer_email: sess.customer_details?.email,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── CREATE_CHECKOUT_SESSION ─────────────────────────────────────────────
    if (action === "create_checkout_session") {
      if (!plan) throw new Error("Missing plan");

      const priceId = priceIds[plan];
      if (!priceId) throw new Error(`No price ID configured for plan: ${plan}`);

      const successUrl = (return_url || `${Deno.env.get("SUPABASE_URL")}/?paid=true`)
        .replace(/[?&]session_id=[^&]*/, "")
        .replace(/[?&]paid=true/, "?") + "paid=true&session_id={CHECKOUT_SESSION_ID}";

      const cancelUrl = (return_url || `${Deno.env.get("SUPABASE_URL")}/?`)
        .replace(/[?&]session_id=[^&]*/, "")
        .replace(/[?&]paid=true/, "") + "?cancelled=true";

      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
        { price: priceId, quantity: 1 },
      ];

      // Add one-time scrape fee if Airbnb import selected
      if (include_scrape) {
        const scrapePriceId = Deno.env.get("STRIPE_PRICE_SCRAPE");
        if (scrapePriceId) {
          lineItems.push({ price: scrapePriceId, quantity: 1 });
        }
      }

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: "subscription",
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: email || undefined,
        metadata: {
          user_id: user_id || user.id,
          plan,
          hosting_choice: hosting_choice || "",
          extras: Array.isArray(extras) ? extras.join(",") : "",
        },
        subscription_data: {
          metadata: {
            user_id: user_id || user.id,
            plan,
          },
          // First month free for starter
          ...(plan === "starter" ? { trial_period_days: 30 } : {}),
        },
        allow_promotion_codes: true,
        billing_address_collection: "required",
      };

      const session = await stripe.checkout.sessions.create(sessionParams);

      return new Response(
        JSON.stringify({ url: session.url, session_id: session.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── GET_SUBSCRIPTION_STATUS (also handles GET for sidebar loader) ────────────
    if (action === "get_subscription_status" || req.method === "GET") {
      // GET path: ?subscription_id=XXX or profile lookup
      let subId: string | null = null;
      let profileStatus: string | null = null;

      if (body?.subscription_id) {
        subId = body.subscription_id;
      } else {
        // Lookup from profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("stripe_subscription_id, stripe_subscription_status")
          .eq("id", user.id)
          .maybeSingle();
        subId = profile?.stripe_subscription_id || null;
        profileStatus = profile?.stripe_subscription_status || null;
      }

      console.log(`[get_subscription_status] subId=${subId}, profileStatus=${profileStatus}`);

      if (!subId) {
        return new Response(
          JSON.stringify({ status: "no_subscription", plan: null, profileStatus }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const sub = await stripe.subscriptions.retrieve(subId);
        const statusMap: Record<string, string> = {
          active: "active",
          trialing: "active",
          past_due: "past_due",
          canceled: "canceled",
          unpaid: "unpaid",
        };
        return new Response(
          JSON.stringify({
            subscription: { id: sub.id, status: statusMap[sub.status] || sub.status, plan: sub.metadata.plan || profileStatus || "starter", current_period_end: sub.current_period_end },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        console.error(`[get_subscription_status] Stripe retrieve error for ${subId}:`, err.message);
        // Fall back to profile data if Stripe lookup fails
        return new Response(
          JSON.stringify({
            subscription: { id: subId, status: profileStatus || "unknown", plan: profileStatus || "starter", current_period_end: null },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[stripe-subscription]", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});