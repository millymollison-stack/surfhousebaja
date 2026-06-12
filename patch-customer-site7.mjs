import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('src/pages/CustomerSite.tsx', 'utf8');

// Fix banner useEffect: use POST instead of GET for stripe-subscription verification
const oldFetch = ` const res = await fetch(
          \`\${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-subscription?action=get\`,
          {
            headers: {
              Authorization: \`Bearer \${session.access_token}\`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
          }
        );`;

const newFetch = `        const res = await fetch(
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
        );`;

content = content.replace(oldFetch, newFetch);
writeFileSync('src/pages/CustomerSite.tsx', content);
console.log('Patched v6 - POST for subscription verification');
