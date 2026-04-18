import React, { useState, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import './styles.css';
import './OnboardingPopup.css';
import { TemplatePreview } from './TemplatePreview';
import { FontDropdown } from './FontDropdown';
import { supabase } from '../lib/supabase';
import { saveBrandColor } from '../lib/brandColor';

// Hardcoded user ID for this template (replace with auth.user.id when auth is wired)
const TEMPLATE_USER_ID = 'surfhouse-baja-template';

export interface OnboardingPopupProps {
  onComplete?: (data: any) => void;
  onImported?: (data: any) => void;
  onClose?: () => void;
  scrapedProperty?: any | null;
  onSiteNameChange?: (name: string) => void;
  scrapedImages?: any[];
  onSiteNameChange?: (name: string) => void;
}

// Persisted flag: survives across remounts (key changes) so user-closed state is not lost
const POPUP_CLOSED_KEY = 'onboarding_popup_closed';


// ── Stripe CheckoutForm (must be inside <Elements> context) ─────────────────
function CheckoutForm({ clientSecret, onSuccess, onError, monthlyTotal, isSetup }: {
  clientSecret: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
  monthlyTotal: number;
  isSetup?: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    let error;
    if (isSetup) {
      const result = await stripe.confirmCardSetup(clientSecret, { elements });
      error = result.error;
    } else {
      const result = await stripe.confirmPayment({
        elements,
        clientSecret,
        redirect: 'if_required',
        confirmParams: { return_url: window.location.origin + '?paid=true' },
      });
      error = result.error;
    }
    setProcessing(false);
    if (error) {
      onError(error.message || 'Payment failed.');
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 400, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ marginBottom: 16, color: '#fff', fontSize: '0.95rem' }}>
        <div style={{ marginBottom: 6 }}>Card details</div>
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '12px 8px' }}>
          <PaymentElement options={{ layout: 'tabs' }} />
        </div>
      </div>
      <button
        type="submit"
        disabled={!stripe || processing}
        className="btn"
        style={{ width: '100%', fontSize: '1rem' }}
      >
        {processing ? (isSetup ? 'Saving card...' : 'Processing...') : (isSetup ? 'Save card for subscription' : `Pay $${displayedTotal}`)}
      </button>
    </form>
  );
}

