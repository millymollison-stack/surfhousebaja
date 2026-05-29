import React, { useState, useEffect, useRef } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { CreditCard, Loader, AlertCircle, Check, ShieldCheck } from 'lucide-react';
import { stripePromise } from '../lib/stripe';
import { supabase } from '../lib/supabase';

interface PaymentFormProps {
  bookingId: string;
  amount: number;
  propertyTitle: string;
  dates: string;
  onPaymentSuccess: () => void;
  onPaymentError: (error: string) => void;
}

// ─── CheckoutForm ─────────────────────────────────────────────────────────────
function CheckoutForm({
  amount,
  onPaymentSuccess,
  onPaymentError,
}: {
  amount: number;
  onPaymentSuccess: () => void;
  onPaymentError: (error: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [ready, setReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe) { setError('Payment system not ready.'); return; }
    if (!elements) { setError('Card fields not loaded.'); return; }

    setProcessing(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: window.location.href },
    });

    if (confirmError) {
      const msg = confirmError.message || 'Payment failed. Please try again.';
      setError(msg);
      onPaymentError(msg);
      setProcessing(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      setSucceeded(true);
      onPaymentSuccess();
    } else {
      const msg = `Payment status: ${paymentIntent?.status || 'unknown'}. Please try again.`;
      setError(msg);
      onPaymentError(msg);
    }
    setProcessing(false);
  };

  if (succeeded) {
    return (
      <div className="flex items-center gap-3 text-green-600 p-4 bg-green-50 rounded-lg">
        <Check className="h-8 w-8 flex-shrink-0" />
        <div>
          <p className="font-semibold text-base">Payment Successful!</p>
          <p className="text-sm text-gray-600 mt-0.5">Your booking has been confirmed.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="relative">
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-white rounded-lg z-10 border border-gray-200 min-h-[180px]">
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Loader className="h-5 w-5 animate-spin" />
              <span className="text-xs">Loading card fields…</span>
            </div>
          </div>
        )}
        <div className="p-4 border border-gray-200 rounded-lg bg-white min-h-[180px]">
          <PaymentElement
            onReady={() => setReady(true)}
            options={{
              layout: 'tabs',
              defaultValues: { billingDetails: { address: { country: 'US' } } },
            }}
          />
        </div>
      </div>

      {error && (
        <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || processing || !ready}
        className="w-full flex justify-center items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {processing ? (
          <><Loader className="h-4 w-4 animate-spin" />Processing…</>
        ) : (
          <><CreditCard className="h-4 w-4" />Pay ${amount.toFixed(2)}</>
        )}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Secured by Stripe · Card, Apple Pay, Google Pay
      </div>
    </form>
  );
}

// ─── PaymentForm (outer) ──────────────────────────────────────────────────────
export function PaymentForm({
  bookingId,
  amount,
  propertyTitle,
  dates,
  onPaymentSuccess,
  onPaymentError,
}: PaymentFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;

    async function init() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        if (!cancelled) { setError('Please sign in to complete payment.'); setLoading(false); }
        return;
      }

      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-intent`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ bookingId, amount, propertyTitle, dates }),
        });

        const json = await res.json();
        if (!res.ok || !json?.clientSecret) {
          if (!cancelled) { setError(json?.error || 'Failed to initialize payment.'); setLoading(false); }
          return;
        }

        if (!cancelled) setClientSecret(json.clientSecret);
      } catch (err: any) {
        if (!cancelled) { setError(err?.message || 'Network error'); setLoading(false); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [bookingId]);

  return (
    <div className="bg-white rounded-lg space-y-5">
      {/* Booking summary */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Complete Payment</h3>
        <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Property</span>
            <span className="font-medium text-gray-900 text-right max-w-[60%]">{propertyTitle}</span>
          </div>
          {dates && (
            <div className="flex justify-between">
              <span className="text-gray-500">Dates</span>
              <span className="font-medium text-gray-900 text-right">{dates}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-gray-200">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-bold text-[var(--brand)] text-base">${amount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-gray-400">
          <Loader className="h-6 w-6 animate-spin" />
          <p className="text-sm">Preparing payment…</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {clientSecret && !loading && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: '#C47756',
                borderRadius: '8px',
                fontFamily: 'inherit',
              },
            },
          }}
        >
          <CheckoutForm
            amount={amount}
            onPaymentSuccess={onPaymentSuccess}
            onPaymentError={onPaymentError}
          />
        </Elements>
      )}
    </div>
  );
}