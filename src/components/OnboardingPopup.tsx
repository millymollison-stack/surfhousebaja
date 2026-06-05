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
 const isMountedRef = { current: true };
 const descSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
         role: 'user',
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
 const openStripeGateway = async () => {
  console.log('[openStripeGateway] running...');
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

   // Save form data before redirecting to Stripe so we can restore it on return
   await saveToSupabase();

   try {
     const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
     const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

     const activeExtras: string[] = [];
     if (extras.seo) activeExtras.push('seo');
     if (extras.ads) activeExtras.push('ads');
     if (extras.analytics) activeExtras.push('analytics');
     if (extras.social) activeExtras.push('social');

     console.log('[openStripeGateway] calling edge function...');
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
         return_url: window.location.origin + window.location.pathname + '?paid=true&tab=' + myTabId,
       }),
     });
     console.log('[openStripeGateway] response:', res.status, res.ok);
     const data = await res.json();
     console.log('[openStripeGateway] data:', data);
     if (data.url) {
       sessionStorage.setItem('stripe_redirect_initiated', myTabId);
       console.log('[DEBUG] stripe_redirect_initiated SET=' + myTabId + ', href=' + data.url);
       window.location.href = data.url;
     } else {
       setStripeError(data.error || 'Payment failed. Please try again.');
     }
   } catch(e) {
     console.error('[openStripeGateway] error:', e);
     setStripeError('Could not connect to payment server.');
   }
 };

 const [showStripeModal, setShowStripeModal] = useState(false);
 const [stripeClientSecret, setStripeClientSecret] = useState('');
 const [stripePayMethod, setStripePayMethod] = useState<'card' | 'paypal' | 'venmo'>('card');
 const [stripeSubscriptionId, setStripeSubscriptionId] = useState('');
 const [showCongrats, setShowCongrats] = useState(false);
 const [congratsUrl, setCongratsUrl] = useState('');
 const [deployUrl, setDeployUrl] = useState('');
 const [stripeProcessing, setStripeProcessing] = useState(false);
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
 // descInitialized guard: only pre-fill from scraped data on first mount.
 // After user starts typing, scrapedProperty changes should NOT wipe the field.
 useEffect(() => {
 if (!scrapedProperty) return;
 if (!descInitialized) {
 if (scrapedProperty.property_title) setWebsiteName(scrapedProperty.property_title.slice(0, 20));
 if (scrapedProperty.property_intro) setWebsiteDesc(scrapedProperty.property_intro.slice(0, 200));
 setDescInitialized(true);
 }
 }, [scrapedProperty]);

 const handleClose = () => {
 sessionStorage.setItem(POPUP_CLOSED_KEY, '1');
 setIsOpen(false);
 if (onClose) onClose();
 };

 // ── loadSavedData ───────────────────────────────────────────────────────────────────
 // Extracted to component scope so it can be called from the ?paid=true handler
 // after Stripe returns, ensuring migration property data is loaded even when
 // scrapedProperty/scrapedImages deps haven't changed.
 async function loadSavedData() {
 // If parent has fresh scraped data, use it instead of stale saved data
 if (scrapedProperty) {
 const imgs = scrapedImages?.map((img: any) => img.url) || [];
 setWebsiteName((scrapedProperty.property_title || scrapedProperty.title || '').slice(0, 20));
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
 // Auto-open popup when scraped data arrives - but NOT if user explicitly closed it
 if (!isOpen && !sessionStorage.getItem(POPUP_CLOSED_KEY)) {
 setIsOpen(true);
 }
 return;
 }

        const savedScraped = sessionStorage.getItem('popup_scraped_data');
        if (savedScraped) {
          try {
            const parsed = JSON.parse(savedScraped);
            setScrapedData(parsed);
            if (parsed.title) setWebsiteName(parsed.title.slice(0, 20));
            if (parsed.description) setWebsiteDesc(parsed.description.slice(0, 200));
          } catch { /* ignore corrupt JSON */ }
        }

        // ── After restoring all form fields, handle post-Stripe success ──────────
        if (sessionStorage.getItem('stripe_payment_done')) {
          sessionStorage.removeItem('stripe_payment_done');
          if (!isOpen) setIsOpen(true);
          setShowCongrats(true);
          const restoredName = sessionStorage.getItem('popup_website_name') || 'surfhousebaja';
          if (onImported) {
            onImported({ title: restoredName, description: sessionStorage.getItem('popup_website_desc') || '' });
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
              });
            }
          }

          return;
        }


 // Restore form field selections from sessionStorage (from before Stripe redirect)
 const savedPlan = sessionStorage.getItem('popup_plan');
 if (savedPlan) setPlanChoice(savedPlan);
 const savedHosting = sessionStorage.getItem('popup_hosting');
 if (savedHosting) setHostingChoice(savedHosting);
 const savedDesign = sessionStorage.getItem('popup_design');
 if (savedDesign) setDesignChoice(savedDesign);
 const savedName = sessionStorage.getItem('popup_website_name');
 if (savedName) setWebsiteName(savedName.slice(0, 20));
 const savedDesc = sessionStorage.getItem('popup_website_desc');
 if (savedDesc) setWebsiteDesc(savedDesc);
 const savedExtras = sessionStorage.getItem('popup_extras_seo');
 if (savedExtras) setExtras({ seo: savedExtras === 'true', ads: sessionStorage.getItem('popup_extras_ads') === 'true', analytics: sessionStorage.getItem('popup_extras_analytics') === 'true', social: sessionStorage.getItem('popup_extras_social') === 'true' });

 try {
 const { data, error } = await supabase
 .from('onboarding_data')
 .select('*')
 .eq('user_id', user?.id || '')
 .maybeSingle();

 if (error && error.code !== 'PGRST116') {
 console.warn('Could not load saved onboarding data:', error.message);
 return;
 }

 if (data) {
 // Populate form fields from saved data
 if (data.property_name) setWebsiteName(data.property_name.slice(0, 20));
 if (data.property_desc) setWebsiteDesc(data.property_desc);
 if (data.airbnb_url) setAirbnbUrl(data.airbnb_url);
 if (data.design_choice) setDesignChoice(data.design_choice);
 if (data.bank_choice) setBankChoice(data.bank_choice);
 if (data.hosting_choice) setHostingChoice(data.hosting_choice);
 if (data.plan_choice) setPlanChoice(data.plan_choice);
 if (data.bookings_email) setBookingsEmail(data.bookings_email);

 // Reconstruct scrapedData from saved fields
 if (data.hero_image || (data.images && data.images.length > 0)) {
 setScrapedData({
 title: data.property_name || '',
 location: data.location || '',
 description: data.property_desc || '',
 price: data.price || '',
 hero_image: data.hero_image || '',
 images: data.images || [],
 guests: data.guests,
 bedrooms: data.bedrooms,
 beds: data.beds,
 baths: data.baths,
 rating: data.rating,
 reviews: data.reviews,
 host_name: data.host_name,
 });
 }
 }
 } catch (err) {
 console.warn('Supabase load error (table may not exist yet):', err);
 }
 }

 // Keep calling loadSavedData when scrapedProperty/scrapedImages change
 loadSavedData();
 }, [scrapedProperty, scrapedImages]);

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
 setWebsiteName(cleaned.slice(0, 20));
 };
 const handleDescChange = (val: string) => {
 setWebsiteDesc(val);
 // Debounce the preview sync so typing keeps up - fire every 1s of inactivity
 clearTimeout(descSyncTimer.current);
 descSyncTimer.current = setTimeout(() => {
 if (onImported) onImported({ title: websiteName.trim() || 'surfhousebaja', description: val });
 }, 1000);
 };
 const handleNameBlur = () => {
 if (onSiteNameChange) {
 // Strip ALL leading @ to ensure we never double up, no matter where the value came from
 const stripped = websiteName.replace(/^@+/, '');
 const display = stripped.trim().length > 0 ? '@' + stripped.trim().slice(0, 20) : '@surfhousebaja';
 onSiteNameChange(display);
 }
 if (onImported) {
 onImported({ title: websiteName.trim() || 'surfhousebaja', description: websiteDesc });
 }
 };
 const handleDescBlur = () => {
 if (onImported) {
 onImported({ title: websiteName.trim() || 'surfhousebaja', description: websiteDesc });
 }
 };

 // Sync description to template (fires independently, no stale name capture)
 // Auto-open popup on mount (2s delay). Check sessionStorage so that if the user
 // closed the popup (which sets sessionStorage), we skip the auto-open after remount.
 useEffect(() => {
 isMountedRef.current = true;
 const timer = setTimeout(() => {
 if (isMountedRef.current && !sessionStorage.getItem(POPUP_CLOSED_KEY)) {
 setIsOpen(true);
 }
 }, 2000);
 return () => {
 isMountedRef.current = false;
 clearTimeout(timer);
 };
 }, []);

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

 // Handle return from Stripe Checkout redirect - ?paid=true&session_id=XXX
 // Clean approach: verify payment directly with Stripe, no webhook needed.
 useEffect(() => {
  console.log('[DEBUG] useEffect fired, full URL:', window.location.href);
  const params = new URLSearchParams(window.location.search);
  if (!params.has('paid') || !params.has('session_id')) return;

  const sessionId = params.get('session_id')!;
  console.log('[DEBUG ?paid handler] Payment complete, verifying session:', sessionId);

  // Clear URL immediately
  window.history.replaceState({}, '', window.location.pathname);

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
        return;
      }

      // ── Step 1: Verify payment directly with Stripe ───────────────────────────
      // Call our edge function which uses the secret key to verify with Stripe
      const sessionRes = await fetch(`${supabaseUrl}/functions/v1/stripe-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'Apikey': supabaseAnonKey,
        },
        body: JSON.stringify({ action: 'get_session', session_id: sessionId }),
      });

      const sessionData = await sessionRes.json();
      console.log('[DEBUG ?paid handler] Session data from Stripe:', JSON.stringify(sessionData));

      if (sessionData.status !== 'complete') {
        setStripeError('Payment not confirmed by Stripe. Status: ' + sessionData.status);
        setStripeProcessing(false);
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

      // ── Step 3: Refresh auth so sidebar sees the subscription ───────────────
      await refreshUser();

      // ── Step 4: Tell sidebar to update ─────────────────────────────────────
      window.dispatchEvent(new CustomEvent('subscription-updated', {
        detail: { subscription_id: sessionData.subscription_id, status: sessionData.sub_status || 'active' },
      }));

      // ── Step 5: Show success! ───────────────────────────────────────────────
      setShowCongrats(true);
      window.alert('Payment successful! Your subscription is now active.');

    } catch (err) {
      console.error('[DEBUG ?paid handler] Error:', err);
      setStripeError('Payment verified but failed to save. Please refresh and check your sidebar.');
    } finally {
      setStripeProcessing(false);
    }
  })();
 }, []); // fires once on mount when URL has ?paid=true
 — fires once on mount when URL has ?paid=true


 // Save or update onboarding data in Supabase
 const saveToSupabase = async (overrides: any = {}) => {
 if (!user) return;
 try {
 const row = {
 user_id: user.id,
 property_name: websiteName,
 property_desc: websiteDesc,
 airbnb_url: airbnbUrl,
 design_choice: designChoice,
 bank_choice: bankChoice,
 hosting_choice: hostingChoice,
 plan_choice: planChoice,
 email: user.email,
 bookings_email: bookingsEmail,
 extras: extras,
 updated_at: new Date().toISOString(),
 ...overrides,
 };

 const { error } = await supabase
 .from('onboarding_data')
 .upsert(row, { onConflict: 'user_id' });

 if (error) {
 console.warn('Supabase save error:', error.message);
 } else {
 console.log('Saved to Supabase onboarding_data');
 }
 } catch (err) {
 console.warn('Could not save to Supabase (table may not exist yet):', err);
 }
 };

 const SCRAPER_URL = 'https://airbnb-scraper-foj1.onrender.com';

 const handleAirbnbScrape = async (_e?: React.MouseEvent) => {
 if (!airbnbUrl) { setImportError('Please enter an Airbnb URL'); return; }
 setIsImporting(true);
 setImportError('');
 setCountdown(120);

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
 setScrapedData(data);
 if (data.title) setWebsiteName(data.title.slice(0, 20));
 if (data.description) setWebsiteDesc(data.description.slice(0, 200));
 if (onImported) onImported({ ...data, hero_image: data.images?.[1] || data.hero_image });
 await saveToSupabase();
 } else {
 setImportError('Failed to import listing. Please check the URL and try again.');
 }
 } catch (err) {
 clearInterval(countInterval);
 setImportError('Could not reach the scraper service. It may be waking up - please wait 60 seconds and try again.');
 } finally {
 setIsImporting(false);
 setCountdown(0);
 }
 };
 const handlePublish = async (_e?: React.MouseEvent) => {
   // If user already has an active subscription, save the site directly (no Stripe redirect)
   if (user?.stripe_subscription_status === 'active' || user?.stripe_subscription_status === 'trialing') {
     await handleSaveSiteInPopup();
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
   await saveToSupabase();
   setStripeProcessing(true);

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
         return_url: window.location.origin + window.location.pathname + '?paid=true&tab=' + myTabId,
       }),
     });

     const data = await res.json();

     if (!data.url) {
       setStripeError(data.error || 'Could not initialise payment. Please try again.');
       return;
     }

     // Redirect to Stripe Checkout hosted page
     sessionStorage.setItem('popup_plan', planChoice);
     sessionStorage.setItem('popup_hosting', hostingChoice);
     sessionStorage.setItem('popup_design', designChoice);
     sessionStorage.setItem('popup_extras_seo', extras.seo ? 'true' : 'false');
     sessionStorage.setItem('popup_extras_ads', extras.ads ? 'true' : 'false');
     sessionStorage.setItem('popup_extras_analytics', extras.analytics ? 'true' : 'false');
     sessionStorage.setItem('popup_extras_social', extras.social ? 'true' : 'false');
     sessionStorage.setItem('popup_website_name', websiteName);
     sessionStorage.setItem('popup_website_desc', websiteDesc);
     // Persist scraped data so it survives the Stripe redirect remount
     if (scrapedData) {
       sessionStorage.setItem('popup_scraped_data', JSON.stringify(scrapedData));
     }
     console.log('[DEBUG] About to redirect to: ' + data.url);
     window.location.href = data.url;
   } catch {
     setStripeError('Could not connect to payment server. Please try again.');
   }
 };

 const handleSaveSiteInPopup = async () => {
   if (!user) return;
   setSavingSite(true);
   try {
     const { createNewSiteRecords, loadTemplateHtml, generateSiteHtml, duplicateSiteAfterPayment } = await import('../services/siteDuplicationService');
     // Use popup's live scrapedData state (freshest — set when parent passes scrapedProperty)
     // Don't rely on sessionStorage which may be empty/stale
     const data = {
       email: user.email,
       userId: user.id,
       userStripeAccountId: popupConnectAccountId || null,
       bookingsEmail: user.email,
       websiteName: websiteName || user.full_name || 'My Property',
       websiteDesc: websiteDesc || '',
       planChoice: planChoice as 'starter' | 'pro' | 'agency',
       hostingChoice: hostingChoice as 'our' | 'own',
       designChoice: designChoice,
       extras: { seo: extras.seo, ads: extras.ads, analytics: extras.analytics, social: extras.social },
       // Use the React state scrapedData — it's always fresher than sessionStorage
       scrapedData: scrapedData || null,
       bankChoice: bankChoice,
     };
     const template = await loadTemplateHtml();
     const html = generateSiteHtml(template, data);
     sessionStorage.setItem('popup_generated_html', html);
     const result = await createNewSiteRecords(data);
     sessionStorage.setItem('popup_site_url', result.siteUrl);
     sessionStorage.setItem('popup_site_phase', 'saved');

     // Get the copy command for the terminal
     const dupResult = await duplicateSiteAfterPayment(result.slug, result.propertyId);

     // ── Open the admin sidebar immediately so they can see their data ──
     if (onOpenSidebar) onOpenSidebar();

     // Show success banner — Railway deploy triggered automatically
     setCongratsUrl(result.siteUrl);
     setDeployUrl(dupResult.deployUrl);
     setSavingSite(false);
     setIsOpen(false);
     setShowCongrats(true);
   } catch (err) {
     console.error('[PopupSaveSite] error:', err);
     setStripeError('Failed to save site. Check DevTools console.');
     setSavingSite(false);
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
 <p>Input your card details with our 3rd-party, secure payment partner.</p>
 <button
 className="btn"
 onClick={() => { openStripeGateway() }}>
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
     : (stripeProcessing ? 'REDIRECTING...' : 'PUBLISH MY SITE')}
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
