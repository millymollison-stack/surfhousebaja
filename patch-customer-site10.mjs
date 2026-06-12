import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/pages/CustomerSite.tsx', 'utf8');

// Replace the edge function call with direct profile query
const oldFetch = `        const res = await fetch(
          \`\${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-subscription\`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: \`Bearer \${session.access_token}\`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ action: 'get' }),
          }
        );
        const data = await res.json();
        const subStatus = data?.subscription?.status;`;

const newFetch = `        // Query profiles table directly to check subscription status
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
        const subStatus = profiles?.[0]?.stripe_subscription_status;`;

content = content.replace(oldFetch, newFetch);
writeFileSync('src/pages/CustomerSite.tsx', content);
console.log('Patched v8 - direct profile query');
