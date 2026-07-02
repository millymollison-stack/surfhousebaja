import React, { useState, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import './styles.css';
import './OnboardingPopup.css';
import { TemplatePreview } from './TemplatePreview';
import { FontDropdown } from './FontDropdown';
import { FONT_OPTIONS, applyFontAccent } from '../lib/fontAccent';
import { supabase } from '../lib/supabase';
import { saveBrandColor } from '../lib/brandColor';

import { useAuth } from '../store/auth';
import { StripeConnectSetup } from './StripeConnectSetup';
import { createSlug } from '../services/slugService';
import { createNewSiteRecords, deployViaUploadPhp } from '../services/p';

// Color utility: adjust hex brightness
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(2.55 * percent)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + Math.round(2.55 * percent)));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + Math.round(2.55 * percent)));
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export interface OnboardingPopupProps {
 onComplete?: (data: any) => void;
 onImported?: (data: any) => void;
 onClose?: () => void;
 scrapedProperty?: any | null;
 onSiteNameChange?: (name: string) => void;
 scrapedImages?: any[];
 onOpenSidebar?: () => void;
}

// Persisted flag: survives across remounts (key changes) so user-closed state is not lost
const POPUP_CLOSED_KEY = 'onboarding_popup_closed';

// ── User-scoped sessionStorage helpers ─────────────────────────────────────────
// Keys are prefixed with user ID so different users on the same browser don't share state
export function popupGet(userId: string, key: string): string | null {
  return sessionStorage.getItem(`popup_${userId}_${key}`);
}
export function popupSet(userId: string, key: string, value: string): void {
  sessionStorage.setItem(`popup_${userId}_${key}`, value);
}
export function popupRemove(userId: string, key: string): void {
  sessionStorage.removeItem(`popup_${userId}_${key}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert any string to a URL-safe slug */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')     // remove non-alphanumeric (keep spaces/hyphens)
    .trim()
    .replace(/\s+/g, '-')             // spaces → hyphens
    .replace(/-+/g, '-');              // collapse multiple hyphens
}

// ── Paddle Configuration ────────────────────────────────────────────────────
const PADDLE_VENDOR_ID = '353043';
const PADDLE_CLIENT_TOKEN = 'live_c9152e76d51ef908b8697afd399';

// Paddle price IDs for each plan (created in Paddle dashboard)
const PADDLE_PRODUCT_IDS: Record<string, string> = {
  starter: 'pri_01ktd2rqyavf5v90dnd73g6ycb',
  pro:     'pri_01ktd2ghpxztrenwpb813whw4g',
  agency:  'pri_01ktd2tc1f7zmgrshs77vt55d0',
};

declare global {
  interface Window {
    Paddle?: typeof import('paddle-js').default;
  }
}

// ── Stripe CheckoutForm (must be inside <Elements> context) ─────────────────
function CheckoutForm({ clientSecret, onSuccess, onError, monthlyTotal }: {
  clientSecret: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
  monthlyTotal: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);

    // Must call submit() before confirmPayment() per Stripe.js v3 migration
    await elements.submit();

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + '?paid=true' },
      redirect: 'if_required',
    });

    setProcessing(false);
    if (error) {
      console.error('[Stripe confirmPayment error]', error.code, error.type, error.message);

      // Handle PaymentIntent in unexpected state (e.g. already confirmed, failed, etc.)
      // On retry with the same clientSecret, Stripe returns 400 because the PI is no longer
      // in a confirmable state. Request a fresh PaymentIntent from the edge function.
      if (error.type === 'card_error' &&
          (error.code === 'payment_intent_unexpect_state' || error.code === 'payment_intent_invalid_state')) {
        // Call the parent to create a new checkout session and get a fresh clientSecret
        onError('RETRY_NEEDED');
        return;
      }

      onError(error.message || 'Payment failed.');
    } else {
      onSuccess();
      window.dispatchEvent(new CustomEvent('subscription-updated'));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="stripe-checkout-form">
      <div className="stripe-card-label">
        <div className="stripe-card-title">Card details</div>
        <p className="stripe-consent-note">By clicking Pay, you allow propbook.pro to charge your card for the amount shown, according to the terms of your subscription.</p>
        <div className="stripe-card-field">
          <PaymentElement options={{ layout: 'tabs' }} />
        </div>
      </div>
      <button
        type="submit"
        disabled={!stripe || processing}
        className="btn"
        style={{ width: '100%', fontSize: '1rem' }}
      >
        {processing ? 'Processing subscription...' : `Pay ${monthlyTotal === 0 ? 'Free today' : `$${monthlyTotal}`}`}
      </button>
    </form>
  );
}

export function OnboardingPopup({ onComplete, onImported, onClose, scrapedProperty, scrapedImages, onSiteNameChange, onOpenSidebar }: OnboardingPopupProps) {
 const { user, refreshUser } = useAuth();
 const [isOpen, setIsOpen] = useState(false);
 // Tracks whether this popup instance is still mounted (used to cancel auto-open timer on unmount)
 const isMountedRef = useRef(true);
 const descSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

 // Hide payment calculator banner for users who already have an active subscription
 const [isSubscribed, setIsSubscribed] = useState(false);
 useEffect(() => {
   if (!user?.id) return;
   supabase.from('profiles').select('stripe_subscription_status').eq('id', user.id).single()
     .then(({ data }) => {
       if (data?.stripe_subscription_status === 'active' || data?.stripe_subscription_status === 'trialing') {
         setIsSubscribed(true);
         document.documentElement.setAttribute('data-has-subscription', 'true');
       }
     });
 }, [user?.id]);


 // User-scoped sessionStorage — keys are scoped to user.id so different users on same browser don't share data
 const uid = user?.id ?? 'anon';
 const ssGet = (k: string) => sessionStorage.getItem(`popup_${uid}_${k}`);
 const ssSet = (k: string, v: string) => sessionStorage.setItem(`popup_${uid}_${k}`, v);
 const ssRem = (k: string) => sessionStorage.removeItem(`popup_${uid}_${k}`);
 const ssGetRaw = (k: string) => sessionStorage.getItem(k);
 const ssSetRaw = (k: string, v: string) => sessionStorage.setItem(k, v);
 const ssRemRaw = (k: string) => sessionStorage.removeItem(k);

 // Inline auth state
 const [authEmail, setAuthEmail] = useState('');
 const [authPassword, setAuthPassword] = useState('');
 const [authFullName, setAuthFullName] = useState('');
 const [authPhone, setAuthPhone] = useState('');
 const [authError, setAuthError] = useState('');
 const [authLoading, setAuthLoading] = useState(false);

 const handleSignUp = async () => {
   if (!authEmail || !authPassword || !authFullName) {
     setAuthError('Please fill in all fields.');
     return;
   }
   setAuthLoading(true);
   setAuthError('');
   try {
     const { data: { user: newUser }, error } = await supabase.auth.signUp({
       email: authEmail,
       password: authPassword,
       options: { data: { full_name: authFullName, phone_number: authPhone } },
     });
     if (error) throw error;
     if (newUser) {
       await supabase.from('profiles').upsert({
         id: newUser.id,
         email: authEmail,
         full_name: authFullName,
         phone_number: authPhone,
         role: 'admin',
       }, { onConflict: 'id' });
       setAccountCreated(true);
       await refreshUser();
     }
   } catch (e: any) {
     setAuthError(e.message || 'Could not create account.');
   } finally {
     setAuthLoading(false);
   }
 };

 const handleSignIn = async () => {
   if (!authEmail || !authPassword) {
     setAuthError('Please enter your email and password.');
     return;
   }
   setAuthLoading(true);
   setAuthError('');
   try {
     const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
     if (error) throw error;
     await refreshUser();
     setAccountCreated(false);
   } catch (e: any) {
     setAuthError(e.message || 'Could not sign in. Check your credentials.');
   } finally {
     setAuthLoading(false);
   }
 };

 const [bookingsEmail, setBookingsEmail] = useState('');
 const [bankChoice, setBankChoice] = useState('');
 const [designChoice, setDesignChoice] = useState('');
 const [websiteName, setWebsiteName] = useState('');
 const [websiteDesc, setWebsiteDesc] = useState('');
 const [descInitialized, setDescInitialized] = useState(false);
 const [hostingChoice, setHostingChoice] = useState('');
 const [planChoice, setPlanChoice] = useState('');
 const [extras, setExtras] = useState({ seo: false, ads: false, analytics: false, social: false });
 const [agreed, setAgreed] = useState(false);
 const [stripeError, setStripeError] = useState('');
 // ── Paddle Overlay Checkout ─────────────────────────────────────────────────
 const openPaddleCheckout = async () => {
   console.log('[openPaddleCheckout] running...');
   if (!user) {
     setStripeError('Please sign in or create an account above first.');
     return;
   }
   if (!planChoice) {
     setStripeError('Please select a subscription plan first.');
     return;
   }
   if (!window.Paddle) {
     setStripeError('Payment system is loading. Please wait a moment and try again.');
     return;
   }
   setStripeError('');

   // Save form data before opening overlay
   try {
     await saveToSupabase();
   } catch(e) {
     console.error('[openPaddleCheckout] saveToSupabase failed:', e);
     console.log('[openPaddleCheckout] continuing anyway...');
   }

   const productId = PADDLE_PRODUCT_IDS[planChoice];
   if (!productId) {
     setStripeError('Invalid plan selected. Please choose Starter, Pro, or Agency.');
     return;
   }

   const paddle = window.Paddle;
   console.log('[openPaddleCheckout] Opening checkout for product:', productId, 'plan:', planChoice);

   // Override the checkout closed event to capture transaction info
   const originalCheckout = paddle.Checkout?.open;

   try {
     paddle.Checkout.open({
       items: [{ priceId: productId }],
       customData: {
         user_id: user.id,
         email: user.email,
         plan: planChoice,
       },
       customer: {
         email: user.email,
       },
       settings: {
         displayMode: 'overlay',
         theme: 'light',
         locale: 'en',
         successUrl: window.location.origin + '?paddle_success=true',
       },
       eventCallback: (event: any) => {
         console.log('[Paddle event]', event.name, JSON.stringify(event.data));
         if (event.name === 'checkout.closed') {
           const detail = event.data;
           // Dispatch our own event for the useEffect listener
           window.dispatchEvent(new CustomEvent('paddle-checkout-closed', { detail }));
         }
       },
     });
   } catch(e) {
     console.error('[openPaddleCheckout] Paddle.Checkout.open error:', e);
     setStripeError('Could not open payment checkout. Please try again.');
   }
 };

 const openStripeGateway = async (e?: React.MouseEvent) => {
  if (e) e.stopPropagation();
  // Guard: prevent double-fire from rapid clicks
  stripeRedirectRef.current++;
  if (stripeRedirectRef.current > 1) {
    console.log('[openStripeGateway] already in flight — ignoring duplicate click');
    stripeRedirectRef.current--;
    return;
  }
  console.log('[openStripeGateway] running...');
  // Clear any stale Stripe redirect state from previous page loads
  sessionStorage.removeItem('stripe_payment_returning');
  sessionStorage.removeItem('stripe_redirect_initiated');
  // Re-save popup_website_name from current React state so it's fresh when we return from Stripe
  ssSet('website_name', websiteName);
  console.log('[openStripeGateway] clicked, user:', !!user, 'planChoice:', planChoice);
   if (!user) {
     setStripeError('Please sign in or create an account above first.');
     return;
   }
   if (!planChoice) {
     setStripeError('Please select a subscription plan first.');
     return;
   }
   setStripeError('');

   // Validate required fields before calling edge function
   const slugValue = generateSlug(websiteName) || 'mysite';
   const userIdValue = user?.id;
   if (!userIdValue) {
     setStripeError('User not authenticated. Please sign in again.');
     return;
   }
   console.log('[openStripeGateway] validated — userId:', userIdValue, 'slug:', slugValue);

   // NON-BLOCKING SAVE: fire-and-forget with 5s timeout — Stripe redirect must always proceed.
   // Data is re-saved on RETURN from Stripe in the ?paid=true handler, so missing
   // the pre-redirect save is non-fatal.
   console.log('[openStripeGateway] Saving scraped data to DB before Stripe redirect (non-blocking)...');
   const saveTimeout = setTimeout(() => console.warn('[openStripeGateway] saveToSupabase timed out — proceeding anyway'), 5000);
   saveToSupabase().finally(() => clearTimeout(saveTimeout));
   console.log('[openStripeGateway] DB save fired — proceeding to Stripe redirect');
   // Timeout wrapper — if fetch takes >15s, treat as network error
   const fetchWithTimeout = (url: string, opts: RequestInit, timeoutMs = 20000) =>
     Promise.race([
       fetch(url, opts),
       new Promise((_, reject) => setTimeout(() => reject(new Error('fetch timeout')), timeoutMs)),
     ]);

   try {
     const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
     const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

     const activeExtras: string[] = [];
     if (extras.seo) activeExtras.push('seo');
     if (extras.ads) activeExtras.push('ads');
     if (extras.analytics) activeExtras.push('analytics');
     if (extras.social) activeExtras.push('social');

     const sessionResult = await supabase.auth.getSession();
     console.log('[openStripeGateway] session token:', sessionResult.data.session?.access_token ? 'present' : 'MISSING');

     console.log('[openStripeGateway] calling edge function...');
     const res = await fetchWithTimeout(`${supabaseUrl}/functions/v1/stripe-subscription`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${sessionResult.data.session?.access_token}`,
         'Apikey': supabaseAnonKey,
       },
       body: JSON.stringify({
         action: 'create_checkout_session',
         plan: planChoice,
         hosting_choice: hostingChoice,
         extras: activeExtras,
         include_scrape: designChoice === 'airbnb',
         email: user.email,
         user_id: userIdValue,
         slug: slugValue, // needed for post-payment deploy trigger
         return_url: window.location.origin + window.location.pathname + '?paid=true',
       }),
     });
     console.log('[openStripeGateway] response:', res.status, res.ok);
     const data = await res.json();
     console.log('[openStripeGateway] data:', JSON.stringify(data));

     // Guard: ensure session was actually created before redirecting to Stripe
     if (!data.sessionId || !data.url) {
       const errMsg = data.error || (res.ok ? 'No checkout session created. Please try again.' : `Server error: ${res.status}`);
       console.error('[openStripeGateway] ❌ Checkout session missing:', errMsg);
       setStripeError(errMsg);
       setStripeProcessing(false);
       return;
     }

     // Persist session_id so the ?paid=true handler survives Vite HMR reloads
     // that can fire after the Stripe redirect and wipe URL params
     // Guard against the literal string "undefined" which can happen if Stripe
     // returns a malformed response
     const safeSessionId = String(data.sessionId ?? '');
     if (!safeSessionId || safeSessionId === 'undefined') {
       setStripeError('Payment session could not be created. Please try again.');
       setStripeProcessing(false);
       return;
     }
     sessionStorage.setItem('stripe_session_id', safeSessionId);
     sessionStorage.setItem('stripe_redirect_initiated', myTabId);
     console.log('[DEBUG] stripe_session_id saved=', safeSessionId, ', redirect href=', data.url);
     window.location.href = data.url; // Redirect to Stripe — return redirect is disabled
   } catch(e: any) {
     console.error('[openStripeGateway] error:', e.message || e);
     setStripeError(e.message === 'fetch timeout'
       ? 'Connection timed out. Check your network and try again.'
       : 'Could not connect to payment server. (' + (e.message || String(e)) + ')');
   } finally {
     stripeRedirectRef.current--; // decrement so next click can proceed
     setStripeProcessing(false); // ALWAYS reset — prevents stuck button
   }
 };

 const [showStripeModal, setShowStripeModal] = useState(false);
 const [stripeClientSecret, setStripeClientSecret] = useState('');
 const [stripePayMethod, setStripePayMethod] = useState<'card' | 'paypal' | 'venmo'>('card');
 const [stripeSubscriptionId, setStripeSubscriptionId] = useState('');
 const [showCongrats, setShowCongrats] = useState(false);
 const [congratsUrl, setCongratsUrl] = useState('');
 const [showBuilding, setShowBuilding] = useState(false);
 const [buildingCountdown, setBuildingCountdown] = useState(40);
 const [deployUrl, setDeployUrl] = useState('');
 const [stripeProcessing, setStripeProcessing] = useState(false);
