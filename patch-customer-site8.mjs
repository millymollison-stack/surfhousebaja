import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/pages/CustomerSite.tsx', 'utf8');

// Remove the OLD duplicate banner useEffect that reads stripe_paid_session directly
// (the new one reads stripe_banner_pending set by handleStripeRedirect)
const oldDuplicateEffect = ` // ── Check for Stripe paid session and show subscription banner ────────────────
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
  }, []);

  useEffect(() => {
    async function loadProperty()`;

const newCode = `  useEffect(() => {
    async function loadProperty()`;

content = content.replace(oldDuplicateEffect, newCode);
writeFileSync('src/pages/CustomerSite.tsx', content);
console.log('Removed duplicate banner useEffect');
