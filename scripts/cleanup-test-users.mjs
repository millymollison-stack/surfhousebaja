/**
 * Cleanup test users a1-a14 and their associated data.
 * Run: node scripts/cleanup-test-users.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SB_URL = 'https://jtzagpbdrqfifdisxipr.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0emFncGJkcnFmaWZkaXN4aXByIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDczNTI4NSwiZXhwIjoyMDYwMzExMjg1fQ.FjzjJYgN83YtmhwqKsW8kJhvkrqvlkWOzy5T4JxAgjM';

const supabase = createClient(SB_URL, SB_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// a13 doesn't exist — confirmed via prior query
const TEST_USERS = [
  '8c6191a1-981d-4424-bada-073c8024d9ef',  // a1
  'd5ddb72d-e969-4e3b-b220-1f25dde47f35',  // a2
  '37374445-a7ec-4d0a-a8a1-1d3a8dbcbd94',  // a3
  'b31f3fe3-d9d4-4089-8550-8087e2f5a77d',  // a4
  '3518b401-384e-4fa3-8dc9-842d97074faf',  // a5
  '7a4ca021-e687-40ab-b878-6d2e5ac4a65a',  // a6
  '52ea6196-177b-4180-9bec-116a979ed223',  // a7
  'ccf97635-4d4b-4bb0-b9f1-096375ebc185',  // a8
  '69de94c2-d0e1-4a38-81f2-4ecffd470581',  // a9
  '109ef055-4aff-472b-bcce-41f7f68d2a0a',  // a10
  'f712d9ec-9357-4834-b70d-9432ff6ab87e',  // a11
  '9220cb6e-2e1a-4934-a09a-d5903e6a814b',  // a12
  '0c9fe34e-09ed-415e-a7be-75b854e290bc', // a14
];

async function deleteUser(userId) {
  console.log(`\n--- Deleting user ${userId} ---`);

  // 1. Delete properties owned by this user
  const { data: props, error: propsErr } = await supabase
    .from('properties')
    .select('id, slug, title')
    .eq('owner_id', userId);

  if (propsErr) {
    console.error(`  ⚠️  Error fetching properties: ${propsErr.message}`);
  } else if (props && props.length > 0) {
    for (const p of props) {
      console.log(`  Deleting property: ${p.id} (${p.slug || 'no-slug'}) — "${p.title || ''}"`);
      // Also delete property_images
      await supabase.from('property_images').delete().eq('property_id', p.id);
      // Delete property
      const { error: delPropErr } = await supabase.from('properties').delete().eq('id', p.id);
      if (delPropErr) console.error(`    ⚠️  property delete error: ${delPropErr.message}`);
      else console.log(`    ✅ Property deleted`);
    }
  } else {
    console.log('  No properties to delete');
  }

  // 2. Delete onboarding_data
  const { error: odErr } = await supabase.from('onboarding_data').delete().eq('user_id', userId);
  if (odErr) console.warn(`  ⚠️  onboarding_data delete warn: ${odErr.message}`);
  else console.log('  ✅ onboarding_data deleted');

  // 3. Delete profile
  const { error: profileErr } = await supabase.from('profiles').delete().eq('id', userId);
  if (profileErr) console.error(`  ⚠️  profile delete error: ${profileErr.message}`);
  else console.log('  ✅ profile deleted');

  // 4. Delete from auth.users
  const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
  if (authErr) console.error(`  ⚠️  auth delete error: ${authErr.message}`);
  else console.log('  ✅ auth user deleted');
}

async function main() {
  console.log(`Connecting to Supabase: ${SB_URL}`);
  console.log(`Users to delete: ${TEST_USERS.length}`);

  for (const uid of TEST_USERS) {
    await deleteUser(uid);
  }

  console.log('\n=== ALL DONE ===');
}

main().catch(console.error);