export function OnboardingPopup({ onComplete, onImported, onClose, scrapedProperty, scrapedImages, onSiteNameChange }: OnboardingPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Tracks whether this popup instance is still mounted (used to cancel auto-open timer on unmount)
  const isMountedRef = { current: true };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bookingsEmail, setBookingsEmail] = useState('');
  const [adminRequest, setAdminRequest] = useState(false);
  const [bankChoice, setBankChoice] = useState('');
  const [designChoice, setDesignChoice] = useState('');
  const [websiteName, setWebsiteName] = useState('');
  const [websiteDesc, setWebsiteDesc] = useState('');
  const [hostingChoice, setHostingChoice] = useState('');
  const [planChoice, setPlanChoice] = useState('');
  const [extras, setExtras] = useState({ seo: false, ads: false, analytics: false, social: false });
  const [agreed, setAgreed] = useState(false);
  const [stripeError, setStripeError] = useState('');
  const openStripeGateway = async () => {
    if (!email || !email.includes('@')) {
      setStripeError('Please enter your email address first.');
      return;
    }
    if (!planChoice) {
      setStripeError('Please select a subscription plan first.');
      return;
    }
    setStripeError('');
    const isSetup = displayedTotal === 0;
    setStripeIsSetup(isSetup);
    setShowStripeModal(true);
    try {
      const endpoint = isSetup ? '/create-setup-intent' : '/create-payment-intent';
      const reqBody = isSetup
        ? { customerEmail: email }
        : {
            amount: Math.round(displayedTotal * 100),
            currency: 'usd',
            customerEmail: email,
            hasTrial: TRIAL_CREDIT > 0,
            planKey: planChoice,
            priceId: planChoice === 'starter' ? 'price_1TNJxlK5ECFjIqP3js6qeCyf' : planChoice === 'pro' ? 'price_1TNJxlK5ECFjIqP3bhOTGvL5' : planChoice === 'agency' ? 'price_1TNJxmK5ECFjIqP32ZWgrKde' : null,
          };
      const res = await fetch('http://localhost:3099' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const data = await res.json();
      if (data.clientSecret) {
        setStripeClientSecret(data.clientSecret);
      } else {
        setStripeError(data.error || 'Could not initialise payment.');
        setShowStripeModal(false);
      }
    } catch (e) {
      setStripeError('Could not connect to payment server.');
      setShowStripeModal(false);
    }
  };

  const [showStripeModal, setShowStripeModal] = useState(false);
  const [stripeClientSecret, setStripeClientSecret] = useState('');
  const [stripePayMethod, setStripePayMethod] = useState<'card' | 'paypal' | 'venmo'>('card');
  const [stripeIsSetup, setStripeIsSetup] = useState(false);

  // Stripe payment element ref
  const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

  // Payment calculator
  const pricing = {
    scrape: 10, // one-time Airbnb scrape fee
    plans: { starter: 10, pro: 30, agency: 150 },
    hosting: { own: 0, our: 5 },
    extras: { seo: 10, ads: 30, analytics: 20, social: 50 },
  };
  const scrapeFee = designChoice === 'airbnb' ? pricing.scrape : 0;

  const fontOptions = [
    'Playfair Display',
    'Cormorant Garamond',
    'DM Serif Display',
    'Fraunces',
    'Space Grotesk',
    'Josefin Sans',
    'Archivo Black',
    'Abril Fatface',
    'Righteous',
    'Pacifico',
  ];
  // First month free for Starter plan
  const TRIAL_CREDIT = planChoice === 'starter' ? (pricing.plans.starter || 0) : 0;

  const monthlyTotal = (pricing.plans[planChoice as keyof typeof pricing.plans] || 0)
    + (pricing.hosting[hostingChoice as keyof typeof pricing.hosting] || 0)
    + (extras.seo ? pricing.extras.seo : 0)
    + (extras.ads ? pricing.extras.ads : 0)
    + (extras.analytics ? pricing.extras.analytics : 0)
    + (extras.social ? pricing.extras.social : 0);

  // Amount shown in banner (after trial credit for Starter)
  const displayedTotal = scrapeFee + Math.max(0, monthlyTotal - TRIAL_CREDIT);
  const hasPlan = !!planChoice;
  const hasScrape = designChoice === 'airbnb';

  // Airbnb scrape state
  const [airbnbUrl, setAirbnbUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [importError, setImportError] = useState('');
  const [scrapedData, setScrapedData] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
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
  useEffect(() => {
    if (scrapedProperty) {
      if (scrapedProperty.property_title) setWebsiteName(scrapedProperty.property_title.slice(0, 20));
      if (scrapedProperty.property_intro) setWebsiteDesc(scrapedProperty.property_intro.slice(0, 200));
    }
  }, [scrapedProperty]);

  const handleClose = () => {
    sessionStorage.setItem(POPUP_CLOSED_KEY, '1');
    setIsOpen(false);
    if (onClose) onClose();
  };

  // Load saved onboarding data from Supabase on mount
  // Load saved data from Supabase on mount
  useEffect(() => {
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
        // Auto-open popup when scraped data arrives — but NOT if user explicitly closed it
        if (!isOpen && !sessionStorage.getItem(POPUP_CLOSED_KEY)) {
          setIsOpen(true);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from('onboarding_data')
          .select('*')
          .eq('user_id', TEMPLATE_USER_ID)
          .single();

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
          if (data.email) setEmail(data.email);
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

    loadSavedData();
  }, [scrapedProperty, scrapedImages]);

  // Sync websiteName to header AND to New Site Template
  useEffect(() => {
    if (!onSiteNameChange) return;
    const trimmed = websiteName.trim();
    const display = trimmed.length > 0 ? '@' + trimmed.slice(0, 20) : '@surfhousebaja';
    onSiteNameChange(display);
  }, [websiteName, onSiteNameChange]);

  // Sync name to header (immediate) and template (on change — real-time)
  const handleNameChange = (val: string) => {
    setWebsiteName(val.slice(0, 20));
    if (onSiteNameChange) {
      const trimmed = val.trim();
      onSiteNameChange(trimmed.length > 0 ? '@' + trimmed.slice(0, 20) : '@surfhousebaja');
    }
    if (onImported) {
      onImported({ title: val.trim() || 'surfhousebaja', description: websiteDesc });
    }
  };
  const handleDescChange = (val: string) => {
    setWebsiteDesc(val);
    if (onImported) {
      onImported({ title: websiteName.trim() || 'surfhousebaja', description: val });
    }
  };
  const handleNameBlur = () => {
    if (onSiteNameChange) {
      const trimmed = websiteName.trim();
      onSiteNameChange(trimmed.length > 0 ? '@' + trimmed.slice(0, 20) : '@surfhousebaja');
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


  // Save or update onboarding data in Supabase
  const saveToSupabase = async (overrides: any = {}) => {
    try {
      // Only save account/form data — NOT scraped data (that lives in React state only)
      const row = {
        user_id: TEMPLATE_USER_ID,
        property_name: websiteName,
        property_desc: websiteDesc,
        airbnb_url: airbnbUrl,
        design_choice: designChoice,
        bank_choice: bankChoice,
        hosting_choice: hostingChoice,
        plan_choice: planChoice,
        email,
        bookings_email: bookingsEmail,
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

  const handleAirbnbScrape = async (_e?: React.MouseEvent) => {
    if (!airbnbUrl) { setImportError('Please enter an Airbnb URL'); return; }
    setIsImporting(true);
    setImportError('');
    setCountdown(20);

    const countInterval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(countInterval); return 0; }
        return c - 1;
      });
    }, 1000);

    try {
      const resp = await fetch(`http://localhost:6905/scrape?url=${encodeURIComponent(airbnbUrl)}`);
      const result = await resp.json();
      clearInterval(countInterval);
      if (result.success) {
        const data = result.data;
        setScrapedData(data);
        if (data.title) setWebsiteName(data.title.slice(0, 20));
        if (data.description) setWebsiteDesc(data.description.slice(0, 200));
        if (onImported) onImported({ ...data, hero_image: data.images?.[1] || data.hero_image });
        // Save to Supabase immediately after scrape
        await saveToSupabase();
      } else {
        setImportError('Failed to import listing. Please check the URL.');
      }
    } catch (err) {
      clearInterval(countInterval);
      setImportError('Could not reach scraper service.');
    } finally {
      setIsImporting(false);
      setCountdown(0);
    }
  };

  const handlePublish = async (_e?: React.MouseEvent) => {
    if (!email || !email.includes('@')) {
      setStripeError('Please enter your email address first.');
      return;
    }
    if (!planChoice) {
      setStripeError('Please select a subscription plan first.');
      return;
    }
    setStripeError('');
    
    // Create payment intent on your backend and get clientSecret
    // Replace with your actual endpoint that calls Stripe API
    let clientSecret = '';
    try {
      const res = await fetch('http://localhost:3099/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(monthlyTotal * 100),
          currency: 'usd',
        }),
      });
      const data = await res.json();
      clientSecret = data.clientSecret;
    } catch (e) {
      console.error('Payment intent error:', e);
      setStripeError('Could not connect to payment system. Please try again.');
      return;
    }

    if (!clientSecret) {
      setStripeError('Payment setup failed. Please try again.');
      return;
    }

    // Confirm payment client-side
    const stripeInst = await stripePromise;
    if (!stripeInst) {
      setStripeError('Stripe failed to load. Please refresh and try again.');
      return;
    }
    const { error } = await stripeInst.confirmPayment({
      clientSecret,
      confirmParams: { return_url: window.location.origin + '?published=true' },
      redirect: 'if_required',
    });

    if (error) {
      setStripeError(error.message || 'Payment failed. Please try again.');
    } else {
      await saveToSupabase();
      if (onComplete) {
        onComplete({
          email, bookingsEmail, adminRequest, bankChoice, designChoice,
          websiteName, websiteDesc, hostingChoice, planChoice, extras,
          scrapedData
        });
      }
      handleClose();
    }
  };

  // Debug toggle - press D on keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') setShowDebug(v => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  

  return (
    <>
      {isOpen && (
        <div className="popup-backdrop" onClick={handleClose}>
          <div className="popup-modal" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleClose} className="popup-close">×</button>

            {/* Intro */}
            <h1 className="h1">Create your site</h1>
            <h3 className="h3">After you complete this sign up process, you&apos;ll receive a link to your hosted website template. You can then open your site on your phone or desktop browser and customize it by adding photos, editing text, and manage incoming bookings at your convenience. Let&apos;s create your account.</h3>
            <p className="popup-note">You will be able to edit these details later from your site&apos;s dashboard.</p>
            <br /><hr />

            {/* Sign Up */}
            <h1 className="h1 popup-mt">Sign Up</h1>
            <h3 className="h3">Create your new sites admin account.</h3>
            <h4 className="h4">Email</h4>
            <input type="email" placeholder="Email" className="editmode" value={email} onChange={e => setEmail(e.target.value)} />
            <h4 className="h4">Password</h4>
            <input type="password" placeholder="Password" className="editmode" value={password} onChange={e => setPassword(e.target.value)} />
            <ul className="popup-checkbox-list">
              <li>
                <input type="checkbox" id="1-1" checked={adminRequest} onChange={e => setAdminRequest(e.target.checked)} />
                <label htmlFor="1-1">Request admin account</label>
              </li>
            </ul>
            <p className="popup-note">Enter the email address you would like your booking notifications to be sent.</p>
            <h4 className="h4">Bookings email</h4>
            <input type="email" placeholder="Bookings email" className="editmode" value={bookingsEmail} onChange={e => setBookingsEmail(e.target.value)} />
            <br />
            <button className="btn">Create Admin Account</button>
            <br />
            <p className="popup-note">Respond to the verification email now to get verified. Then sign into your website as the Admin.</p>
            <br /><hr />

            {/* Sign In */}
            <h1 className="h1 popup-mt">Sign In</h1>
            <h4 className="h4">Email</h4>
            <input type="email" placeholder="Email" className="editmode" />
            <h4 className="h4">Password</h4>
            <input type="password" placeholder="Password" className="editmode" />
            <br />
            <button className="btn">Sign In</button>
            <br /><br /><hr />

            {/* Banking Details */}
            <h1 className="h1">1. Banking Details</h1>
            <h3 className="h3 popup-mt">Now you are signed in, lets set up the important stuff. How do you want to get paid?</h3>
            <ul>
              <li>
                <input type="radio" name="bank" id="2-1" checked={bankChoice === 'bank'} onChange={() => setBankChoice('bank')} />
                <label htmlFor="2-1">Bank - 4 - 8% processing fee</label>
              </li>
              <li>
                <input type="radio" name="bank" id="2-2" checked={bankChoice === 'venmo'} onChange={() => setBankChoice('venmo')} />
                <label htmlFor="2-2">Venmo - 6% processing fee</label>
              </li>
              <li>
                <input type="radio" name="bank" id="2-3" checked={bankChoice === 'paypal'} onChange={() => setBankChoice('paypal')} />
                <label htmlFor="2-3">PayPal - 6% processing fee</label>
              </li>
            </ul>
            <br />
            <p className="popup-note">Your banking information is held by your 3rd‑party payment platform</p>
            <button className="btn">Link your account</button>
            <br /><br /><hr />

            {/* Design */}
            <h1 className="h1">2. Design your website</h1>
            <ul>
              <li>
                <input type="radio" name="design" id="3-1" checked={designChoice === 'manual'} onChange={() => { setDesignChoice('manual'); setScrapedData(null); }} />
                <label htmlFor="3-1">Manual photo and text upload - no fee</label>
              </li>
            </ul>
            {designChoice === 'manual' && (
              <div className="popup-airbnb-section">
                <h4 className="h4">Upload property photos</h4>
                <p className="popup-note">Add photos from your phone or computer. The first photo becomes the hero image.</p>
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
                  <p className="popup-note" style={{ marginTop: '6px' }}>Click a photo to make it the hero. {manualImages.length} photo(s) added.</p>
                )}
                {manualImages.length > 0 && (
                  <div className="popup-preview" style={{ marginTop: '16px' }}>
                    <p className="popup-preview-label">Preview:</p>
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
                <label htmlFor="3-2">Airbnb profile import - $10, one off fee</label>
              </li>
            </ul>

            {/* Airbnb import — shown only when Airbnb radio is selected */}
            {designChoice === 'airbnb' && (
              <div className="popup-airbnb-section">
                <h4 className="h4">Airbnb Listing URL</h4>
                <input
                  type="text"
                  placeholder="https://www.airbnb.com/rooms/123456789"
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
                {importError && <p className="popup-error">{importError}</p>}
                {isImporting && (
                  <p className="popup-note">Please wait — scraping your listing...</p>
                )}

                {/* Preview — appears below Get data after import */}
                {scrapedData && (
                  <div className="popup-preview">
                    <p className="popup-preview-label">Preview:</p>
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

            <p className="popup-note popup-top">Accent/Brand color for buttons and highlights.</p>
            <button className="btn" onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }} style={{ backgroundColor: showColorPicker ? "var(--brand-hover)" : "var(--brand)" }}>
    {showColorPicker ? "Close color picker" : "Launch color picker"}
  </button>
  {showColorPicker && (
    <div className="popup-color-picker">
      <div className="popup-color-grid">
        {['#C47756','#2563eb','#16a34a','#9333ea','#dc2626','#0891b2','#d97706','#374151','#ffffff','#111111'].map(hex => (
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
              <h3 className="h3 popup-mt">Font accent</h3>
              <p className="popup-note">Select your font choice for headings.</p>
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
            <h1 className="h1">3. Name your property</h1>
            <h4 className="h4">Website name</h4>
            <input type="text" placeholder="Website name (max 20 chars)" className="editmode" value={websiteName} onChange={e => handleNameChange(e.target.value)} onBlur={handleNameBlur} />
            <h4 className="h4">Website description</h4>
            <textarea
              placeholder="Website description"
              className="popup-textarea editmode"
              value={websiteDesc}
              onChange={e => handleDescChange(e.target.value)}
              onBlur={handleDescBlur}
            />
            <p className="popup-note popup-top">Check your property name against available URLs so you can buy that domain and point it to your hosting server.</p>
            <button className="btn">Launch Name Cheap</button>

            <hr />

            {/* Hosting */}
            <h1 className="h1">4. Hosting options</h1>
            <ul>
              <li>
                <input type="radio" name="hosting" id="4-1" checked={hostingChoice === 'own'} onChange={() => setHostingChoice('own')} />
                <label htmlFor="4-1">Your own server - no fee</label>
              </li>
              <li>
                <input type="radio" name="hosting" id="4-2" checked={hostingChoice === 'our'} onChange={() => setHostingChoice('our')} />
                <label htmlFor="4-2">Published to our server - $5 per month</label>
              </li>
            </ul>
            <br /><hr />

            {/* Subscription */}
            <h1 className="h1">5. Subscription plan</h1>
            <ul>
              <li>
                <input type="radio" name="plan" id="5-1" checked={planChoice === 'starter'} onChange={() => setPlanChoice('starter')} />
                <label htmlFor="5-1">Starter – $10, 1st month free</label>
              </li>
              <li>
                <input type="radio" name="plan" id="5-2" checked={planChoice === 'pro'} onChange={() => setPlanChoice('pro')} />
                <label htmlFor="5-2">Professional – $30</label>
              </li>
              <li>
                <input type="radio" name="plan" id="5-3" checked={planChoice === 'agency'} onChange={() => setPlanChoice('agency')} />
                <label htmlFor="5-3">Agency – $150</label>
              </li>
            </ul>
            <br /><hr />

            {/* Extras */}
            <h1 className="h1">6. Optional extras</h1>
            <h3 className="h3 popup-mt">Select these options now and get a 25% discount. You will not have another chance to sign up for these services.</h3>
            <ul>
              <li>
                <input type="checkbox" id="6-1" checked={extras.seo} onChange={e => setExtras({...extras, seo: e.target.checked})} />
                <label htmlFor="6-1">AI SEO - $10 per month</label>
              </li>
              <li>
                <input type="checkbox" id="6-2" checked={extras.ads} onChange={e => setExtras({...extras, ads: e.target.checked})} />
                <label htmlFor="6-2">Ads &amp; Marketing - $30 per month</label>
              </li>
              <li>
                <input type="checkbox" id="6-3" checked={extras.analytics} onChange={e => setExtras({...extras, analytics: e.target.checked})} />
                <label htmlFor="6-3">Analytics - $20 per month</label>
              </li>
              <li>
                <input type="checkbox" id="6-4" checked={extras.social} onChange={e => setExtras({...extras, social: e.target.checked})} />
                <label htmlFor="6-4">Social Media Marketing - $50 per month</label>
              </li>
            </ul>
            <br /><hr />

            {/* Payment */}
            <h1 className="h1">Payment Calculated</h1>
            <p className="popup-note">Input your card details with our 3rd‑party, secure payment partner.</p>
            <button className="btn" onClick={openStripeGateway}>Open payment gateway</button>
            <br /><br /><hr />

            {/* Publish */}
            <h1 className="h1">7. Publish your site</h1>
            <h3 className="h3">Now you are ready to launch your very own short‑term rental booking site. Congratulations!</h3>
            <ul>
              <li>
                <input type="checkbox" id="7-1" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                <label htmlFor="7-1">Click to agree to our Terms &amp; Conditions</label>
              </li>
            </ul>
            <br />
            <button
              className="h2 publish-btn"
              onClick={(e) => { e.stopPropagation(); handlePublish(e); }}
              disabled={!agreed}
            >
              PUBLISH MY SITE
            </button>
          </div>
          
          {/* Fixed bottom total banner */}
          
      {/* Stripe Payment Modal */}
      {showStripeModal && (
        <div className="stripe-modal-backdrop" onClick={() => { setShowStripeModal(false); setStripeError(''); }}>
          <div className="stripe-modal-box" onClick={e => e.stopPropagation()}>
            <div className="stripe-modal-header">
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Secure Payment</h2>
              <button onClick={() => { setShowStripeModal(false); setStripeError(''); }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.3rem', cursor: 'pointer', padding: '0 4px' }}>×</button>
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
                  <span>{method === 'card' ? 'Card' : method.charAt(0).toUpperCase() + method.slice(1)}</span>
                </button>
              ))}
            </div>

            {/* Compact total */}
            <div className="stripe-total-compact">
              <span>{stripeIsSetup ? 'Card saved for future billing' : 'Total due today'}</span>
              <span>${displayedTotal === 0 ? 'Free today' : '$' + displayedTotal}</span>
            </div>

            {stripeClientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret: stripeClientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#c47756' } } }}>
                <CheckoutForm
                  clientSecret={stripeClientSecret}
                  onSuccess={async () => {
                    setShowStripeModal(false);
                    setStripeClientSecret('');
                    await saveToSupabase();
                    if (onComplete) {
                      onComplete({ email, bookingsEmail, adminRequest, bankChoice, designChoice, websiteName, websiteDesc, hostingChoice, planChoice, extras, scrapedData });
                    }
                    handleClose();
                  }}
                  onError={msg => setStripeError(msg)}
                  monthlyTotal={monthlyTotal}
                />
              </Elements>
            ) : (
              <div style={{ textAlign: 'center', color: '#fff', padding: '24px 0', fontSize: '0.9rem' }}>Loading...</div>
            )}
            {stripeError && <div className="popup-stripe-error" style={{ textAlign: 'center', marginTop: 8 }}>{stripeError}</div>}
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
              <div className="popup-total-amount">${displayedTotal}</div>
              <div className="popup-total-period">
                {monthlyTotal > 0 && TRIAL_CREDIT > 0 ? `+$${monthlyTotal}/mo after free month` : (monthlyTotal > 0 ? `+$${monthlyTotal}/mo` : (hasScrape ? 'due today' : ''))}
              </div>
            </div>
            {stripeError && <div className="popup-stripe-error">{stripeError}</div>}
          </div>
        </div>
      )}

      {/* Debug data page — press D to toggle */}
      {showDebug && scrapedData && (
        <div className="debug-data-overlay">
          <div className="debug-data-panel">
            <h2>Scraped Data (press D to close)</h2>
            <table>
              <tbody>
                {Object.entries(scrapedData).map(([key, val]) => (
                  <tr key={key}>
                    <td className="debug-key">{key}</td>
                    <td className="debug-val">
                      {key === 'description' && typeof val === 'string' && val.length > 200 ? (
                        <div>
                          <div className="debug-array-label">HERO SUBTITLE (first 200 chars):</div>
                          <div className="debug-string" style={{color:'#22c55e'}}>{val.slice(0, 200)}</div>
                          <div className="debug-array-label" style={{marginTop:'12px'}}>DESCRIPTION BELOW (chars {200}–{val.length}):</div>
                          <div className="debug-string" style={{color:'#f97316'}}>{val.slice(200)}</div>
                        </div>
                      ) : Array.isArray(val) ? (
                        <div>
                          <div className="debug-array-label">Array ({val.length} items):</div>
                          {(val as string[]).map((item, i) => (
                            <div key={i} className="debug-array-item">
                              <img src={item} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      ) : typeof val === 'string' && val.length > 150 ? (
                        <div>
                          <img src={val} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                          <div className="debug-string">{val.slice(0, 120)}... [{val.length} chars]</div>
                        </div>
                      ) : (
                        <span>{String(val)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Fixed bottom total banner */}
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
              <div className="popup-total-amount">${displayedTotal}</div>
              <div className="popup-total-period">
                {monthlyTotal > 0 && TRIAL_CREDIT > 0 ? `+$${monthlyTotal}/mo after free month` : (monthlyTotal > 0 ? `+$${monthlyTotal}/mo` : (hasScrape ? 'due today' : ''))}
              </div>
            </div>
            {stripeError && <div className="popup-stripe-error">{stripeError}</div>}
          </div>
        </div>
      )}
    </>
  );
}
