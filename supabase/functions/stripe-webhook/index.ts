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
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not configured");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const signature = req.headers.get("stripe-signature");
    const bodyRaw = await req.text();

    console.log("[stripe-webhook] Request received. Headers:", JSON.stringify({
      sigHeader: signature ? `present (${signature.slice(0, 20)}... )` : "MISSING",
      bodyLen: bodyRaw.length,
      contentType: req.headers.get("content-type"),
    }));

    if (!signature) {
      console.error("[stripe-webhook] ERROR: Missing stripe-signature header — returning 400");
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Stripe SDK's async constructEventAsync (avoids Deno SubtleCrypto sync error)
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(bodyRaw, signature, webhookSecret) as Stripe.Event;
      console.log("[stripe-webhook] Signature verification PASSED — event type:", event.type);
    } catch (err: any) {
      console.error("[stripe-webhook] Signature verification FAILED:", err.message);
      return new Response(
        JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Received Stripe event:", event.type, "id:", event.id);

    // ── Log ALL incoming webhook events so we can confirm delivery in Supabase logs
    console.log("[stripe-webhook] full event:", JSON.stringify({
      id: event.id,
      type: event.type,
      created: event.created,
      object: event.object,
    }));

    switch (event.type) {

      // ── Guest booking payment events ──────────────────────────────────────

      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.bookingId) {
          await supabase.from("bookings").update({
            status: "approved",
            payment_status: "paid",
            payment_completed_at: new Date().toISOString(),
          }).eq("stripe_payment_intent_id", pi.id);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        if (pi.metadata?.bookingId) {
          await supabase.from("bookings").update({
            payment_status: "failed",
          }).eq("stripe_payment_intent_id", pi.id);
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const piId = charge.payment_intent as string;
        if (piId) {
          const refundId = charge.refunds?.data[0]?.id;
          await supabase.from("bookings").update({
            payment_status: "refunded",
            stripe_refund_id: refundId || null,
          }).eq("stripe_payment_intent_id", piId);
        }
        break;
      }

      // ── PropBook subscription events ──────────────────────────────────────

      // Fired when Stripe Checkout completes — subscription is now active.
      // We write subscription details to the user's profile row so the client
      // can verify payment succeeded when it returns from the redirect.
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const userId  = session.metadata?.user_id;
        const email   = session.metadata?.email || session.customer_email;
        const plan    = session.metadata?.plan;
        const subId   = session.subscription as string;
        const slug    = session.metadata?.slug;

        if (!subId) break;

        // Retrieve full subscription to get period_end and item amounts
        const sub = await stripe.subscriptions.retrieve(subId);
        const item = (sub as any).items?.data?.[0];

        // Calculate total monthly amount across all subscription items
        const totalMonthly = (sub as any).items?.data?.reduce(
          (sum: number, i: any) => sum + (i.price?.unit_amount || 0),
          0
        ) ?? item?.price?.unit_amount ?? 0;

        // Update profile — look up by user_id first, fall back to email
        const profileUpdate = {
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subId,
          stripe_subscription_status: sub.status,
          stripe_subscription_plan: plan || null,
          stripe_subscription_amount: totalMonthly,
          stripe_subscription_interval: "month",
          stripe_subscription_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        };

        if (userId) {
          await supabase.from("profiles").update(profileUpdate).eq("id", userId);
        } else if (email) {
          await supabase.from("profiles").update(profileUpdate).eq("email", email);
        }

        console.log(`Subscription ${subId} linked to user ${userId || email}`);

        // ── Trigger property deploy if slug is provided ────────────────────
        if (userId && slug) {
          console.log(`[stripe-webhook] Triggering deploy for slug=${slug}, user=${userId}`);
          try {
            const deployRes = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-subscription`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({ userId, slug }),
              }
            );
            const deployData = await deployRes.json();
            console.log(`[stripe-webhook] Deploy result:`, JSON.stringify(deployData));
            if (!deployRes.ok) {
              console.error(`[stripe-webhook] Deploy failed: ${deployData.error}`);
            }
          } catch (deployErr) {
            console.error(`[stripe-webhook] Deploy error: ${deployErr.message}`);
          }
        }

        break;
      }

      // Subscription renewed, plan changed, or cancellation toggled
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const totalMonthly = (sub as any).items?.data?.reduce(
          (sum: number, i: any) => sum + (i.price?.unit_amount || 0),
          0
        ) ?? 0;

        await supabase.from("profiles").update({
          stripe_subscription_status: sub.status,
          stripe_subscription_amount: totalMonthly,
          stripe_subscription_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        }).eq("stripe_customer_id", customerId);

        break;
      }

      // Subscription cancelled or expired
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        await supabase.from("profiles").update({
          stripe_subscription_status: "cancelled",
          stripe_subscription_id: null,
        }).eq("stripe_customer_id", customerId);

        break;
      }

      // Renewal payment failed — mark as past_due
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        if (invoice.subscription) {
          await supabase.from("profiles").update({
            stripe_subscription_status: "past_due",
          }).eq("stripe_customer_id", customerId);
        }
        break;
      }

      default:
        console.log(`Unhandled event: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
