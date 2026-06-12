import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/pages/CustomerSite.tsx', 'utf8');

//1. Add state variables after showReviewModal
content = content.replace(
  '  const [showReviewModal, setShowReviewModal] = useState(false);\n\nexport function CustomerSite',
  `  const [showReviewModal, setShowReviewModal] = useState(false);
  // ── Subscription confirmation banner ─────────────────────────────────────────
  const [showSubscriptionBanner, setShowSubscriptionBanner] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);

export function CustomerSite`
);

// 2. Add useEffect for subscription banner
const bannerUseEffect = `

  // ── Check for Stripe paid session and show subscription banner ────────────────
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

content = content.replace(
  `  // Mark onboarding as closed so the editor doesn't auto-open popup on next visit
  useEffect(() => {
    sessionStorage.setItem('onboarding_popup_closed', '1');
  }, []);`,
  `  // Mark onboarding as closed so the editor doesn't auto-open popup on next visit
  useEffect(() => {
    sessionStorage.setItem('onboarding_popup_closed', '1');
  }, []);` + bannerUseEffect
);

// 3. Add banner JSX
const bannerJSX = `
      {/* ── Subscription confirmation banner ─────────────────────────────────── */}
      {showSubscriptionBanner && (
        <div style="background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);color:#fff;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;font-family:Inter,sans-serif;position:relative;z-index:100;">
          <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
            <div style="width:32px;height:32px;background:rgba(255,255,255,0.25);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">✓</div>
            <div style="min-width:0;">
              <p style="margin:0;font-size:15px;font-weight:600;">Subscription active!</p>
              <p style="margin:2px 0 0;font-size:13px;opacity:0.9;">You're on the {subscriptionPlan || 'Starter'} plan.</p>
            </div>
          </div>
          <button onClick={() => setShowSubscriptionBanner(false)} style="background:rgba(255,255,255,0.2);border:none;border-radius:6px;color:#fff;cursor:pointer;padding:6px 10px;font-size:18px;line-height:1;flex-shrink:0;" aria-label="Dismiss">×</button>
        </div>
      )}
`;

content = content.replace(
  '  return (\n    <div className="w-full">\n      {/* Hero gallery',
  '  return (\n    <div className="w-full">' + bannerJSX + '\n      {/* Hero gallery'
);

writeFileSync('src/pages/CustomerSite.tsx', content);
console.log('Patched CustomerSite.tsx');
