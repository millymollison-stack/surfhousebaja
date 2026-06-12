import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/pages/CustomerSite.tsx', 'utf8');

// Fix handleStripeRedirect: use a signal key to communicate with banner useEffect
// handleStripeRedirect: always removes stripe_paid_session
//   - Logged-in user: sets stripe_banner_pending → banner shows confirmation
//   - Logged-out user: shows old modal (no banner for logged-out)
const oldFn = `function handleStripeRedirect() {
  // ── Step 1: Check sessionStorage first (set by OnboardingPopup before redirect) ──
  // Logged-in user → leave key for subscription banner useEffect to consume
  // Logged-out user → remove key now, show old modal
  const storedRaw = sessionStorage.getItem('stripe_paid_session');
  if (storedRaw) {
    try {
      const { sessionId, planName, siteUrl } = JSON.parse(storedRaw);
      if (sessionId) {
        console.log('[Stripe redirect] Found paid session in sessionStorage:', sessionId, planName);
        const { data: { session } } = supabase.auth.getSession();
        if (session) {
          // Logged in — leave key for banner useEffect, do NOT remove
          console.log('[Stripe redirect] User logged in — leaving key for subscription banner');
          return;
        }
        // Not logged in — remove key and show old modal
        sessionStorage.removeItem('stripe_paid_session');
        showStripeSuccessModal(siteUrl, planName);
        return;
      }
    } catch { /* ignore parse errors */ }
  }`;

const newFn = `function handleStripeRedirect() {
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

content = content.replace(oldFn, newFn);
writeFileSync('src/pages/CustomerSite.tsx', content);
console.log('Patched v4 - signal key approach');
