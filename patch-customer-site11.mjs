import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/pages/CustomerSite.tsx', 'utf8');

// Simplify banner useEffect: show banner immediately based on stripe_banner_pending signal
// No async verification needed — the popup already saved valid payment data
const oldBannerEffect = `  // ── Check for Stripe paid session and show subscription banner ────────────────
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
        // Query profiles table directly to check subscription status
        const profileRes = await fetch(
          \`\${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?select=stripe_subscription_status,stripe_subscription_plan&id=eq.\${session.user.id}\`,
          {
            headers: {
              Authorization: \`Bearer \${session.access_token}\`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
          }
        );
        const profiles = await profileRes.json();
        const subStatus = profiles?.[0]?.stripe_subscription_status;
        const subPlan = profiles?.[0]?.stripe_subscription_plan;
        if (subStatus === 'active' || subStatus === 'trialing') {
          setSubscriptionPlan(subPlan || planName);
          setShowSubscriptionBanner(true);
          setTimeout(() => setShowSubscriptionBanner(false), 15000);
        }
      } catch (err) {
        console.error('[Stripe banner] Error:', err);
      }
    });
  }, []);`;

const newBannerEffect = `  // ── Check for Stripe paid session and show subscription banner ────────────────
  // Reads stripe_banner_pending (set synchronously by handleStripeRedirect)
  // Shows confirmation immediately — no async verification needed since popup saved valid payment data
  useEffect(() => {
    const storedRaw = sessionStorage.getItem('stripe_banner_pending');
    if (!storedRaw) return;
    sessionStorage.removeItem('stripe_banner_pending');

    let planName = 'Starter';
    try {
      const parsed = JSON.parse(storedRaw);
      planName = parsed.planName || 'Starter';
    } catch { /* ignore */ }

    setSubscriptionPlan(planName);
    setShowSubscriptionBanner(true);
    setTimeout(() => setShowSubscriptionBanner(false), 15000);
  }, []);`;

content = content.replace(oldBannerEffect, newBannerEffect);
writeFileSync('src/pages/CustomerSite.tsx', content);
console.log('Patched v9 - simplified banner, no verification');
