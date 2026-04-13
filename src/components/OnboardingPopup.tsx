import React, { useState, useEffect } from 'react';
import './styles.css';
import { TemplatePreview } from './TemplatePreview';
import { supabase } from '../lib/supabase';

// Hardcoded user ID for this template (replace with auth.user.id when auth is wired)
const TEMPLATE_USER_ID = 'surfhouse-baja-template';

export interface OnboardingPopupProps {
  onComplete?: (data: any) => void;
  onImported?: (data: any) => void;
  onClose?: () => void;
  scrapedProperty?: any | null;
  scrapedImages?: any[];
}

// Persisted flag: survives across remounts (key changes) so user-closed state is not lost
const POPUP_CLOSED_KEY = 'onboarding_popup_closed';

export function OnboardingPopup({ onComplete, onImported, onClose, scrapedProperty, scrapedImages }: OnboardingPopupProps) {
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

  // Airbnb scrape state
  const [airbnbUrl, setAirbnbUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [importError, setImportError] = useState('');
  const [scrapedData, setScrapedData] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

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
        setWebsiteName(scrapedProperty.property_title || scrapedProperty.title || '');
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
          if (data.property_name) setWebsiteName(data.property_name);
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

  const handleAirbnbScrape = async () => {
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
        if (data.title) setWebsiteName(data.title);
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

  const handlePublish = async () => {
    await saveToSupabase();
    if (onComplete) {
      onComplete({
        email, bookingsEmail, adminRequest, bankChoice, designChoice,
        websiteName, websiteDesc, hostingChoice, planChoice, extras,
        scrapedData
      });
    }
    handleClose();
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
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <h4 className="h4">Password</h4>
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
            <ul className="popup-checkbox-list">
              <li>
                <input type="checkbox" id="1-1" checked={adminRequest} onChange={e => setAdminRequest(e.target.checked)} />
                <label htmlFor="1-1">Request admin account</label>
              </li>
            </ul>
            <p className="popup-note">Enter the email address you would like your booking notifications to be sent.</p>
            <h4 className="h4">Bookings email</h4>
            <input type="email" placeholder="Bookings email" value={bookingsEmail} onChange={e => setBookingsEmail(e.target.value)} />
            <br />
            <button className="btn">Create Admin Account</button>
            <br />
            <p className="popup-note">Respond to the verification email now to get verified. Then sign into your website as the Admin.</p>
            <br /><hr />

            {/* Sign In */}
            <h1 className="h1 popup-mt">Sign In</h1>
            <h4 className="h4">Email</h4>
            <input type="email" placeholder="Email" />
            <h4 className="h4">Password</h4>
            <input type="password" placeholder="Password" />
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
                  value={airbnbUrl}
                  onChange={e => setAirbnbUrl(e.target.value)}
                />
                <button
                  className="btn"
                  onClick={handleAirbnbScrape}
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

            <p className="popup-note popup-top">Choose your brand color to highlight buttons and call out text.</p>
            <button className="btn">Launch color picker</button>

            <hr />

            {/* Name property */}
            <h1 className="h1">3. Name your property</h1>
            <h4 className="h4">Website name</h4>
            <input type="text" placeholder="Website name" value={websiteName} onChange={e => setWebsiteName(e.target.value)} />
            <h4 className="h4">Website description</h4>
            <textarea rows="2" cols="50" placeholder="Website description" value={websiteDesc} onChange={e => setWebsiteDesc(e.target.value)} />
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
            <button className="btn">Open payment gateway</button>
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
              onClick={handlePublish}
              disabled={!agreed}
            >
              PUBLISH MY SITE
            </button>
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
        </div>
      )}
    </>
  );
}
