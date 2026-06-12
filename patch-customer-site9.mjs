import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/pages/CustomerSite.tsx', 'utf8');

// Fix handleStripeRedirect: set stripe_banner_pending SYNCHRONOUSLY when stripe_paid_session is found
// The async .then() is only for logging/differentiation between logged-in and logged-out cases
const oldFn = `function handleStripeRedirect() {
  // ── Step 1: Check sessionStorage first (set by OnboardingPopup before redirect) ──
  // Always remove stripe_paid_session immediately to prevent double-fire.
  // For logged-in users: set stripe_banner_pending so banner useEffect shows confirmation.
  // For logged-out users: show old modal (banner only shows for logged-in).
  const storedRaw = sessionStorage.getItem('stripe_paid_session');
  if (storedRaw) {
    sessionStorage.removeItem('stripe_paid_session');
    try {
      const { sessionId, planName, siteUrl } = JSON.parse(storedRaw);
      if (sessionId) {
        console.log('[Stripe redirect] Found paid session in sessionStorage:', sessionId, planName);
        // Check auth async — use then() to avoid blocking
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            // Logged in — set signal key for banner useEffect
            sessionStorage.setItem('stripe_banner_pending', JSON.stringify({ planName, siteUrl }));
            console.log('[Stripe redirect] User logged in — banner will confirm subscription');
          } else {
            // Not logged in — show old modal
            showStripeSuccessModal(siteUrl, planName);
          }
        });
        return;
      }
    } catch { /* ignore parse errors */ }
  }`;

const newFn = `function handleStripeRedirect() {
  // ── Step 1: Check sessionStorage first (set by OnboardingPopup before redirect) ──
  // Always remove stripe_paid_session immediately to prevent double-fire.
  // ALWAYS set stripe_banner_pending synchronously — banner useEffect will handle confirmation.
  // For logged-in users: banner shows green confirmation.
  // For logged-out users: banner won't show (no session), but user will auth first anyway.
  const storedRaw = sessionStorage.getItem('stripe_paid_session');
  if (storedRaw) {
    sessionStorage.removeItem('stripe_paid_session');
    try {
      const { sessionId, planName, siteUrl } = JSON.parse(storedRaw);
      if (sessionId) {
        console.log('[Stripe redirect] Found paid session in sessionStorage:', sessionId, planName);
        // Set signal for banner SYNCHRONOUSLY — banner fires in same render cycle
        sessionStorage.setItem('stripe_banner_pending', JSON.stringify({ planName, siteUrl }));
        console.log('[Stripe redirect] Set stripe_banner_pending for subscription banner');
        return;
      }
    } catch { /* ignore parse errors */ }
  }`;

content = content.replace(oldFn, newFn);
writeFileSync('src/pages/CustomerSite.tsx', content);
console.log('Patched v7 - synchronous signal key');
