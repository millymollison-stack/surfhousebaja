import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, Loader, AlertCircle, Check } from 'lucide-react';

declare global {
  interface Window {
    Stripe: any;
  }
}

interface PaymentFormProps {
  bookingId: string;
  amount: number;
  propertyTitle: string;
  dates: string;
  onPaymentSuccess: () => void;
  onPaymentError: (error: string) => void;
}

export function PaymentForm({
  bookingId,
  amount,
  propertyTitle,
  dates,
  onPaymentSuccess,
  onPaymentError
}: PaymentFormProps) {
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'succeeded' | 'failed'>('idle');
  const [elements, setElements] = useState<any>(null);
  const [stripe, setStripe] = useState<any>(null);
  const [elementReady, setElementReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentElementRef = useRef<any>(null);
  const paymentContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeStripe();
  }, []);

  useEffect(() => {
    if (stripe && clientSecret && !elements) {
      let timeoutId: NodeJS.Timeout;
      let checkIntervalId: NodeJS.Timeout;

      const mountPaymentElement = async () => {
        try {
          setError(null);
          setElementReady(false);

          console.log('[PaymentForm] Creating Stripe elements with clientSecret');
          console.log('[PaymentForm] ClientSecret preview:', clientSecret.substring(0, 20) + '...');

          const elementsInstance = stripe.elements({
            clientSecret: clientSecret,
            appearance: {
              theme: 'stripe'
            }
          });

          console.log('[PaymentForm] Creating payment element');

          const paymentElement = elementsInstance.create('payment', {
            layout: 'tabs',
            defaultValues: {
              billingDetails: {
                address: {
                  country: 'US'
                }
              }
            }
          });

          console.log('[PaymentForm] Payment element created, now mounting');

          // Check for console errors
          const originalError = console.error;
          console.error = function(...args) {
            if (args[0]?.toString().includes('stripe') || args[0]?.toString().includes('payment')) {
              console.log('[PaymentForm] Caught Stripe-related error:', args);
            }
            originalError.apply(console, args);
          };

          // Set a timeout for element loading
          timeoutId = setTimeout(() => {
            if (!elementReady) {
              console.error('[PaymentForm] Payment element failed to load within 15 seconds');
              setError('Payment form timed out loading. Your Stripe keys may be mismatched. Please contact support.');
              if (paymentElementRef.current) {
                try {
                  paymentElementRef.current.unmount();
                  paymentElementRef.current = null;
                } catch (e) {
                  console.error('Error unmounting on timeout:', e);
                }
              }
              setElements(null);
            }
          }, 15000);

          // Check periodically if iframe loaded
          checkIntervalId = setInterval(() => {
            if (paymentContainerRef.current) {
              const iframe = paymentContainerRef.current.querySelector('iframe');
              console.log('[PaymentForm] Iframe check:', !!iframe);
              if (iframe) {
                console.log('[PaymentForm] Iframe found, src:', iframe.src);
              }
            }
          }, 2000);

          if (paymentContainerRef.current) {
            console.log('[PaymentForm] Mounting to container');
            paymentElement.mount(paymentContainerRef.current);
            paymentElementRef.current = paymentElement;

            // Check immediately after mount
            setTimeout(() => {
              if (paymentContainerRef.current) {
                const iframe = paymentContainerRef.current.querySelector('iframe');
                console.log('[PaymentForm] Immediate iframe check (500ms after mount):', !!iframe);
                if (iframe) {
                  console.log('[PaymentForm] Iframe src:', iframe.src);
                  console.log('[PaymentForm] Iframe ready state:', (iframe as any).readyState);
                } else {
                  console.error('[PaymentForm] No iframe created! This means Stripe Elements failed to initialize.');
                  console.error('[PaymentForm] Possible causes:');
                  console.error('[PaymentForm] 1. Publishable key and secret key are from different Stripe accounts');
                  console.error('[PaymentForm] 2. Invalid Stripe keys');
                  console.error('[PaymentForm] 3. Network blocking Stripe CDN');
                }
              }
            }, 500);

            paymentElement.on('ready', () => {
              console.log('[PaymentForm] ✓ Payment element is ready!');
              clearTimeout(timeoutId);
              clearInterval(checkIntervalId);
              setElementReady(true);
            });

            paymentElement.on('loaderror', (event: any) => {
              console.error('[PaymentForm] Payment element load error:', event);
              clearTimeout(timeoutId);
              clearInterval(checkIntervalId);
              setError(`Failed to load payment form: ${event.error?.message || 'Unknown error'}`);
              setElementReady(false);
            });

            paymentElement.on('change', (event: any) => {
              console.log('[PaymentForm] Payment element changed:', event.complete);
            });

            paymentElement.on('focus', () => {
              console.log('[PaymentForm] Payment element focused');
            });

            paymentElement.on('blur', () => {
              console.log('[PaymentForm] Payment element blurred');
            });

            setElements(elementsInstance);
            console.log('[PaymentForm] Mount complete, waiting for ready event');
            console.log('[PaymentForm] If no iframe appears within 500ms, your Stripe keys are likely mismatched');
          }
        } catch (error: any) {
          console.error('[PaymentForm] Failed to mount payment element:', error);
          console.error('[PaymentForm] Error stack:', error.stack);
          clearTimeout(timeoutId);
          clearInterval(checkIntervalId);
          setError(error.message || 'Failed to load payment form');
          onPaymentError('Failed to load payment form');
        }
      };

      mountPaymentElement();

      return () => {
        clearTimeout(timeoutId);
        clearInterval(checkIntervalId);
      };
    }

    return () => {
      if (paymentElementRef.current) {
        try {
          paymentElementRef.current.unmount();
          paymentElementRef.current = null;
        } catch (error) {
          console.error('Error unmounting payment element:', error);
        }
      }
    };
  }, [stripe, clientSecret, elements]);

  const initializeStripe = async () => {
    try {
      const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      console.log('[PaymentForm] Initializing Stripe...');
      console.log('[PaymentForm] Stripe key exists:', !!stripeKey);
      console.log('[PaymentForm] Stripe global available:', !!window.Stripe);

      if (!stripeKey) {
        throw new Error('Stripe publishable key is not configured');
      }

      if (!stripeKey.startsWith('pk_')) {
        throw new Error('Invalid Stripe publishable key format');
      }

      if (!window.Stripe) {
        throw new Error('Stripe.js failed to load. Please check your internet connection and refresh the page.');
      }

      const stripeInstance = window.Stripe(stripeKey);
      console.log('[PaymentForm] Stripe instance created:', !!stripeInstance);

      if (!stripeInstance) {
        throw new Error('Failed to initialize Stripe. This may be due to an invalid API key or network issue.');
      }

      setStripe(stripeInstance);
    } catch (error: any) {
      console.error('[PaymentForm] Failed to load Stripe:', error);
      setError(error.message || 'Failed to initialize payment system');
      onPaymentError('Failed to initialize payment system');
    }
  };

  const createPaymentIntent = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      console.log('[PaymentForm] Creating payment intent for booking:', bookingId);

      const authKey = Object.keys(localStorage).find(key =>
        key.startsWith('sb-') && key.includes('-auth-token')
      );

      if (!authKey) {
        throw new Error('No authentication session found. Please sign in again.');
      }

      const authData = JSON.parse(localStorage.getItem(authKey) || '{}');
      const accessToken = authData?.access_token;

      if (!accessToken) {
        throw new Error('No authentication token found. Please sign in again.');
      }

      console.log('[PaymentForm] Calling create-payment-intent edge function');

      const response = await fetch(`${supabaseUrl}/functions/v1/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          bookingId,
          amount,
          propertyTitle,
          dates
        }),
      });

      console.log('[PaymentForm] Payment intent response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create payment intent' }));
        console.error('[PaymentForm] Payment intent error response:', errorData);
        throw new Error(errorData.error || 'Failed to create payment intent');
      }

      const data = await response.json();
      console.log('[PaymentForm] Payment intent created successfully');

      if (!data.clientSecret) {
        throw new Error('Invalid response from payment server - missing client secret');
      }

      console.log('[PaymentForm] Client secret received, length:', data.clientSecret?.length);
      setClientSecret(data.clientSecret);
    } catch (error: any) {
      console.error('Payment intent error:', error);
      setError(error.message || 'Failed to initialize payment');
      onPaymentError(error.message || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !elementReady) {
      setError('Payment form is not ready. Please wait or refresh the page.');
      return;
    }

    setPaymentStatus('processing');
    setError(null);

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Payment processing timed out')), 60000);
      });

      const paymentPromise = stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });

      const result: any = await Promise.race([paymentPromise, timeoutPromise]);

      if (result.error) {
        setPaymentStatus('failed');
        setError(result.error.message || 'Payment failed');
        onPaymentError(result.error.message || 'Payment failed');
      } else if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
        setPaymentStatus('succeeded');
        onPaymentSuccess();
      } else {
        setPaymentStatus('failed');
        setError('Payment processing failed. Please try again.');
        onPaymentError('Payment processing failed');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      setPaymentStatus('failed');
      setError(error.message || 'An unexpected error occurred');
      onPaymentError(error.message || 'An unexpected error occurred');
    }
  };

  if (!clientSecret) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium mb-4">Payment</h3>
        <p className="text-gray-600 mb-4">
          To secure your booking, please complete payment of ${amount.toFixed(2)}.
        </p>

        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <p className="ml-3 text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <button
          onClick={createPaymentIntent}
          disabled={loading || !!error}
          className="w-full flex justify-center items-center space-x-2 px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C47756] disabled:bg-[var(--brand-disabled)] disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader className="h-5 w-5 animate-spin" />
              <span>Loading...</span>
            </>
          ) : (
            <>
              <CreditCard className="h-5 w-5" />
              <span>Proceed to Payment</span>
            </>
          )}
        </button>
      </div>
    );
  }

  if (paymentStatus === 'succeeded') {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center space-x-3 text-green-600">
          <Check className="h-8 w-8" />
          <div>
            <h3 className="text-lg font-medium">Payment Successful!</h3>
            <p className="text-sm text-gray-600 mt-1">Your booking has been confirmed.</p>
          </div>
        </div>
      </div>
    );
  }

  const retryLoadingPaymentForm = () => {
    setError(null);
    setElements(null);
    setElementReady(false);
    setClientSecret(null);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-medium mb-4">Complete Payment</h3>
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <div ref={paymentContainerRef} className="min-h-[200px]" />
          {!elementReady && !error && (
            <div className="flex items-center justify-center min-h-[200px] -mt-[200px]">
              <div className="flex flex-col items-center space-y-2">
                <div className="spinner-ring" />
                <p className="text-sm text-gray-600">Loading payment form...</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-4">
            <div className="flex flex-col">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <p className="ml-3 text-sm text-red-700">{error}</p>
              </div>
              <button
                type="button"
                onClick={retryLoadingPaymentForm}
                className="mt-3 text-sm text-[var(--brand)] hover:text-[var(--brand-hover)] underline self-start ml-8"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {paymentStatus === 'failed' && (
          <div className="rounded-md bg-red-50 p-4 mb-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <p className="ml-3 text-sm text-red-700">
                Payment failed. Please try again.
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!stripe || !elements || !elementReady || paymentStatus === 'processing' || !!error}
          className="w-full flex justify-center items-center space-x-2 px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C47756] disabled:bg-[var(--brand-disabled)] disabled:cursor-not-allowed"
        >
          {paymentStatus === 'processing' ? (
            <>
              <Loader className="h-5 w-5 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <CreditCard className="h-5 w-5" />
              <span>Pay ${amount.toFixed(2)}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
