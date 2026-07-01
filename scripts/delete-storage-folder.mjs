/**
 * Delete all files in a Supabase Storage folder.
 * Run: node scripts/delete-storage-folder.mjs --bucket=onboarding --folder=onboarding
 */

const STORAGE_URL = 'https://jtzagpbdrqfifdisxipr.supabase.co/storage/v1';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0emFncGJkcnFmaWZkaXN4aXByIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDczNTI4NSwiZXhwIjoyMDYwMzExMjg1fQ.FjzjJYgN83YtmhwqKsW8kJhvkrqvlkWOzy5T4JxAgjM';

const args = process.argv.slice(2);
let bucket = null;
let folder = null;
for (const arg of args) {
  if (arg.startsWith('--bucket=')) bucket = arg.slice(9);
  else if (arg.startsWith('--folder=')) folder = arg.slice(9);
}

if (!bucket || !folder) {
  console.error('Usage: node scripts/delete-storage-folder.mjs --bucket=<bucket> --folder=<folder>');
  process.exit(1);
}

const prefix = folder ? `${folder}/` : '';

async function listFiles(bucket, prefix) {
  const res = await fetch(`${STORAGE_URL}/object/list/${encodeURIComponent(bucket)}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'apikey': TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function deleteFile(bucket, path) {
  // Split path into segments and encode each individually (handles subfolder/file paths correctly)
  // Supabase Storage expects raw / separators in the URL path, not %2F
  const pathSegments = path.split('/');
  const encodedPath = pathSegments.map(p => encodeURIComponent(p)).join('/');
  const res = await fetch(`${STORAGE_URL}/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'apikey': TOKEN,
    },
  });
  // 200, 204, 404 are all ok — file gone either way
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Delete failed for ${path}: ${res.status} ${text}`);
  }
  return res.status;
}

async function main() {
  console.log(`\nFetching files in ${bucket}/${prefix}...`);
  const files = await listFiles(bucket, prefix);

  // Filter to only actual files (have name, id is null for folders)
  const actualFiles = Array.isArray(files) ? files.filter(f => f.name && !f.name.endsWith('/')) : [];
  console.log(`Found ${actualFiles.length} files to delete`);

  if (actualFiles.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  // Delete in batches of 20
  let deleted = 0;
  let failed = 0;
  for (const file of actualFiles) {
    const filePath = file.name; // e.g. "onboarding/1780865517827-0.jpg"
    process.stdout.write(`  Deleting ${filePath}... `);
    try {
      const status = await deleteFile(bucket, filePath);
      console.log(`OK (${status})`);
      deleted++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${deleted} deleted, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
