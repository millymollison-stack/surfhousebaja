/**
 * Vercel API route: /api/debug-supabase
 * Uses Node.js runtime
 */
export const runtime = 'nodejs';

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

  const migrationId = '03fccab6-a997-4a38-bb7f-4b3e7a6c09a8';

  const propertiesRes = await fetch(
    `${supabaseUrl}/rest/v1/properties?id=eq.${migrationId}&select=id,name,slug`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  );
  const migrationProperty = await propertiesRes.json();

  const allPropsRes = await fetch(
    `${supabaseUrl}/rest/v1/properties?select=id,name,slug&limit=20`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  );
  const allProperties = await allPropsRes.json();

  return res.status(200).json({
    migrationProperty,
    allProperties,
  });
}