// Synchronous guard against double-click: ref is incremented before each redirect attempt
// and decremented after. Only >1 means a redirect is already in flight.
const stripeRedirectRef = useRef(0);
 const [accountCreated, setAccountCreated] = useState(false);
 const [popupConnectAccountId, setPopupConnectAccountId] = useState<string | null>(null);
 const [savingSite, setSavingSite] = useState(false);

 // ── Listen for Stripe Connect account ID broadcast from sidebar ─────────────
 useEffect(() => {
   const handler = (e: Event) => {
     const d = (e as CustomEvent).detail;
     if (d?.account_id) setPopupConnectAccountId(d.account_id);
   };
   window.addEventListener('stripe-connect-updated', handler);
   return () => window.removeEventListener('stripe-connect-updated', handler);
 }, []);
 const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

 // ── Load Paddle.js script ──────────────────────────────────────────────────
 useEffect(() => {
   // Only load once
   if (document.querySelector('script[src*="paddle.com"]')) return;

   const script = document.createElement('script');
   script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
   script.setAttribute('data-url', 'https://cdn.paddle.com');
   script.async = true;
   script.onload = () => {
     console.log('[Paddle] Script loaded');
     if (window.Paddle) {
       window.Paddle.Initialize({
         token: PADDLE_CLIENT_TOKEN,
       });
       console.log('[Paddle] Initialized with client token, vendor:', PADDLE_VENDOR_ID);
     }
   };
   document.body.appendChild(script);
 }, []);

 // ── Listen for Paddle checkout.closed events ──────────────────────────────
 useEffect(() => {
   const handler = (event: Event) => {
     const detail = (event as CustomEvent).detail;
     console.log('[Paddle checkout.closed]', JSON.stringify(detail));

     // detail = { transaction: { id: 'xxx', status: 'completed' } }
     if (detail?.transaction?.id && detail.transaction.status === 'completed') {
       const transactionId = detail.transaction.id;
       console.log('[Paddle] Transaction completed:', transactionId);

       // Verify and update profile via edge function
       (async () => {
         try {
           const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
           const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
           const { data: { session } } = await supabase.auth.getSession();
           if (!session?.user) return;

           setStripeProcessing(true);

           const res = await fetch(`${supabaseUrl}/functions/v1/paddle-verification`, {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${session.access_token}`,
               'Apikey': supabaseAnonKey,
             },
             body: JSON.stringify({
               transaction_id: transactionId,
               plan: planChoice,
             }),
           });

           const data = await res.json();
           console.log('[Paddle] Verification result:', JSON.stringify(data));

           if (data.success) {
             await refreshUser();
             window.dispatchEvent(new CustomEvent('subscription-updated', {
               detail: { transaction_id: transactionId, status: 'active' },
             }));
             setShowCongrats(true);
             setIsOpen(true);
           } else {
             setStripeError('Payment could not be confirmed. Please contact support.');
           }
         } catch (err) {
           console.error('[Paddle] Verification error:', err);
           setStripeError('Payment verified but failed to update. Please refresh.');
         } finally {
           setStripeProcessing(false);
         }
       })();
     }
   };

   window.addEventListener('paddle-checkout-closed', handler);
   return () => window.removeEventListener('paddle-checkout-closed', handler);
 }, [planChoice]);

 // Payment calculator
 const pricing = {
 scrape: 10, // one-time Airbnb scrape fee
 plans: { starter: 10, pro: 30, agency: 150 },
 hosting: { own: 0, our: 5 },
 extras: { seo: 10, ads: 30, analytics: 20, social: 50 },
 };
 const scrapeFee = designChoice === 'airbnb' ? pricing.scrape : 0;

 const fontOptions = FONT_OPTIONS;
 // First month free credit for Starter plan — stored in cents so it matches pricing.plans values
 const TRIAL_CREDIT = planChoice === 'starter' ? (pricing.plans.starter * 100) : 0;

 // Load saved font accent on mount
 useEffect(() => {
 const saved = localStorage.getItem('site-font-accent');
 if (saved) {
 setFontAccent(saved);
 applyFontAccent(saved);
 }
 }, []);

 const monthlyTotal = (pricing.plans[planChoice as keyof typeof pricing.plans] || 0)
 + (pricing.hosting[hostingChoice as keyof typeof pricing.hosting] || 0)
 + (extras.seo ? pricing.extras.seo : 0)
 + (extras.ads ? pricing.extras.ads : 0)
 + (extras.analytics ? pricing.extras.analytics : 0)
 + (extras.social ? pricing.extras.social : 0);

 // Amount shown in banner (after trial credit for Starter)
 const displayedTotal = scrapeFee + Math.max(0, monthlyTotal - (TRIAL_CREDIT / 100));
 const hasPlan = !!planChoice;
 const hasScrape = designChoice === 'airbnb';

 // Airbnb scrape state
 const [airbnbUrl, setAirbnbUrl] = useState('');
 const [isImporting, setIsImporting] = useState(false);
 const [countdown, setCountdown] = useState(0);
 const [importError, setImportError] = useState('');
 const [scrapedData, setScrapedData] = useState<any>(null);
 const [showColorPicker, setShowColorPicker] = useState(false);
 const [brandColor, setBrandColor] = useState('#C47756');
 const [fontAccent, setFontAccent] = useState(
 typeof window !== 'undefined' ? localStorage.getItem('site-font-accent') || 'Playfair Display' : 'Playfair Display'
 );
 const [manualImages, setManualImages] = useState<string[]>([]);
 const [manualHeroImage, setManualHeroImage] = useState('');
 const [manualBase64Images, setManualBase64Images] = useState<string[]>([]);

 // Apply saved font accent on mount
 useEffect(() => {
 document.querySelectorAll('h1').forEach(el => {
 (el as HTMLElement).style.fontFamily = `'${fontAccent}', serif`;
 });
 }, []);

 const fileToBase64 = (file: File): Promise<string> =>
 new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = () => resolve(reader.result as string);
 reader.onerror = reject;
 reader.readAsDataURL(file);
 });


 // Initialize form fields from scraped property data passed from Home
 // NOTE: We do NOT pre-fill websiteName from scraped data — the user's typed
 // Website Name field is the one source of truth for the slug and must not be
 // overwritten by a scrape result. The slug is saved to popup_user_website_name
 // at Subscribe-click time, before any async scrape can change React state.

 const handleClose = () => {
 // Don't persist the closed state for active subscribers — their scraped data is
 // already saved and they need the popup to reopen on reload so they can publish.
 // Only set POPUP_CLOSED_KEY for non-subscribers (genuine first-time users who
 // haven't completed onboarding yet).
 (async () => {
 const { data: profile } = await supabase.from('profiles').select('stripe_subscription_status').eq('id', user?.id).maybeSingle();
 const isActive = profile?.stripe_subscription_status === 'active' || profile?.stripe_subscription_status === 'trialing';
 if (!isActive) {
 ssSet('closed', '1');
 }
 })();
 setIsOpen(false);
 if (onClose) onClose();
 };

 // ── loadSavedData ───────────────────────────────────────────────────────────────────
 // Extracted to component scope so it can be called from the ?paid=true handler
 // after Stripe returns, ensuring migration property data is loaded even when
 // scrapedProperty/scrapedImages deps haven't changed.
 async function loadSavedData() {
 // GUARD: Never open popup for active subscribers — they use the sidebar to edit/publish
 const { data: profileForGuard } = await supabase
   .from('profiles')
   .select('stripe_subscription_status')
   .eq('id', user?.id)
   .maybeSingle();
 const isActiveGuard = profileForGuard?.stripe_subscription_status === 'active' || profileForGuard?.stripe_subscription_status === 'trialing';

 // If parent has fresh scraped data, use it instead of stale saved data
 if (scrapedProperty) {
 const imgs = scrapedImages?.map((img: any) => img.url) || [];
 // Restore user's ORIGINAL website name (saved before scrape could overwrite it).
 // Use popup_user_website_name first, then fall back to scraped title.
 const userTypedName = ssGet('user_website_name');
 setWebsiteName(userTypedName || scrapedProperty.property_title || scrapedProperty.title || '');
 setScrapedData({
 title: scrapedProperty.property_title || scrapedProperty.title || '',
 location: scrapedProperty.location || '',
 description: scrapedProperty.property_intro || scrapedProperty.description || '',
 hero_image: imgs[0] || '',
 images: imgs,
 guests: scrapedProperty.max_guests || null,
 rating: null,
 reviews: null,
 host_name: null,
 });
 // Auto-open popup when scraped data arrives - but NOT for active subscribers and NOT if user explicitly closed it
 if (!isActiveGuard && !isOpen && !ssGet('closed')) {
 setIsOpen(true);
 }
 return;
 }

        const savedScraped = ssGet('scraped_data');
        if (savedScraped) {
          try {
            const parsed = JSON.parse(savedScraped);
            setScrapedData(parsed);
            // Restore user's typed website name first, fall back to scraped title
            const userTyped = ssGet('user_website_name');
            if (parsed.title) setWebsiteName(userTyped || parsed.title);
            if (parsed.description) setWebsiteDesc(parsed.description.slice(0, 200));
            // NOTE: onImported is NOT called here. Images are NOT uploaded and data is NOT
            // saved to DB at this stage. All of that happens ONLY when Subscribe is pressed.
          } catch { /* ignore corrupt JSON */ }
        }

        // ── After restoring all form fields, handle post-Stripe success ──────────
        if (sessionStorage.getItem('stripe_payment_done')) {
          sessionStorage.removeItem('stripe_payment_done');
          // Don't open popup for active subscribers — they use the sidebar
          if (!isActiveGuard && !isOpen) setIsOpen(true);
          setShowCongrats(true);
          const restoredName = ssGet('website_name') || 'surfhousebaja';
          if (onImported) {
            onImported({ title: restoredName, description: ssGet('website_desc') || '' });
          }

          // ── Load migration property data from Supabase ────────────────────────
          // This property (03fccab6) acts as staging for scraped data during the
          // Airbnb→Stripe flow. Load it so the form shows real property content.
          const MIGRATION_PROPERTY_ID = '03fccab6-a997-4a38-bb7f-4b3e7a6c09a8';
          const { data: migProp } = await supabase
            .from('properties')
            .select('*')
            .eq('id', MIGRATION_PROPERTY_ID)
            .single();
          if (migProp && migProp.property_title) {
            const { data: migImgs } = await supabase
              .from('property_images')
              .select('*')
              .eq('property_id', MIGRATION_PROPERTY_ID)
              .order('position');
            const imgUrls = (migImgs || []).map((img: any) => img.url);
            // Update scrapedData so the popup shows the migration property content
            setScrapedData({
              title: migProp.property_title || '',
              location: migProp.location || '',
              description: migProp.property_intro || migProp.description || '',
              hero_image: imgUrls[0] || '',
              images: imgUrls,
              guests: migProp.max_guests || null,
            });
            // Also notify parent (Home.tsx) so it can overlay the migration property
            if (onImported) {
              onImported({
                title: migProp.property_title || restoredName,
                description: migProp.property_intro || migProp.description || '',
                images: imgUrls,
                hero_image: imgUrls[0] || '',
                location: migProp.location || '',
                guests: migProp.max_guests || null,
              });
            }
          }

          return;
        }


 // Restore form field selections from sessionStorage (from before Stripe redirect)
 const savedPlan = ssGet('plan');
 if (savedPlan) setPlanChoice(savedPlan);
 const savedHosting = ssGet('hosting');
 if (savedHosting) setHostingChoice(savedHosting);
 const savedDesign = ssGet('design');
 if (savedDesign) setDesignChoice(savedDesign);
 const savedName = ssGet('website_name');
 if (savedName) setWebsiteName(savedName);
 const savedDesc = ssGet('website_desc');
 if (savedDesc) setWebsiteDesc(savedDesc);
 const savedExtras = ssGet('extras_seo');
 if (savedExtras) setExtras({ seo: savedExtras === 'true', ads: ssGet('extras_ads') === 'true', analytics: ssGet('extras_analytics') === 'true', social: ssGet('extras_social') === 'true' });

 // Only load onboarding_data for authenticated users with a real user ID.
 // Guard: skip if user is not yet authenticated to prevent empty-user_id records
 // in the DB from contaminating a fresh user.
 if (!user?.id) return;
 try {
 const { data, error } = await supabase
 .from('onboarding_data')
 .select('*')
 .eq('user_id', user.id)
 .maybeSingle();

 // Only load for authenticated users — skip if no real user ID (prevents
 // empty-user_id records in DB from contaminating a fresh signed-in user)

 if (error && error.code !== 'PGRST116') {
 console.warn('Could not load saved onboarding data:', error.message);
 return;
 }

 if (data) {
 // Populate form fields from saved data
 if (data.property_name) setWebsiteName(data.property_name);
 if (data.property_desc) setWebsiteDesc(data.property_desc);
 if (data.airbnb_url) setAirbnbUrl(data.airbnb_url);
 if (data.design_choice) setDesignChoice(data.design_choice);
 if (data.bank_choice) setBankChoice(data.bank_choice);
 if (data.hosting_choice) setHostingChoice(data.hosting_choice);
 if (data.plan_choice) setPlanChoice(data.plan_choice);
 if (data.bookings_email) setBookingsEmail(data.bookings_email);

 // Reconstruct scrapedData from saved fields (supports both old non-prefixed fields
 // and new scraped_* fields saved by handleAirbnbScrape)
 const heroImg = data.scraped_hero_image || data.hero_image || '';
 const imgList = data.scraped_images || data.images || [];
 if (heroImg || imgList.length > 0) {
 setScrapedData({
 title: data.scraped_title || data.property_name || '',
 location: data.scraped_location || data.location || '',
 description: data.scraped_description || data.property_desc || '',
 price: data.price || '',
 hero_image: heroImg,
 images: imgList,
 guests: data.scraped_guests || data.guests || null,
 bedrooms: data.bedrooms || null,
 beds: data.beds || null,
 baths: data.baths || null,
 rating: data.scraped_rating || data.rating || null,
 reviews: data.scraped_reviews || data.reviews || null,
 host_name: data.host_name || null,
 });
 // Notify parent (Home.tsx) so scrapedImages state is updated with restored images
 if (onImported) {
 onImported({
 title: data.scraped_title || data.property_name || '',
 description: data.scraped_description || data.property_desc || '',
 images: imgList,
 hero_image: heroImg,
 location: data.scraped_location || data.location || '',
 guests: data.scraped_guests || data.guests || null,
 });
 }
 }
 }
 } catch (err) {
 console.warn('Supabase load error (table may not exist yet):', err);
 }
 }

 // Keep calling loadSavedData when scrapedProperty/scrapedImages change
 // Re-run loadSavedData when user resolves (null → real user) AND when scraped data arrives.
 // Without user?.id in deps, loadSavedData would only fire on scrapedProperty changes
 // and would miss loading data for users who sign in after page load.
 useEffect(() => {
 loadSavedData();
 }, [scrapedProperty, scrapedImages, user?.id]);

 // Sync websiteName to header AND to New Site Template
 useEffect(() => {
 if (!onSiteNameChange) return;
 // Strip ALL leading @ to ensure no double-ups (handles both fresh input and sidebar echo-back)
 const display = websiteName.replace(/^@+/, '').trim().length > 0
 ? '@' + websiteName.replace(/^@+/, '').trim().slice(0, 20)
 : '@surfhousebaja';
 onSiteNameChange(display);
 }, [websiteName, onSiteNameChange]);

 // Sync name to header (immediate) and template (on change - real-time)
 const handleNameChange = (val: string) => {
 // Strip any leading @ so we never double it up when the sidebar prepends one
 const cleaned = val.startsWith('@') ? val.slice(1) : val;
 setWebsiteName(cleaned);
 // Persist to sessionStorage IMMEDIATELY so a subsequent scrape cannot overwrite it
 ssSet('website_name', cleaned);
 ssSet('user_website_name', cleaned); // also used by slug chain
};
 const handleDescChange = (val: string) => {
 setWebsiteDesc(val);
 // NOTE: onImported is NOT called here — it is only for full scrape imports.
 // The template description updates via the description prop passed from Home.tsx.
 };
 const handleNameBlur = () => {
 if (onSiteNameChange) {
 // Strip ALL leading @ to ensure we never double up, no matter where the value came from
 const stripped = websiteName.replace(/^@+/, '');
 const display = stripped.trim().length > 0 ? '@' + stripped.trim().slice(0, 20) : '@surfhousebaja';
 onSiteNameChange(display);
 }
 };
 const handleDescBlur = () => {
 // NOTE: onImported is NOT called here — description sync is handled via the
 // description prop passed to the template, not via the import callback.
 };

 // Sync description to template (fires independently, no stale name capture)
 // Auto-open popup on mount (2s delay).
 // ── IMPORTANT: For active subscribers, we call loadSavedData() (not setIsOpen)
 // because the user may already be logged in and the popup may already be mounted.
 // setIsOpen(true) is a no-op when isOpen is already true — we need loadSavedData
 // to populate the form fields from scrapedProperty prop (set by Home.tsx from DB).
 useEffect(() => {
 isMountedRef.current = true;
 const timer = setTimeout(async () => {
 if (!isMountedRef.current) return;

 // Check if user has an active subscription
 const { data: profile } = await supabase.from('profiles').select('stripe_subscription_status').eq('id', user?.id).maybeSingle();
 const isActive = profile?.stripe_subscription_status === 'active' || profile?.stripe_subscription_status === 'trialing';

 if (isActive) {
 // Active subscriber: do NOT open the onboarding popup.
 // They are a client — use the sidebar to edit and publish.
 // Clear any stale payment flags so loadSavedData won't re-open the popup.
 ssRem('closed');
 try { sessionStorage.removeItem('stripe_payment_done'); } catch {}
 return;
 }

 // Non-subscriber: only open if they haven't explicitly closed the popup
 if (!ssGet('closed')) {
 setIsOpen(true);
 }
 }, 2000);
 return () => {
 isMountedRef.current = false;
 clearTimeout(timer);
 };
 }, [scrapedProperty]);

 // Handle return from Stripe Connect onboarding - ?return_url or ?stripe_connect_return in URL
 useEffect(() => {
 const params = new URLSearchParams(window.location.search);
 const hasConnectReturn = params.has('return_url') || params.has('stripe_connect_return');
 if (!hasConnectReturn) return;

 // Clear params from URL without reload
 const url = new URL(window.location.href);
 url.searchParams.delete('return_url');
 url.searchParams.delete('stripe_connect_return');
 window.history.replaceState({}, '', url.toString());

 // Show the popup if not already open and display success message
 if (!isOpen) setIsOpen(true);
 // Set a flag so the Banking section step shows success state
 setShowStripeConnectSuccess(true);
 }, []);

 const [myTabId] = useState(() => Math.random().toString(36).slice(2, 10));
 const [showStripeConnectSuccess, setShowStripeConnectSuccess] = useState(false);

// ── Countdown timer for building/redirect screen ──────────────────────────
 // COMMENTED OUT — building modal is disabled; sidebar PUBLISH button drives the flow
 /*
 useEffect(() => {
   if (!showBuilding) return;
   const interval = setInterval(() => {
     setBuildingCountdown(prev => {
       if (prev <= 1) {
         clearInterval(interval);
         return 0;
       }
       return prev - 1;
     });
   }, 1000);
   return () => clearInterval(interval);
 }, [showBuilding]);

 useEffect(() => {
   // Redirect when countdown hits 0 (site should be ready by then)
   if (showBuilding && buildingCountdown === 0) {
     const siteUrl = ssGet('site_url');
     if (siteUrl) {
       console.log('[DEBUG building] Countdown expired, site ready at:', siteUrl, '— NOT redirecting (disabled)');
     } else {
       console.warn('[DEBUG building] Countdown expired, no site URL — closing popup');
     }
   }
 }, [showBuilding, buildingCountdown, user]);
 */

 // Handle return from Stripe Checkout redirect - ?paid=true&session_id=XXX
 // Dual-path: URL params (normal) + sessionStorage fallback (survives Vite HMR reloads
 // that can fire after Stripe redirects back and wipe URL params before this effect runs).
 useEffect(() => {
  // ── IMMEDIATE: Persist session_id from URL to sessionStorage BEFORE any async ──
  // This must happen synchronously so it survives Vite HMR page reloads that can
  // fire immediately after Stripe redirects back, potentially wiping URL params
  // before the async recovery flow runs.
  const rawSearch = window.location.search;
  const params = new URLSearchParams(rawSearch);
  const hasPaidParam = params.has('paid') && params.has('session_id');
  const sessionIdFromUrl = hasPaidParam ? params.get('session_id') : null;
  if (sessionIdFromUrl) {
    sessionStorage.setItem('stripe_session_id', sessionIdFromUrl);
    console.log('[DEBUG ?paid handler] ✅ Persisted session_id from URL:', sessionIdFromUrl);
  }

  // ── Guard: wait for auth to resolve before doing anything ──────────────
  if (!user) {
    console.log('[DEBUG ?paid handler] Auth not ready yet — waiting (user is null)');
    return;
  }
  // ── Guard: clear stale session IDs from previous test runs ─────────────
  // We only clear a stale session_id if NEITHER index.html just set it (no stripe_paid_flag)
  // NOR does the URL currently have ?paid=true. If index.html set stripe_paid_flag, it means
  // this is a fresh Stripe return and the session_id is valid — don't clear it.
  const paidFlag = sessionStorage.getItem('stripe_paid_flag');
  if (!hasPaidParam && !paidFlag && sessionStorage.getItem('stripe_session_id')) {
    console.log('[DEBUG ?paid handler] Clearing stale stripe_session_id from previous session');
    sessionStorage.removeItem('stripe_session_id');
  }
  const sessionIdFromStorage = sessionStorage.getItem('stripe_session_id');

  // Must have a session ID from at least one source
  const sessionId = sessionIdFromUrl || sessionIdFromStorage;

  // ── GUARD: If there is ZERO evidence of a Stripe redirect, do nothing ────
  // This prevents the error banner from appearing on every page load for every
  // new user who has never been through Stripe. We run recovery/error logic when:
  // (a) URL has ?paid=true&session_id=XXX, OR
  // (b) stripe_session_id is in sessionStorage AND stripe_paid_flag is set (fresh from index.html), OR
  // (c) stripe_session_id is in sessionStorage from a previous handler run
  const hasStripeReturnEvidence = sessionIdFromUrl ||
    (!!sessionStorage.getItem('stripe_session_id') && !!sessionStorage.getItem('stripe_paid_flag')) ||
    !!sessionIdFromStorage;
  console.log('[DEBUG ?paid handler] Stripe return evidence check:', { hasPaidParam, hasStripeReturnEvidence, sessionIdFromUrl, paidFlag: !!paidFlag, hasSessionInStorage: !!sessionIdFromStorage });
  if (!hasStripeReturnEvidence) {
    console.log('[DEBUG ?paid handler] No Stripe return evidence — skipping (user has not been through Stripe)');
    return;
  }

  if (!sessionId) {
    console.log('[DEBUG ?paid handler] Stripe return detected but session_id missing — checking for active subscription...');
    // Fallback: Stripe redirected without session_id in URL (edge case or pre-fix flow).
    // Check if webhook already fired and subscription is active.
    (async () => {
      try {
        if (!user) {
          console.log('[DEBUG ?paid handler] Still no user — setting up auth listener to retry when user signs in');
          // Wait for user to authenticate (Stripe redirect establishes session after page reload)
          // Listen for the auth state change and re-run the handler when user becomes available
          let retriesLeft = 10;
          const checkAuth = setInterval(async () => {
            retriesLeft--;
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user || retriesLeft <= 0) {
              clearInterval(checkAuth);
              if (session?.user) {
                console.log('[DEBUG ?paid handler] User authenticated after Stripe redirect — retrying payment verification...');
                // Re-call the entire recovery flow with the now-available user
                const { data: profileData } = await supabase
                  .from('profiles').select('stripe_subscription_status, stripe_customer_id').eq('id', session.user.id).maybeSingle();
                const subStatus = profileData?.stripe_subscription_status || session.user.stripe_subscription_status;

                if (subStatus === 'active' || subStatus === 'trialing') {
                  const slug = ssGet('website_name')
                    ? ssGet('website_name')!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
                    : null;
                  if (slug) {
                    // TEMPORARILY DISABLED — redirecting before site is built breaks the flow
                    // setStripeProcessing(true);
                    // setTimeout(() => { window.location.href = `https://www.propbook.pro/props/${slug}`; }, 800);
                    setStripeProcessing(false);
                    setIsOpen(false); // Active subscriber — use sidebar, not popup
                    return;
                  }
                }

                const customerId = profileData?.stripe_customer_id;
                if (customerId) {
                  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                  const recoveryRes = await fetch(`${supabaseUrl}/functions/v1/stripe-subscription`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}`, 'Apikey': supabaseAnonKey },
                    body: JSON.stringify({ action: 'get_session', session_id: sessionId, userId: session.user.id, slug: ssGet('website_name') || 'my-property' }),
                  });
                  const recoveryData = await recoveryRes.json();
                  console.log('[DEBUG ?paid handler] Retry recovery response:', JSON.stringify(recoveryData));
                  if (recoveryRes.ok && (recoveryData.subscription?.status === 'active' || recoveryData.sub_status === 'active' || recoveryData.status === 'complete')) {
                    setStripeProcessing(true);
                    await supabase.from('profiles').update({ stripe_subscription_status: recoveryData.sub_status || 'active', stripe_subscription_id: recoveryData.subscription_id, stripe_customer_id: recoveryData.customer_id }).eq('id', session.user.id);
                    await supabase.auth.refreshSession();
                    await refreshUser();
                    // setShowBuilding(true); // disabled — sidebar PUBLISH button drives the flow
                    // setBuildingCountdown(40);
                    try {
                      const siteResult = await handleSaveSiteInPopup();
                      if (siteResult?.siteUrl) window.location.href = siteResult.siteUrl;
                    } catch (siteErr) { console.error('[DEBUG ?paid handler] Site creation failed:', siteErr); }
                    return;
                  }
                }
                setStripeError('Payment could not be verified. Please contact support with your email.');
                setIsOpen(false);
              }
            }
          }, 1000);
          return;
        }
        const { data: profileData } = await supabase
          .from('profiles').select('stripe_subscription_status, stripe_customer_id').eq('id', user.id).maybeSingle();
        const subStatus = profileData?.stripe_subscription_status || user?.stripe_subscription_status;

        if (subStatus === 'active' || subStatus === 'trialing') {
          // Active subscriber — never open the onboarding popup. Redirect silently.
          console.log('[DEBUG ?paid handler] Active subscriber — closing popup and redirecting to property site');
          setIsOpen(false);
          setStripeProcessing(false);
          const slug = ssGet('website_name')
            ? ssGet('website_name')!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-')
            : null;
          if (slug) {
            setTimeout(() => { window.location.href = `https://www.propbook.pro/props/${slug}`; }, 100);
          }
          return;
        } else {
          console.log('[DEBUG ?paid handler] subStatus is null/unknown — proceeding to recovery. profileData:', JSON.stringify(profileData));
        }

        // ── Recovery attempt: no session ID AND subscription null ─────────────────
        // Payment was almost certainly successful (Stripe redirected here with ?paid=true).
        // Try to verify via stripe_customer_id stored in the user's profile.
        console.log('[DEBUG ?paid handler] No active subscription found — attempting recovery via stripe_customer_id...');
        const customerId = profileData?.stripe_customer_id;

        if (customerId) {
          // Use the Supabase anon key for auth (no user session available post-redirect)
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

          const recoveryRes = await fetch(`${supabaseUrl}/functions/v1/stripe-subscription`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Apikey': supabaseAnonKey,
            },
            body: JSON.stringify({
              action: 'get_session',
              session_id: sessionId,
              userId: user.id,
              slug: ssGet('website_name') || 'my-property',
            }),
          });
          const recoveryData = await recoveryRes.json();
          console.log('[DEBUG ?paid handler] Recovery response:', JSON.stringify(recoveryData));

          if (recoveryRes.ok && (recoveryData.subscription?.status === 'active' || recoveryData.sub_status === 'active' || recoveryData.status === 'complete')) {
            // Payment confirmed — update profile and create the site
            console.log('[DEBUG ?paid handler] ✅ Payment verified via recovery — creating site...');
            const profileUpdate: any = {
              stripe_subscription_status: recoveryData.sub_status || 'active',
            };
            if (recoveryData.subscription_id) profileUpdate.stripe_subscription_id = recoveryData.subscription_id;
            if (recoveryData.customer_id) profileUpdate.stripe_customer_id = recoveryData.customer_id;
            await supabase.from('profiles').update(profileUpdate).eq('id', user.id);
            await supabase.auth.refreshSession();
            await refreshUser();
            // setShowBuilding(true); // disabled — sidebar PUBLISH button drives the flow
            // setBuildingCountdown(40);
            try {
              const siteResult = await handleSaveSiteInPopup();
              const createdSiteUrl = siteResult?.siteUrl || null;
              if (createdSiteUrl) {
                window.location.href = createdSiteUrl;
              } else {
                setStripeError('Payment confirmed! But site URL was not returned. Please refresh and check your sidebar.');
                setIsOpen(false);
                setShowCongrats(true);
              }
            } catch (siteErr) {
              console.error('[DEBUG ?paid handler] Site creation failed:', siteErr);
              setStripeError('Payment confirmed but site creation failed. Please refresh and try publishing from the sidebar.');
              if (!isOpen) setIsOpen(true);
            }
            return;
          } else {
            console.warn('[DEBUG ?paid handler] Recovery returned non-OK or no active subscription:', recoveryRes.status, JSON.stringify(recoveryData));
          }
        } else {
          console.warn('[DEBUG ?paid handler] No stripe_customer_id in profile — cannot attempt recovery');
        }

        // All recovery attempts failed — payment likely succeeded but we can't verify it.
        // Show the user a clear error so they know to contact support.
        console.warn('[DEBUG ?paid handler] All recovery attempts failed — showing error to user');
        setStripeError(
          'Payment may have succeeded but we could not verify your subscription. ' +
          'Please contact support with your email to confirm your subscription was activated.'
        );
        if (!isOpen) setIsOpen(true);
      } catch (err) {
        console.error('[DEBUG ?paid handler] Unexpected error in recovery flow:', err);
        setStripeError('An unexpected error occurred after payment. Please contact support.');
        if (!isOpen) setIsOpen(true);
      }
    })();
    return;
  }
  // Guard: if we already handled a return in this tab session, don't re-trigger
  if (sessionStorage.getItem('stripe_payment_returning')) return;
  sessionStorage.setItem('stripe_payment_returning', '1');

  console.log('[DEBUG ?paid handler] Payment complete, session_id from URL:', sessionIdFromUrl, 'from storage:', sessionIdFromStorage);

  // Clear URL params and sessionStorage immediately so re-mounts don't re-trigger
  window.history.replaceState({}, '', window.location.pathname);
  sessionStorage.removeItem('stripe_session_id');
  sessionStorage.removeItem('stripe_paid_flag');

  setStripeProcessing(true);

  (async () => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setStripeError('Please sign in to complete your subscription.');
        setStripeProcessing(false);
        sessionStorage.removeItem('stripe_payment_returning');
        return;
      }

      // ── Step 1: Verify payment directly with Stripe ───────────────────────────
      // Call our edge function which uses the secret key to verify with Stripe
      const slug = ssGet('website_name') || websiteName || 'surfhousebaja';
      const userId = session.user.id;
      const sessionRes = await fetch(`${supabaseUrl}/functions/v1/stripe-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'Apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ action: 'get_session', session_id: sessionId, userId, slug }),
      });

      const sessionData = await sessionRes.json();
      console.log('[DEBUG ?paid handler] Session data from Stripe:', JSON.stringify(sessionData));

      if (sessionData.status !== 'complete') {
        setStripeError('Payment not confirmed by Stripe. Status: ' + sessionData.status);
        setStripeProcessing(false);
        sessionStorage.removeItem('stripe_payment_returning');
        return;
      }

      // ── Step 2: Update profile with subscription data ───────────────────────
      const profileUpdate: any = {
        stripe_subscription_status: sessionData.sub_status || 'active',
      };
      if (sessionData.subscription_id) {
        profileUpdate.stripe_subscription_id = sessionData.subscription_id;
        profileUpdate.stripe_customer_id = sessionData.customer_id;
      }

      await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', session.user.id);

      // ── Step 3: Refresh auth session cache so sidebar sees the subscription ─
      // Note: profile was updated in DB but getSession() caches stale user metadata
      await supabase.auth.refreshSession();
      await refreshUser();

      // ── Step 3b: Notify sidebar immediately (before slow site creation starts) ──
      // Store subscription data in sessionStorage as backup for when sidebar mounts later
      const subData = {
        subscription_id: sessionData.subscription_id,
        status: sessionData.sub_status || 'active',
        plan: sessionData.subscription?.plan || 'starter',
        amount: sessionData.amount_total || 1000,
        interval: 'month',
        current_period_end: sessionData.subscription?.current_period_end || Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        customer_id: sessionData.customer_id,
      };
      try { sessionStorage.setItem('sidebar_subscription_data', JSON.stringify(subData)); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('subscription-updated', { detail: subData }));
      console.log('[DEBUG ?paid handler] Dispatched subscription-updated immediately after profile update');

      // ── Step 4: Create site (property + migration + deploy) ──────────────
      setStripeProcessing(false);
      // setShowBuilding(true); // disabled — sidebar PUBLISH button drives the flow
      // setBuildingCountdown(40);
      let siteResult: any = null;
      try {
        siteResult = await handleSaveSiteInPopup();
        if (siteResult?.siteUrl) {
          console.log('[DEBUG ?paid handler] ✅ Site created:', siteResult.siteUrl, '— staying on localhost to show template');
        }
        setShowCongrats(true);
        // ── Step 5: Tell sidebar to update — AFTER property is created ──────────
        console.log('[DEBUG ?paid handler] Dispatching subscription-updated event with full data');
        window.dispatchEvent(new CustomEvent('subscription-updated', {
          detail: {
            subscription_id: sessionData.subscription_id,
            status: sessionData.sub_status || 'active',
            plan: sessionData.subscription?.plan || 'starter',
            amount: sessionData.amount_total || 1000,
            interval: 'month',
            current_period_end: sessionData.subscription?.current_period_end || Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            customer_id: sessionData.customer_id,
          },
        }));
        // Keep popup open to show success, then close after a delay (only after site creation finishes)
        setTimeout(() => {
          setIsOpen(false);
          setShowCongrats(false);
        }, 3000);
      } catch (siteErr) {
        console.error('[DEBUG ?paid handler] Site creation failed:', siteErr);
        setStripeError('Payment confirmed but site creation failed. Please try publishing from the sidebar.');
        // Don't auto-open popup on failure — let them use the sidebar
      }

    } catch (err) {
      console.error('[DEBUG ?paid handler] Error:', err);
      setStripeError('Payment verified but failed to save. Please refresh and check your sidebar.');
      setStripeProcessing(false);
    } finally {
      setStripeProcessing(false);
      sessionStorage.removeItem('stripe_payment_returning');
    }
  })();
 }, [window.location.search, user]); // re-fires when URL changes or auth resolves
 

 // Save scraped data to onboarding_data only (no property creation, no image upload).
 // Property + images are created on PUBLISH via migrate-property edge function.
 // This runs SYNCHRONOUSLY (awaited by openStripeGateway) so onboarding_data exists
 // before the user leaves for Stripe — guaranteeing data survives the redirect.
 const saveToSupabase = async (): Promise<void> => {
 console.log('[saveToSupabase] START, user.id:', user?.id);
 if (!user) { console.warn('[saveToSupabase] early exit — no user'); return; }
 try {
 console.log('[saveToSupabase] reading sessionStorage scraped_data...');
 // Read FRESH scraped data from sessionStorage
 const sessionScraped = (() => {
   try {
     const raw = ssGet('scraped_data');
     return raw ? JSON.parse(raw) : null;
   } catch { return null; }
 })();

 const websiteNameVal = ssGet('user_website_name') || websiteName || sessionScraped?.title || 'my-property';
 const slug = websiteNameVal
   .toLowerCase()
   .normalize('NFD')
   .replace(/[\u0300-\u036f]/g, '')
   .replace(/[^a-z0-9\s-]/g, '')
   .trim()
   .replace(/\s+/g, '-')
   .replace(/-+/g, '-');

 // Save scraped data with Airbnb image URLs — images are uploaded to Supabase storage
 // ONLY on PUBLISH (in createNewSiteRecords), not here. This avoids blocking Stripe
 // with slow image downloads and ensures migration handles the definitive image transfer.
 const row = {
   user_id: user.id,
   property_name: websiteNameVal,
   slug,
   property_desc: sessionScraped?.description || websiteDesc || null,
   airbnb_url: airbnbUrl,
   design_choice: designChoice,
   bank_choice: bankChoice,
   hosting_choice: hostingChoice,
   plan_choice: planChoice,
   email: user.email,
   bookings_email: bookingsEmail,
   extras,
   updated_at: new Date().toISOString(),
   scraped_title: sessionScraped?.title || null,
   scraped_location: sessionScraped?.location || null,
   scraped_description: sessionScraped?.description || null,
   scraped_hero_image: sessionScraped?.hero_image || sessionScraped?.images?.[0] || null,
   scraped_images: sessionScraped?.images || [],
   scraped_rating: sessionScraped?.rating ? String(sessionScraped.rating) : null,
   scraped_reviews: sessionScraped?.reviews ? String(sessionScraped.reviews) : null,
   scraped_guests: sessionScraped?.guests ? String(sessionScraped.guests) : null,
 };
 console.log('[saveToSupabase] row ready, slug:', slug, 'scraped_images count:', row.scraped_images?.length);
 console.log('[saveToSupabase] Calling supabase.onboarding_data.upsert...');
 const { error: obError } = await supabase
   .from('onboarding_data')
   .upsert(row, { onConflict: 'user_id' });
 console.log('[saveToSupabase] upsert returned, error:', obError?.message);
 if (obError) console.warn('[saveToSupabase] onboarding_data error:', obError.message);
 else console.log('[saveToSupabase] ✅ Saved to onboarding_data, slug:', slug);
 } catch (err) {
   console.warn('[saveToSupabase] Non-fatal error:', err);
 }
 };

 const SCRAPER_URL = 'https://airbnb-scraper-foj1.onrender.com';

 const handleAirbnbScrape = async (_e?: React.MouseEvent) => {
 if (!airbnbUrl) { setImportError('Please enter an Airbnb URL'); return; }
 setIsImporting(true);
 setImportError('');
 setCountdown(120);

 // Guard against double-fire (same pattern as openStripeGateway/handlePublish)
 stripeRedirectRef.current++;
 if (stripeRedirectRef.current > 1) {
   console.log('[handleAirbnbScrape] already in flight — ignoring duplicate click');
   stripeRedirectRef.current--;
   setIsImporting(false);
   setCountdown(0);
   return;
 }

 const countInterval = setInterval(() => {
 setCountdown(c => {
 if (c <= 1) { clearInterval(countInterval); return 0; }
 return Number(c) - 1;
 });
 }, 1000);

 try {
 const resp = await fetch(`${SCRAPER_URL}/scrape?url=${encodeURIComponent(airbnbUrl)}`);
 const result = await resp.json();
 clearInterval(countInterval);
 if (result.success) {
 const data = result.data;
 console.log('[handleAirbnbScrape] SUCCESS, data.images count:', data?.images?.length, 'data.title:', data?.title);
 setScrapedData(data);
 // Persist raw scraped data (Airbnb URLs + text) to sessionStorage only.
 // NO database save, NO image upload at this stage.
 // Images are uploaded to Supabase storage ONLY when Subscribe is pressed (in saveToSupabase).
 ssSet('scraped_data', JSON.stringify(data));
 // Notify parent (Home.tsx) so scrapedImages state is updated and the
 // image slider in the site template populates immediately after scrape.
 console.log('[handleAirbnbScrape] calling onImported, onImported is', typeof onImported);
 if (onImported) {
 console.log('[handleAirbnbScrape] onImported called with data.title:', data.title);
 onImported(data);
 } else {
 console.warn('[handleAirbnbScrape] onImported is NOT defined — popup will not notify Home.tsx!');
 }
 } else {
 setImportError('Failed to import listing. Please check the URL and try again.');
 }
 } catch (err) {
 clearInterval(countInterval);
 setImportError('Could not reach the scraper service. It may be waking up - please wait 60 seconds and try again.');
 } finally {
 setIsImporting(false);
 setCountdown(0);
 stripeRedirectRef.current--; // decrement so Subscribe button can proceed
 }
 };
 const handlePublish = async (_e?: React.MouseEvent) => {
   // Guard: prevent double-fire from rapid clicks
   stripeRedirectRef.current++;
   if (stripeRedirectRef.current > 1) {
     console.log('[handlePublish] already in flight — ignoring duplicate click');
     stripeRedirectRef.current--;
     return;
   }
   // If user already has an active subscription, save the site directly (no Stripe redirect)
   if (user?.stripe_subscription_status === 'active' || user?.stripe_subscription_status === 'trialing') {
     setSavingSite(true);
     setStripeError('');
     try {
       const result = await handleSaveSiteInPopup();
       if (result?.siteUrl) {
         setCongratsUrl(result.siteUrl);
         setShowCongrats(true);
         setIsOpen(false);
       }
     } catch (err) {
       console.error('[handlePublish] Failed:', err);
       setStripeError('Failed to publish. Try again or contact support.');
     } finally {
       setSavingSite(false);
     }
     return;
   }
   if (!user) {
     setStripeError('Please sign in or create an account first.');
     return;
   }
   if (!planChoice) {
     setStripeError('Please select a subscription plan first.');
     return;
   }
   if (!websiteName.trim()) {
     setStripeError('Please enter a website name first.');
     return;
   }
   setStripeError('');
   setStripeProcessing(true); // disable button BEFORE async work
   await saveToSupabase();

   try {
     const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
     const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

     const activeExtras: string[] = [];
     if (extras.seo) activeExtras.push('seo');
     if (extras.ads) activeExtras.push('ads');
     if (extras.analytics) activeExtras.push('analytics');
     if (extras.social) activeExtras.push('social');

     const res = await fetch(`${supabaseUrl}/functions/v1/stripe-subscription`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
         'Apikey': supabaseAnonKey,
       },
       body: JSON.stringify({
         action: 'create_checkout_session',
         plan: planChoice,
         hosting_choice: hostingChoice,
         extras: activeExtras,
         include_scrape: designChoice === 'airbnb',
         email: user.email,
         user_id: user.id,
         slug: websiteName, // needed for post-payment deploy trigger
         return_url: window.location.origin + window.location.pathname + '?paid=true',
       }),
     });

     const data = await res.json();

     if (!data.url) {
       setStripeError(data.error || 'Could not initialise payment. Please try again.');
       return;
     }

     // Redirect to Stripe Checkout hosted page
     // IMPORTANT: Use the user's ORIGINAL typed website name (saved BEFORE any scrape
     // could overwrite it). This is the ONE TRUE SOURCE for the slug and page title.
     ssSet('user_website_name', websiteName);
     ssSet('plan', planChoice);
     ssSet('hosting', hostingChoice);
     ssSet('design', designChoice);
     ssSet('extras_seo', extras.seo ? 'true' : 'false');
     ssSet('extras_ads', extras.ads ? 'true' : 'false');
     ssSet('extras_analytics', extras.analytics ? 'true' : 'false');
     ssSet('extras_social', extras.social ? 'true' : 'false');
     ssSet('website_name', websiteName);
     ssSet('website_desc', websiteDesc);
     // Pass property name to sidebar via sessionStorage
     ssSet('property_name', scrapedData?.title || websiteName || '');
     // Persist scraped data so it survives the Stripe redirect remount
     if (scrapedData) {
       ssSet('scraped_data', JSON.stringify(scrapedData));
     }
     console.log('[DEBUG] About to redirect to: ' + data.url);
     // Persist session_id so the ?paid=true handler survives Vite HMR reloads
     if (data.sessionId) sessionStorage.setItem('stripe_session_id', data.sessionId);
     window.location.href = data.url;
   } catch {
     setStripeError('Could not connect to payment server. Please try again.');
   }
 };

 const handleSaveSiteInPopup = async () => {
   console.log('[handleSaveSiteInPopup] 🚀 START user:', user?.id, 'email:', user?.email);
   if (!user) { console.error('[handleSaveSiteInPopup] ❌ No user, returning'); return; }
   setSavingSite(true);
   const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
   const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
   console.log('[handleSaveSiteInPopup] ✅ env vars loaded:', { supabaseUrl: !!supabaseUrl, supabaseAnonKey: !!supabaseAnonKey });
   try {
     console.log('[handleSaveSiteInPopup] ✅ imported services, starting site creation...');

     // ── Resolve scrapedData with three-tier fallback ──
     // 1. React state (live, from parent props)
     // 2. sessionStorage (survives Stripe redirect remount)
     // 3. onboarding_data table (persisted for users who scraped before this fix)
     let resolvedScrapedData = scrapedData || JSON.parse(ssGet('scraped_data') || 'null');
     // Declare od in outer scope so it's available for websiteName/slug fallback below
     let od: any = null;
     if (!resolvedScrapedData) {
       // Try onboarding_data first
       const { data } = await supabase
         .from('onboarding_data')
         .select('scraped_title, scraped_location, scraped_description, scraped_hero_image, scraped_images, scraped_guests, scraped_rating, scraped_reviews, hero_image, images, location, property_desc, bedrooms, beds, baths, property_name')
         .eq('user_id', user.id)
         .maybeSingle();
       od = data;
       if (od && (od.scraped_hero_image || od.hero_image || (od.scraped_images && od.scraped_images.length > 0) || (od.images && od.images.length > 0))) {
         const heroImg = od.scraped_hero_image || od.hero_image || '';
         const imgList = od.scraped_images || od.images || [];
         resolvedScrapedData = {
           title: od.scraped_title || '',
           location: od.scraped_location || od.location || '',
           description: od.scraped_description || od.property_desc || '',
           hero_image: heroImg,
           images: imgList,
           guests: od.guests || null,
           bedrooms: od.bedrooms || null,
           beds: od.beds || null,
           baths: od.baths || null,
           rating: od.rating || null,
           reviews: od.reviews || null,
           host_name: null,
           price: '',
         };
       }
       // Third fallback: query properties table directly for users who were set up manually
       if (!resolvedScrapedData) {
         const { data: propData } = await supabase
           .from('properties')
           .select('title, address, description, hero_image, images, guests, bedrooms, beds, bathrooms')
           .eq('owner_id', user.id)
           .maybeSingle();
         if (propData) {
           od = propData;
           resolvedScrapedData = {
             title: propData.title || '',
             location: propData.address || '',
             description: propData.description || '',
             hero_image: propData.hero_image || '',
             images: propData.images || [],
             guests: propData.guests || null,
             bedrooms: propData.bedrooms || null,
             beds: propData.beds || null,
             baths: propData.bathrooms ?? 1,
             rating: propData.rating || null,
             reviews: null,
             host_name: null,
             price: '',
           };
         }
       }
     }

     // Read scraped data from sessionStorage before building the data object
     const scrapedFromSession = (() => {
       try {
         const raw = ssGet('scraped_data');
         return raw ? JSON.parse(raw) : null;
       } catch { return null; }
     })();

     const data = {
       email: user.email,
       userId: user.id,
       userStripeAccountId: popupConnectAccountId || null,
       bookingsEmail: user.email,
       // websiteName field — use the user's original typed input (saved before scrape could overwrite it)
       websiteName: ssGet('user_website_name')
         || (od?.property_name ? String(od.property_name) : null)
         || websiteName
         || user.full_name
         || 'My Property',
       websiteDesc: websiteDesc || '',
       planChoice: planChoice as 'starter' | 'pro' | 'agency',
       hostingChoice: hostingChoice as 'our' | 'own',
       designChoice: designChoice,
       extras: { seo: extras.seo, ads: extras.ads, analytics: extras.analytics, social: extras.social },
       scrapedData: resolvedScrapedData,
       bankChoice: bankChoice,
       // Slug — from website name field or freshly scraped title:
       // Priority: popup_user_website_name (user's typed input, saved before Stripe)
       //           → resolvedScrapedData.title (freshly scraped, survives Stripe redirect)
       //           → od.property_name (saved property name from DB)
       //           → 'My Property' (never fall back to user.full_name — causes garbled slugs)
       slug: createSlug(
         ssGet('user_website_name')
         || (resolvedScrapedData?.title ? String(resolvedScrapedData.title) : null)
         || (od?.property_name ? String(od.property_name) : null)
         || 'My Property'
       ),
     };
     const finalSlug = data.slug;
     console.log('[handleSaveSiteInPopup] 📝 websiteName:', websiteName, 'plan:', planChoice, 'scrapedData images count:', resolvedScrapedData?.images?.length, 'userWebsiteName:', ssGet('user_website_name'), '-> slug:', finalSlug);
     console.log('[handleSaveSiteInPopup] 📝 first 3 image URLs:', resolvedScrapedData?.images?.slice(0, 3));
     const result = await createNewSiteRecords(data);
     console.log('[handleSaveSiteInPopup] ✅ Site records created:', result.slug, result.propertyId, result.siteUrl);
     ssSet('site_url', result.siteUrl);
     ssSet('site_phase', 'saved');

     // ── Migrate scraped data from onboarding_data into the new property ──
     // Source is now the user's own onboarding_data (fixed to save scraped_* fields).
     // Fall back to efa8d280 only if onboarding_data has no real scraped content.
     try {
       const { data: { session } } = await supabase.auth.getSession();
       if (session) {
         // Fetch fresh onboarding_data to pass to migration
         const { data: od } = await supabase
           .from('onboarding_data')
           .select('scraped_title, scraped_location, scraped_description, scraped_hero_image, scraped_images, scraped_guests, scraped_rating, scraped_reviews, hero_image, images, location, property_desc, bedrooms, beds, baths, property_name')
           .eq('user_id', user.id)
           .maybeSingle();
         // Use FRESH scraped data from sessionStorage (resolvedScrapedData) rather than
         // the stale onboardingData from the DB, which may have null scraped fields if the
         // scraper only partially succeeded. resolvedScrapedData was set by handleAirbnbScrape
         // and saved to sessionStorage immediately — it survives the Stripe redirect remount.
         const migrationData = resolvedScrapedData || od;
         const migRes = await fetch(`${supabaseUrl}/functions/v1/migrate-property`, {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${session.access_token}`,
             'Apikey': supabaseAnonKey,
           },
           body: JSON.stringify({
             targetPropertyId: result.propertyId,
             onboardingData: migrationData,
           }),
         });

         let migData: any;
         if (!migRes.ok) {
           const errText = await migRes.text().catch(() => migRes.statusText);
           console.error(`[handleSaveSiteInPopup] ⚠️ Migration HTTP error ${migRes.status}: ${errText}`);
           throw new Error(`Migration failed (HTTP ${migRes.status}): ${errText}`);
         }
         migData = await migRes.json();
         if (migData.success) {
           console.log('[handleSaveSiteInPopup] ✅ Migrated scraped data:', migData.fields_copied, 'images:', migData.images_copied);
         } else {
           console.warn('[handleSaveSiteInPopup] ⚠️ Migration failed:', migData.error);
           throw new Error(`Migration returned error: ${migData.error}`);
         }
       }
     } catch (migErr) {
       console.warn('[handleSaveSiteInPopup] ⚠️ Migration error:', migErr);
       // Non-fatal — site still deploys even if migration fails
     }

     // ── Deploy React app to Hostinger via browser-based upload.php ──
     // Non-fatal — even if deploy fails, site records are saved in DB
     let deployUrl: string | undefined;
     try {
       console.log('[handleSaveSiteInPopup] 🚀 Deploying React app to /props/', result.slug, '...');
       deployUrl = await deployViaUploadPhp(
       result.slug,
       result.propertyId,
       supabaseUrl,
       supabaseAnonKey,
       data,
       (msg) => console.log('[handleSaveSiteInPopup] Deploy:', msg)
       );
       console.log('[handleSaveSiteInPopup] ✅ Deploy result:', deployUrl);
     } catch (deployErr) {
       console.error('[handleSaveSiteInPopup] ⚠️ Deploy failed (non-fatal):', deployErr);
       deployUrl = undefined;
     }

     // ── Open the admin sidebar immediately so they can see their data ──
     if (onOpenSidebar) onOpenSidebar();

     // Show success banner — Railway deploy triggered automatically
     setCongratsUrl(result.siteUrl);
     setDeployUrl(deployUrl);
     setSavingSite(false);
     setIsOpen(false);
     setShowCongrats(true);

     return result;
   } catch (err) {
     console.error('[handleSaveSiteInPopup] ❌ FATAL ERROR:', err);
     setStripeError('Failed to save site. Check DevTools console: ' + (err instanceof Error ? err.message : String(err)));
     setSavingSite(false);
     setIsOpen(true); // Re-open popup on fatal error so user can see the error
   }
 };




 return (
 <>
 {isOpen && (
 <div className="popup-backdrop" onClick={handleClose}>
 <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
 <button onClick={handleClose} className="popup-close">×</button>

 {/* Intro */}
 <h1 style={{ fontSize: "clamp(1.5rem, 2.8vw, 1.875rem)" }}>Create your site</h1>
 <p>After you complete this sign up process you can then open your site on your phone or desktop browser. You can finish customizing it by adding photos, editing text, and manage incoming bookings at your convenience.</p>
 <br /><hr />

 {/* Sign Up */}
 <h1 style={{ fontSize: "clamp(1.5rem, 2.8vw, 1.875rem)" }}>Sign Up</h1>
  {(user || accountCreated) ? (
   <div style={{ background: 'rgba(80,180,100,0.12)', border: '1px solid rgba(80,180,100,0.35)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.9rem', color: '#a8d8b0' }}>
     {accountCreated && !user ? (
       <strong style={{color: '#2a9d4e'}}>✓ Account created — welcome, {authFullName || authEmail.split('@')[0]}!</strong>
     ) : user ? (
       <><strong>{user.full_name || user.email}</strong></>
     ) : null}
   </div>
 ) : (
   <>
     {planChoice === 'starter' && (
       <div style={{ background: 'rgba(196,119,86,0.15)', border: '1px solid rgba(196,119,86,0.4)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem', color: '#e8c4a0' }}>
         Your plan includes a free month - you won&apos;t be charged today.
       </div>
     )}
     <p>Create your account to get started.</p>
     <h4>Full name</h4>
     <input type="text" placeholder="Full name" className="editmode" value={authFullName} onChange={e => setAuthFullName(e.target.value)} />
     <h4>Phone (optional)</h4>
     <input type="tel" placeholder="Phone number" className="editmode" value={authPhone} onChange={e => setAuthPhone(e.target.value)} />
     <h4>Email</h4>
     <input type="email" placeholder="Email" className="editmode" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
     <h4>Password</h4>
     <input type="password" placeholder="Password" className="editmode" value={authPassword} onChange={e => setAuthPassword(e.target.value)} />
     {authError && <p style={{ color: '#e07070', fontSize: '0.85rem', margin: '6px 0' }}>{authError}</p>}
     <button className="btn" onClick={handleSignUp} disabled={authLoading}>
       {authLoading ? 'Creating account...' : 'Create Account'}
     </button>
     <br /><hr />

     {/* Sign In */}
     <h1 style={{ fontSize: "clamp(1.5rem, 2.8vw, 1.875rem)" }}>Already have an account? Sign In</h1>
     <h4>Email</h4>
     <input type="email" placeholder="Email" className="editmode" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
     <h4>Password</h4>
     <input type="password" placeholder="Password" className="editmode" value={authPassword} onChange={e => setAuthPassword(e.target.value)} />
     {authError && <p style={{ color: '#e07070', fontSize: '0.85rem', margin: '6px 0' }}>{authError}</p>}
     <button className="btn" onClick={handleSignIn} disabled={authLoading}>
       {authLoading ? 'Signing in...' : 'Sign In'}
     </button>
   </>
 )}
 <p>Enter the email address you would like your booking notifications sent to.</p>
 <h4>Bookings email</h4>
 <input type="email" placeholder="Bookings email" className="editmode" value={bookingsEmail} onChange={e => setBookingsEmail(e.target.value)} />
 <br /><hr />

  {/* Banking section - completed in sidebar after signup */}

 {/* Design */}
 <h1 style={{ fontSize: "clamp(1.5rem, 2.8vw, 1.875rem)" }}>2. Design your website</h1>
 <ul>
 <li>
 <input type="radio" name="design" id="3-1" checked={designChoice === 'manual'} onChange={() => { setDesignChoice('manual'); setScrapedData(null); }} />
 <label htmlFor="3-1">Manual photo upload - Free</label>
 </li>
 </ul>
 {designChoice === 'manual' && (
 <div className="popup-airbnb-section">
 <p>Upload property photos</p>
 <h3>Add photos from your phone or computer. The first photo becomes the hero image.</h3>
 <label htmlFor="manual-image-upload" className="btn" style={{ display: 'inline-block', cursor: 'pointer' }}>
 Choose photos
 </label>
 <input
 id="manual-image-upload"
 type="file"
 accept="image/*"
 multiple
 capture="environment"
 style={{ display: 'none' }}
 onChange={async (e) => {
 const files = Array.from(e.target.files || []);
 if (files.length === 0) return;
 const newBlobUrls: string[] = [];
 const newBase64s: string[] = [];
 for (const file of files) {
 const blobUrl = URL.createObjectURL(file);
 const base64 = await fileToBase64(file);
 newBlobUrls.push(blobUrl);
 newBase64s.push(base64);
 }
 const allBase64s = [...manualBase64Images, ...newBase64s];
 setManualBase64Images(allBase64s);
 setManualImages(prev => [...prev, ...newBlobUrls]);
 if (!manualHeroImage && newBlobUrls.length > 0) {
 setManualHeroImage(newBlobUrls[0]);
 }
 if (onImported) {
 const prevBase64s = manualBase64Images; // capture before state update
 const heroBase64 = newBlobUrls[0] ? allBase64s[manualImages.length] : allBase64s[0] || '';
 onImported({
 title: (websiteName.trim() || 'surfhousebaja'),
 location: '',
 description: websiteDesc || '',
 hero_image: heroBase64,
 images: allBase64s,
 guests: null,
 bedrooms: null,
 beds: null,
 baths: null,
 rating: null,
 reviews: null,
 host_name: null,
 });
 }
 }}
 />
 {manualImages.length > 0 && (
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
 {manualImages.map((url, i) => (
 <div key={url} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', border: manualHeroImage === url ? '2px solid var(--brand)' : '2px solid transparent', cursor: 'pointer' }}
 onClick={(e) => { e.stopPropagation();
 setManualHeroImage(url);
 if (onImported) {
 const heroIdx = manualImages.indexOf(url);
 const heroBase64 = heroIdx >= 0 ? manualBase64Images[heroIdx] : '';
 onImported({
 title: (websiteName.trim() || 'surfhousebaja'),
 location: '',
 description: websiteDesc || '',
 hero_image: heroBase64,
 images: manualBase64Images,
 guests: null,
 bedrooms: null,
 beds: null,
 baths: null,
 rating: null,
 reviews: null,
 host_name: null,
 });
 }
 }}>
 <img src={url} alt={`Photo ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
 <button
 onClick={(evt) => { evt.stopPropagation(); setManualImages(prev => prev.filter((_, idx) => idx !== manualImages.indexOf(url))); if (manualHeroImage === url) setManualHeroImage(''); }}
 style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', cursor: 'pointer', lineHeight: '16px', textAlign: 'center' }}
 >×</button>
 </div>
 ))}
 </div>
 )}
 {manualImages.length > 0 && (
 <p className="hero-subtitle popup-note" style={{ marginTop: '6px' }}>{manualImages.length > 0 ? `${manualImages.length} photo${manualImages.length > 1 ? 's' : ''} added` : 'No photos added yet'}</p>
 )}
 {manualImages.length > 0 && (
 <div className="popup-preview" style={{ marginTop: '16px' }}>
 <h3>Preview:</h3>
 <TemplatePreview
 title={websiteName || ''}
 location=""
 price=""
 description={websiteDesc || ''}
 hero_image={manualHeroImage || manualImages[0] || ''}
 images={manualImages}
 guests={undefined}
 bedrooms={undefined}
 beds={undefined}
 baths={undefined}
 rating={undefined}
 reviews={undefined}
 host_name={undefined}
 />
 </div>
 )}
 </div>
 )}
 <ul>
 <li>
 <input type="radio" name="design" id="3-2" checked={designChoice === 'airbnb'} onChange={() => setDesignChoice('airbnb')} />
 <label htmlFor="3-2">Auto Airbnb profile import - $10</label>
 </li>
 </ul>

 {/* Airbnb import - shown only when Airbnb radio is selected */}
 {designChoice === 'airbnb' && (
 <div className="popup-airbnb-section">
 <h4>Paste your Airbnb listing URL</h4>
 <input
 type="text"
 placeholder="https://www.airbnb.com/rooms/1569039869816457609"
 className="editmode"
 value={airbnbUrl}
 onChange={e => setAirbnbUrl(e.target.value)}
 />
 <button
 className="btn"
 onClick={(e) => { e.stopPropagation(); handleAirbnbScrape(e); }}
 disabled={isImporting}
 >
 {isImporting ? `Importing... (${countdown}s)` : 'Get data'}
 </button>
 {importError && <p>{importError}</p>}
 {isImporting && (
 <div style={{ marginTop: 10 }}>
 <h3 style={{ marginBottom: 4 }}>Importing your listing - takes about 2 minutes.</h3>
 <p style={{ fontSize: '0.8rem', color: '#aaa', margin: 0 }}>Pick your brand color and font below while you wait.</p>
 </div>
 )}

 {/* Preview - appears below Get data after import */}
 {scrapedData && (
 <div className="popup-preview">
 <h3>Preview:</h3>
 <TemplatePreview
 title={scrapedData.title || websiteName || ''}
 location={scrapedData.location || ''}
 price={scrapedData.price || ''}
 description={scrapedData.description || ''}
 hero_image={scrapedData.hero_image || ''}
 images={scrapedData.images || []}
 guests={scrapedData.guests}
 bedrooms={scrapedData.bedrooms}
 beds={scrapedData.beds}
 baths={scrapedData.baths}
 rating={scrapedData.rating}
 reviews={scrapedData.reviews}
 host_name={scrapedData.host_name}
 />
 </div>
 )}
 </div>
 )}

<br />
 <p>Add your Brand color to your buttons.</p>
 <button className="btn" onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }} style={{ backgroundColor: showColorPicker ? "var(--brand-hover)" : "var(--brand)" }}>
 {showColorPicker ? "Close color picker" : "Launch color picker"}
 </button>
 {showColorPicker && (
 <div className="popup-color-picker">
 <div className="popup-color-grid">
 {['#E63946','#F77F00','#FFC300','#0096C7','#7B2D8E','#00B4D8','#FF6B35','#FF4757','#E84393','#1DD1A1','#00CEC9','#CCFF00'].map(hex => (
 <button
 key={hex}
 onClick={(e) => { e.stopPropagation();
 setBrandColor(hex);
 document.documentElement.style.setProperty('--brand', hex);
 const hover = adjustBrightness(hex, -20);
 const disabled = adjustBrightness(hex, 35);
 document.documentElement.style.setProperty('--brand-hover', hover);
 document.documentElement.style.setProperty('--brand-disabled', disabled);
 }}
 className="popup-color-swatch"
 style={{
 backgroundColor: hex,
 borderColor: brandColor === hex ? 'white' : 'transparent',
 boxShadow: brandColor === hex ? '0 0 0 2px var(--brand)' : 'none',
 }}
 />
 ))}
 </div>
 <div className="popup-color-custom">
 <input
 type="text"
 value={brandColor}
 onChange={e => {
 const val = e.target.value;
 setBrandColor(val);
 if (/^#[0-9a-fA-F]{6}$/.test(val)) {
 saveBrandColor(val);
 }
 }}
 placeholder="#C47756"
 maxLength={7}
 className="popup-color-input"
 />
 <span className="popup-color-label">Brand color: <span style={{ fontFamily: 'monospace', color: brandColor }}>{brandColor}</span></span>
 </div>
 </div>
 )}

 {/* Font accent selector */}
 <div className="popup-font-section">
 <p>Choose your font for headings.</p>
 <FontDropdown
 value={fontAccent}
 options={fontOptions}
 onChange={font => {
 setFontAccent(font);
 localStorage.setItem('site-font-accent', font);
 document.documentElement.style.setProperty('--font-accent', `'${font}', serif`);
 document.querySelectorAll('h1').forEach(el => {
 (el as HTMLElement).style.fontFamily = `'${font}', serif`;
 });
 }}
 previewText="The quick brown fox"
 triggerClassName="popup-font-dropdown-trigger"
 />
 </div>

 <hr />

 {/* Name property */}
 <h1 style={{ fontSize: "clamp(1.5rem, 2.8vw, 1.875rem)" }}>3. Name your property</h1>
 <h4>Website name <span style={{ color: '#e53e3e', fontWeight: 700 }}>(IMPORTANT)</span></h4>
 <input type="text" placeholder="Website name (max 20 chars)" className="editmode" value={websiteName} onChange={e => handleNameChange(e.target.value)} onBlur={handleNameBlur} />
 <h4>Website description</h4>
 <textarea
 placeholder="Website description"
 className="popup-textarea editmode"
 value={websiteDesc}
 onChange={e => handleDescChange(e.target.value)}
 onBlur={handleDescBlur}
 />
 <p>Check domain availability so you can point it to your hosting server.</p>
 <button
 style={{ display: 'inline-block', background: 'var(--brand, #C47756)', color: '#fff', padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', marginTop: 4 }}
 onClick={() => {
 const rawName = websiteName.trim() || '';
 const name = rawName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
 const url = name
 ? `https://www.hostinger.com/domain-name-results?from=homepage&domain=${encodeURIComponent(name.toLowerCase().replace(/\s+/g, ''))}`
 : 'https://www.hostinger.com';
 window.open(url, '_blank');
 }}
 >
 Check on Hostinger
 </button>
<br />

 <hr />

 {/* Hosting */}
 <h1 style={{ fontSize: "clamp(1.5rem, 2.8vw, 1.875rem)" }}>4. Hosting options</h1>
 <ul>
 <li>
 <input type="radio" name="hosting" id="4-1" checked={hostingChoice === 'own'} onChange={() => setHostingChoice('own')} />
 <label htmlFor="4-1">Export to your own server - Free</label>
 </li>
 <li>
 <input type="radio" name="hosting" id="4-2" checked={hostingChoice === 'our'} onChange={() => setHostingChoice('our')} />
 <label htmlFor="4-2">Published to our server - $5 p/m</label>
 </li>
 </ul>
 <br /><hr />

 {/* Subscription */}
 <h1 style={{ fontSize: "clamp(1.5rem, 2.8vw, 1.875rem)" }}>5. Subscription</h1>
 {(user?.stripe_subscription_status === 'active' || user?.stripe_subscription_status === 'trialing') ? (
 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(80,180,100,0.12)', border: '1px solid rgba(80,180,100,0.35)', borderRadius: 8, fontSize: '0.95rem', color: '#a8d8b0', marginBottom: 8 }}>
 <span>✓ You have the {user?.stripe_subscription_plan || planChoice || 'starter'} plan</span>
 </div>
 ) : (
 <>
 <ul>
 <li>
 <input type="radio" name="plan" id="5-1" checked={planChoice === 'starter'} onChange={() => setPlanChoice('starter')} />
 <label htmlFor="5-1">Starter — Free 1st month then $10/mo</label>
 </li>
 <li>
 <input type="radio" name="plan" id="5-2" checked={planChoice === 'pro'} onChange={() => setPlanChoice('pro')} />
 <label htmlFor="5-2">Pro — $30/mo</label>
 </li>
 <li>
 <input type="radio" name="plan" id="5-3" checked={planChoice === 'agency'} onChange={() => setPlanChoice('agency')} />
 <label htmlFor="5-3">Agency — $150/mo</label>
 </li>
 </ul>
 </>
 )}
 <br /><hr />

 {/* Extras */}
 <h1 style={{ fontSize: "clamp(1.5rem, 2.8vw, 1.875rem)" }}>6. Optional extras</h1>
 <p>Select which services you are interested in getting.</p>
 <ul>
 <li>
 <input type="checkbox" id="6-1" checked={extras.seo} onChange={e => setExtras({...extras, seo: e.target.checked})} />
 <label htmlFor="6-1">AI SEO - $10 p/m</label>
 </li>
 <li>
 <input type="checkbox" id="6-2" checked={extras.ads} onChange={e => setExtras({...extras, ads: e.target.checked})} />
 <label htmlFor="6-2">Ads &amp; Marketing - $30 p/m</label>
 </li>
 <li>
 <input type="checkbox" id="6-3" checked={extras.analytics} onChange={e => setExtras({...extras, analytics: e.target.checked})} />
 <label htmlFor="6-3">Analytics - $20 p/m</label>
 </li>
 <li>
 <input type="checkbox" id="6-4" checked={extras.social} onChange={e => setExtras({...extras, social: e.target.checked})} />
 <label htmlFor="6-4">Social Media Marketing - $50 p/m</label>
 </li>
 </ul>
 <br /><hr />

 {/* Payment */}
 <h1 style={{ fontSize: "clamp(1.5rem, 2.8vw, 1.875rem)" }}>Payment Calculated</h1>
 <p>Secure payment via Stripe (accepts Visa, Mastercard, Amex).</p>
 <button
 className="btn"
 onClick={(e) => { e.stopPropagation(); openStripeGateway(e); }}>
 {user?.stripe_subscription_status === 'active' || user?.stripe_subscription_status === 'trialing'
 ? `✓ Subscribed to ${planChoice === 'starter' ? 'Starter' : planChoice === 'pro' ? 'Pro' : 'Agency'}`
 : user?.stripe_subscription_status === 'past_due'
 ? 'Update Payment'
 : `Subscribe to ${planChoice === 'starter' ? 'Starter $10' : planChoice === 'pro' ? 'Pro $30' : 'Agency $150'}`}
 </button>

 <h1 style={{ fontSize: "clamp(1.5rem, 2.8vw, 1.875rem)" }}>7. Publish your site</h1>
 <p>After onboarding you can open your site on your phone or desktop browser. You can finish customizing it by adding photos, editing text, and manage incoming bookings at your convenience.</p>
 <ul>
 <li>
 <input type="checkbox" id="7-1" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
 <h4>Click to agree to our Terms &amp; Conditions</h4>
 </li>
 </ul>
 <br />
 <button
 className="h2 publish-btn"
 onClick={(e) => { e.stopPropagation(); handlePublish(e); }}
 disabled={!agreed || !websiteName.trim() || stripeProcessing}
 >
   {(user?.stripe_subscription_status === 'active' || user?.stripe_subscription_status === 'trialing')
     ? (stripeProcessing ? 'SAVING...' : 'PUBLISH MY SITE')
     : (stripeProcessing ? 'REDIRECTING...' : 'SUBSCRIBE NOW')}
 </button>

 {/* Fixed bottom total banner */}

 {/* Stripe Payment Modal */}
 {showStripeModal && (
 <div className="stripe-modal-backdrop" onClick={() => { setShowStripeModal(false); setStripeError(''); }}>
 <div className="stripe-modal-box" onClick={e => e.stopPropagation()}>
 <div className="stripe-modal-header">
 <h1 style={{ margin: 0, fontSize: '1.1rem' }}>Secure Payment</h1>
 <button onClick={() => { setShowStripeModal(false); setStripeError(''); }} className="stripe-modal-close">×</button>
 </div>

 {/* Payment method icons */}
 <div className="stripe-pay-icons">
 {(['card', 'paypal', 'venmo'] as const).map(method => (
 <button
 key={method}
 className={"stripe-pay-btn" + (stripePayMethod === method ? ' active' : '')}
 onClick={() => setStripePayMethod(method)}
 >
 {method === 'card' && (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
 <rect x="2" y="5" width="20" height="14" rx="2"/>
 <path d="M2 10h20"/>
 </svg>
 )}
 {method === 'paypal' && (
 <svg viewBox="0 0 24 24" fill="currentColor">
 <path d="M7.4 4.5C9 4.5 10.3 5.2 10.7 7h1.5c-.5-2.4-2.7-4-5.2-4-3.4 0-5.6 2.2-5.6 5.4 0 3.2 2.5 4.3 5.9 5.2 2.8.7 4.3 1.4 4.3 3.3 0 2.1-1.9 3.1-4.6 3.1-3.1 0-5.2-1.5-5.3-4.5H1.8c.1 3.7 2.6 6.2 5.9 6.2 3.6 0 5.9-2.3 5.9-5.7 0-3-1.9-4.3-5.9-5.2-2.6-.6-4.1-1.3-4.1-3.1 0-1.2 1.2-2.2 3.4-2.2z"/>
 </svg>
 )}
 {method === 'venmo' && (
 <svg viewBox="0 0 24 24" fill="currentColor">
 <path d="M17.18 6.54c-.7-1.27-2.02-1.91-3.6-1.91-2.2 0-3.8 1.37-4.08 3.2-.32 1.96.82 3.68 2.5 4.78l1.26.82c1.24.81 1.96 1.84 1.96 3.16 0 2.1-1.7 3.67-4.18 3.67-1.74 0-3.14-.67-3.88-1.82l-1.18 1.36c1.04 1.42 2.48 2.18 4.5 2.18 2.84 0 4.98-1.86 5.14-4.48.1-1.3-.46-2.5-1.54-3.4l-1.28-.84c-.98-.64-1.7-1.44-1.7-2.58 0-.92.66-1.58 1.58-1.58.72 0 1.24.32 1.24.92 0 .48-.34.86-.92.86-.24 0-.44-.12-.44-.42 0-.34.26-.66.74-1.16.7-.7 1.34-1.7 1.7-2.84.38.76.58 1.6.58 2.5 0 .8-.2 1.58-.6 2.3.06.26.1.54.1.84 0 .82-.26 1.62-.74 2.34.26.14.56.22.88.22.92 0 1.64-.7 1.64-1.58 0-.44-.18-.84-.46-1.12z"/>
 </svg>
 )}
 <span>{method === 'card' ? 'Card' : method.charAt(0).toUpperCase() + method.slice(1)} {method !== 'card' ? '(coming soon)' : ''}</span>
 </button>
 ))}
 </div>

 {/* Show pricing below Stripe elements */}
 <div className="stripe-total-compact" style={{ marginTop: 16 }}>
 <span>Total due today</span>
 <span>{displayedTotal === 0 ? 'Free today' : `$${displayedTotal}`}</span>
 </div>

 {stripeClientSecret ? (
 <Elements stripe={stripePromise} options={{ clientSecret: stripeClientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#c47756' } } }}>
 <CheckoutForm
 clientSecret={stripeClientSecret}
 onSuccess={async () => {
 setShowStripeModal(false);
 setStripeClientSecret('');
 await saveToSupabase();
 await refreshUser();
 if (onComplete) {
 onComplete({ bookingsEmail, bankChoice, designChoice, websiteName, websiteDesc, hostingChoice, planChoice, extras, scrapedData });
 }
 handleClose();
 }}
 onError={async (msg) => {
 if (msg === 'RETRY_NEEDED') {
 setStripeError('Updating payment details...');
 try {
 const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
 const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
 const activeExtras: string[] = [];
 if (extras.seo) activeExtras.push('seo');
 if (extras.ads) activeExtras.push('ads');
 if (extras.analytics) activeExtras.push('analytics');
 if (extras.social) activeExtras.push('social');
 const res = await fetch(`${supabaseUrl}/functions/v1/stripe-subscription`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
 'Apikey': supabaseAnonKey,
 },
 body: JSON.stringify({
 action: 'create_checkout',
 plan: planChoice,
 hosting_choice: hostingChoice,
 extras: activeExtras,
 include_scrape: designChoice === 'airbnb',
 email: user.email,
 user_id: user.id,
 return_url: window.location.origin + window.location.pathname + '?paid=true',
 }),
 });
 const data = await res.json();
 if (data.client_secret) {
 setStripeError('');
 setStripeClientSecret(data.client_secret);
 if (data.subscription_id) setStripeSubscriptionId(data.subscription_id);
 } else {
 setStripeError(data.error || data.message || 'Could not refresh payment. Please try again.');
 }
 } catch {
 setStripeError('Could not connect to payment server.');
 }
 return;
 }
 setStripeError(msg);
 }}
 monthlyTotal={monthlyTotal}
 />
 </Elements>
 ) : (
 <div className="stripe-loading"><div className="spinner-ring" /></div>
 )}
 {stripeError && <div className="stripe-error">{stripeError}</div>}
 </div>
 </div>
 )}

 {/* BUILDING COUNTDOWN MODAL — COMMENTED OUT
 When site creation is in progress, nothing is shown to the user.
 The sidebar PUBLISH button drives the flow for active subscribers. */}
 {/*
 {showBuilding && (
 <div className="stripe-modal-backdrop" style={{ zIndex: 99999 }}>
 <div className="stripe-modal-box" style={{ textAlign: 'center', padding: '40px 32px' }}>
 <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔨</div>
 <h1 style={{ margin: '0 0 12px 0', fontSize: '1.5rem', color: '#fff' }}>Your site is being built!</h1>
 <p style={{ color: '#aaa', fontSize: '0.95rem', margin: '0 0 24px 0', lineHeight: 1.6 }}>
 This takes about 2 minutes. Please be patient.<br/>
 You'll be redirected automatically when it's ready.
 </p>
 <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--brand, #FF6B35)', marginBottom: '8px' }}>
 {buildingCountdown}s
 </div>
 <p style={{ color: '#555', fontSize: '0.8rem', margin: 0 }}>Time remaining</p>
 </div>
 </div>
 )}
 */}

 {/* Success modal — shown after Stripe payment completes */}
 {showCongrats && (
 <div className="stripe-modal-backdrop" style={{ zIndex: 99999 }} onClick={() => setShowCongrats(false)}>
 <div className="stripe-modal-box" style={{ textAlign: 'center', padding: '40px 32px' }} onClick={e => e.stopPropagation()}>
 <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎉</div>
 <h1 style={{ margin: '0 0 12px 0', fontSize: '1.5rem', color: '#fff' }}>Well done!</h1>
 <p style={{ color: '#aaa', fontSize: '0.95rem', margin: '0 0 24px 0', lineHeight: 1.6 }}>
 Your subscription is active. You can now publish your site!
 </p>
 <button
 className="btn"
 style={{ width: '100%', fontSize: '1rem', padding: '14px' }}
 onClick={() => {
 setShowCongrats(false);
 setIsOpen(false);
 handlePublish();
 }}
 >
 Publish Now
 </button>
 <button
 onClick={() => setShowCongrats(false)}
 style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '0.85rem', cursor: 'pointer', marginTop: '12px' }}
 >
 Maybe later
 </button>
 </div>
 </div>
 )}

 {/* Quick success banner with copy command — stays until dismissed */}
 {showCongrats && congratsUrl && (
 <div
 style={{
 position: 'fixed',
 top: '24px',
 left: '50%',
 transform: 'translateX(-50%)',
 zIndex: 99999,
 background: '#1a1a1a',
 border: '1px solid #333',
 borderRadius: '12px',
 padding: '20px 28px',
 textAlign: 'center',
 boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
 minWidth: '420px',
 maxWidth: '640px',
 width: '90vw',
 }}
 >
 <div style={{ fontSize: '2rem', marginBottom: '10px' }}>✅</div>
 <p style={{ color: '#fff', fontWeight: 600, fontSize: '1rem', margin: '0 0 4px 0' }}>
 Site "{websiteName || 'Your property'}" saved to Supabase!
 </p>
 <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 12px 0' }}>
 Railway deploy triggered — your site will be live on propbook.pro shortly.
 </p>
 {deployUrl && (
 <div style={{ background: '#111', border: '1px solid #444', borderRadius: '8px', padding: '10px 14px', textAlign: 'left', marginBottom: '12px' }}>
 <code style={{ color: '#86efac', fontSize: '0.72rem', wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap' }}>{deployUrl}</code>
 </div>
 )}
 <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
 <button
 onClick={() => { setShowCongrats(false); }}
 style={{ background: 'transparent', color: '#888', border: '1px solid #444', borderRadius: '6px', padding: '6px 16px', fontSize: '0.8rem', cursor: 'pointer' }}
 >
 Done
 </button>
 </div>
 </div>
 )}

 <div className="popup-total-banner">
 <div className="popup-total-left">
 <div className="popup-total-label">Total due today</div>
 <div className="popup-total-subline">
 {hasScrape && <span className="popup-total-tag">+${scrapeFee} Airbnb scrape</span>}
 {hasScrape && hasPlan && <span className="popup-total-sep"> · </span>}
 {!hasPlan && <span className="popup-total-sep"> · Select a plan</span>}
 {hasPlan && `+$${monthlyTotal}/mo subscription`}
 </div>
 </div>
 <div className="popup-total-right">
 <div className="popup-total-amount">{displayedTotal === 0 ? 'Free today' : `$${displayedTotal}`}</div>
 <div className="popup-total-period">
 {monthlyTotal > 0 && TRIAL_CREDIT > 0 ? `+$${monthlyTotal}/mo after free month` : (monthlyTotal > 0 ? `+$${monthlyTotal}/mo` : (hasScrape ? 'due today' : ''))}
 </div>
 </div>
 {stripeError && <div className="popup-stripe-error">{stripeError}</div>}
 </div>
 </div>
 </div>
 )}

 </>
 );
}
