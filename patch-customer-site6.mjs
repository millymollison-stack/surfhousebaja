import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/pages/CustomerSite.tsx', 'utf8');

// Update banner useEffect to read stripe_banner_pending (set by handleStripeRedirect for logged-in users)
// instead of stripe_paid_session
const oldBannerEffect = `  // ── Check for Stripe paid session and show subscription banner ────────────────
  useEffect(() => {
    const storedRaw = sessionStorage.getItem('stripe_paid_session');
    if (!storedRaw) return;
    sessionStorage.removeItem('stripe_paid_session');

    let planName = 'Starter';
    try {
      const parsed = JSON.parse(storedRaw);
      planName = parsed.planName || 'Starter';
    } catch { /* ignore */ }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      try {
        const res = await fetch(
          \`\${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-subscription?action=get\`,
          {
            headers: {
              Authorization: \`Bearer \${session.access_token}\`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
          }
        );
        const data = await res.json();
        const subStatus = data?.subscription?.status;
        if (subStatus === 'active' || subStatus === 'trialing') {
          setSubscriptionPlan(data.subscription.plan || planName);
          setShowSubscriptionBanner(true);
          setTimeout(() => setShowSubscriptionBanner(false), 15000);
        }
      } catch (err) {
        console.error('[Stripe banner] Error:', err);
      }
    });
  }, []);`;

const newBannerEffect = `  // ── Check for Stripe paid session and show subscription banner ────────────────
  // Reads stripe_banner_pending (set by handleStripeRedirect for logged-in users)
  useEffect(() => {
    const storedRaw = sessionStorage.getItem('stripe_banner_pending');
    if (!storedRaw) return;
    sessionStorage.removeItem('stripe_banner_pending');

    let planName = 'Starter';
    let siteUrl = null;
    try {
      const parsed = JSON.parse(storedRaw);
      planName = parsed.planName || 'Starter';
      siteUrl = parsed.siteUrl;
    } catch { /* ignore */ }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      try {
        const res = await fetch(
          \`\${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-subscription?action=get\`,
          {
            headers: {
              Authorization: \`Bearer \${session.access_token}\`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
          }
        );
        const data = await res.json();
        const subStatus = data?.subscription?.status;
        if (subStatus === 'active' || subStatus === 'trialing') {
          setSubscriptionPlan(data.subscription.plan || planName);
          setShowSubscriptionBanner(true);
          setTimeout(() => setShowSubscriptionBanner(false), 15000);
        }
      } catch (err) {
        console.error('[Stripe banner] Error:', err);
      }
    });
  }, []);`;

content = content.replace(oldBannerEffect, newBannerEffect);
writeFileSync('src/pages/CustomerSite.tsx', content);
console.log('Patched v5 - banner reads stripe_banner_pending');
