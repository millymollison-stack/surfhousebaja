import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/pages/CustomerSite.tsx', 'utf8');

// Fix handleStripeRedirect properly:
// - Logged-in user: do NOT remove key, let banner handle it
// - Logged-out user: remove key now, show old modal
const oldFn = `function handleStripeRedirect() {
  // ── Step 1: Check sessionStorage first (set by OnboardingPopup before redirect) ──
  // NOTE: When user is logged in, we skip the old modal and let the subscription
  // banner useEffect handle it. We do NOT remove the key so the banner can read it.
  const storedRaw = sessionStorage.getItem('stripe_paid_session');
  if (storedRaw) {
    try {
      const { sessionId, planName, siteUrl } = JSON.parse(storedRaw);
      if (sessionId) {
        console.log('[Stripe redirect] Found paid session in sessionStorage:', sessionId, planName);
        // Check if user is logged in — if so, skip modal, let banner handle it
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            // Not logged in — show old modal (user needs to auth after Stripe)
            sessionStorage.removeItem('stripe_paid_session');
            showStripeSuccessModal(siteUrl, planName);
          }
          // If logged in: leave sessionStorage for banner useEffect to consume
        });
        return;
      }
    } catch { /* ignore parse errors */ }
  }`;

const newFn = `function handleStripeRedirect() {
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

content = content.replace(oldFn, newFn);
writeFileSync('src/pages/CustomerSite.tsx', content);
console.log('Patched v3 - synchronous session check');
