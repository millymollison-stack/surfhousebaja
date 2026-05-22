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
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2023-10-16",
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    let event: Stripe.Event;

    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return new Response(
          JSON.stringify({ error: "Webhook signature verification failed" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
    } else {
      event = JSON.parse(body);
    }

    console.log("Received event:", event.type);

    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.bookingId;

        if (bookingId) {
          const { error: updateError } = await supabase
            .from("bookings")
            .update({
              status: "approved",
              payment_status: "paid",
              payment_completed_at: new Date().toISOString(),
            })
            .eq("stripe_payment_intent_id", paymentIntent.id);

          if (updateError) {
            console.error("Failed to update booking:", updateError);
          } else {
            console.log(`Payment succeeded for booking ${bookingId}`);
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const bookingId = paymentIntent.metadata.bookingId;

        if (bookingId) {
          const { error: updateError } = await supabase
            .from("bookings")
            .update({
              payment_status: "failed",
            })
            .eq("stripe_payment_intent_id", paymentIntent.id);

          if (updateError) {
            console.error("Failed to update booking:", updateError);
          } else {
            console.log(`Payment failed for booking ${bookingId}`);
          }
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string;

        if (paymentIntentId) {
          const refundId = charge.refunds?.data[0]?.id;
          const { error: updateError } = await supabase
            .from("bookings")
            .update({
              payment_status: "refunded",
              stripe_refund_id: refundId || null,
            })
            .eq("stripe_payment_intent_id", paymentIntentId);

          if (updateError) {
            console.error("Failed to update booking refund:", updateError);
          } else {
            console.log(`Refund processed for payment intent ${paymentIntentId}`);
          }
        }
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`Checkout session completed: ${session.id}, customer: ${session.customer}, subscription: ${session.subscription}`);

        if (!session.subscription) {
          console.log("No subscription in checkout session, skipping profile update");
          break;
        }

        // Look up the user by customer ID or email
        let userId: string | null = null;

        if (session.customer) {
          // Find profile with matching stripe_customer_id
          const { data: profileByCustomer } = await supabase
            .from("profiles")
            .select("id, email")
            .eq("stripe_customer_id", session.customer as string)
            .maybeSingle();

          if (profileByCustomer) {
            userId = profileByCustomer.id;
            console.log(`Found profile by customer ID ${session.customer}: ${userId}`);
          }
        }

        // Fallback: look up by email from session
        if (!userId && session.customer_details?.email) {
          const { data: profileByEmail } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", session.customer_details.email.toLowerCase())
            .maybeSingle();

          if (profileByEmail) {
            userId = profileByEmail.id;
            console.log(`Found profile by email ${session.customer_details.email}: ${userId}`);
          }
        }

        if (!userId) {
          console.error(`Could not find profile for checkout session ${session.id}`);
          break;
        }

        // Retrieve full subscription details
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const plan = subscription.metadata?.plan || "starter";
        const planAmount = subscription.items.data[0]?.price?.unit_amount || 0;

        const updateData: Record<string, any> = {
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscription.id,
          stripe_subscription_status: subscription.status === "active" || subscription.status === "trialing" ? "active" : subscription.status,
          stripe_subscription_plan: plan,
          stripe_subscription_amount: planAmount,
          stripe_subscription_interval: subscription.items.data[0]?.price?.recurring?.interval || "month",
          stripe_subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        };

        console.log(`Updating profile ${userId} with:`, JSON.stringify(updateData));

        const { error: updateError } = await supabase
          .from("profiles")
          .update(updateData)
          .eq("id", userId);

        if (updateError) {
          console.error(`Failed to update profile for checkout session ${session.id}:`, updateError);
        } else {
          console.log(`Profile updated successfully for user ${userId}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});