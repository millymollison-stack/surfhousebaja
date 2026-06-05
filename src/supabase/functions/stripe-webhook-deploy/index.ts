import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.11.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, stripe-signature",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-11-17.clover" });
    const supabase = createClient(supabaseUrl, supabaseKey);

    const signature = req.headers.get("stripe-signature")!;
    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400, headers: corsHeaders });
    }

    console.log("Event:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`Session: ${session.id}, sub: ${session.subscription}`);

      if (!session.subscription) {
        console.log("No subscription, skipping");
        return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
      }

      let userId: string | null = null;
      if (session.customer) {
        const { data } = await supabase.from("profiles").select("id").eq("stripe_customer_id", session.customer as string).maybeSingle();
        userId = data?.id ?? null;
      }
      if (!userId && session.customer_details?.email) {
        const { data } = await supabase.from("profiles").select("id").eq("email", session.customer_details.email.toLowerCase()).maybeSingle();
        userId = data?.id ?? null;
      }
      if (!userId) {
        console.error("No profile found for session", session.id);
        return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
      }

      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      await supabase.from("profiles").update({
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: sub.id,
        stripe_subscription_status: sub.status === "active" || sub.status === "trialing" ? "active" : sub.status,
        stripe_subscription_plan: sub.metadata?.plan || "starter",
        stripe_subscription_amount: sub.items.data[0]?.price?.unit_amount || 0,
        stripe_subscription_interval: sub.items.data[0]?.price?.recurring?.interval || "month",
        stripe_subscription_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        role: "admin",
      }).eq("id", userId);

      console.log("Profile updated for", userId);
    }

    return new Response(JSON.stringify({ received: true }), { headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});