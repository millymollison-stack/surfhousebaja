import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/pages/CustomerSite.tsx', 'utf8');

// Fix handleStripeRedirect: when user is logged in, don't show old modal, leave sessionStorage for banner
const oldHandleStripe = `function handleStripeRedirect() {
  // ── Step 1: Check sessionStorage first (set by OnboardingPopup before redirect) ──
  const storedRaw = sessionStorage.getItem('stripe_paid_session');
  if (storedRaw) {
    sessionStorage.removeItem('stripe_paid_session');
    try {
      const { sessionId, planName, siteUrl } = JSON.parse(storedRaw);
      if (sessionId) {
        console.log('[Stripe redirect] Found paid session in sessionStorage:', sessionId, planName);
        showStripeSuccessModal(siteUrl, planName);
        return;
      }
    } catch { /* ignore parse errors */ }
  }`;

content = content.replace(oldHandleStripe, `function handleStripeRedirect() {
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
 }`);

writeFileSync('src/pages/CustomerSite.tsx', content);
console.log('Patched handleStripeRedirect');
