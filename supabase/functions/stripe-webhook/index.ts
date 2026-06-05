import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@14.11.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Manual webhook signature verification ─────────────────────────────────
// Stripe's built-in constructEvent() uses SubtleCrypto synchronously, which
// Deno's edge runtime doesn't support. We verify the signature manually using
// Deno's built-in crypto API instead.
async function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  // Stripe signature header format: t=timestamp,v1=signature[,v0=legacy]
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const idx = p.indexOf("=");
      return [p.slice(0, idx), p.slice(idx + 1)];
    })
  );
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;

  // Compute expected signature: HMAC-SHA256(timestamp + "." + payload)
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // Timing-safe comparison
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}

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
    const body = await req.text();

    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify signature manually (Deno-compatible, avoids SubtleCrypto sync error)
    const isValid = await verifyStripeSignature(body, signature, webhookSecret);
    if (!isValid) {
      console.error("Webhook signature verification failed");
      return new Response(
        JSON.stringify({ error: "Webhook signature verification failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse event from body (signature already verified)
    let event: Stripe.Event;
    try {
      event = JSON.parse(body);
    } catch (err) {
      console.error("Webhook event parse failed:", err.message);
      return new Response(
        JSON.stringify({ error: "Invalid event payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Received Stripe event:", event.type);

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
