/**
 * deploy-react-property.mjs
 *
 * Deploys the built React app to /props/{slug}/ on Hostinger.
 * This deploys the full React SPA (not the static template.html).
 *
 * Usage:
 *   node scripts/deploy-react-property.mjs --slug=<slug> [--property-id=<id>]
 *
 * What it does:
 *   1. Build the React app with VITE_BASE_PATH=/props/{slug}/
 *   2. Upload dist/ to /props/{slug}/ on Hostinger via rsync (preserves permissions)
 *   3. Fix directory permissions (rsync can create dirs with wrong perms)
 *   4. Write .htaccess for SPA routing
 *   5. Update property status in Supabase
 */

import { writeFileSync, mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join as pathJoin } from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ── Config ──────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://jtzagpbdrqfifdisxipr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Hostinger
const HOSTINGER_HOST = '82.29.86.252';
const HOSTINGER_PORT = '65002';
const HOSTINGER_USER = 'u805830916';
const HOSTINGER_PASS = 'Clawbot12!';
const HOSTINGER_BASE = '/home/u805830916/domains/propbook.pro/public_html';

// ── Helpers ─────────────────────────────────────────────────────────

function ssh(cmd) {
  return execSync(
    `sshpass -p '${HOSTINGER_PASS}' ssh -o StrictHostKeyChecking=no -p ${HOSTINGER_PORT} ${HOSTINGER_USER}@${HOSTINGER_HOST} '${cmd.replace(/'/g, "'\\''")}'`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
}

function sftpWrite(remotePath, content) {
  const tmpDir = mkdtempSync(pathJoin(tmpdir(), 'propbook-deploy-'));
  const tmpFile = pathJoin(tmpDir, 'upload.tmp');
  writeFileSync(tmpFile, content);
  const cmd = `sshpass -p '${HOSTINGER_PASS}' sftp -o StrictHostKeyChecking=no -P ${HOSTINGER_PORT} ${HOSTINGER_USER}@${HOSTINGER_HOST} <<'SFTP_EOF'
put "${tmpFile}" "${remotePath}"
bye
SFTP_EOF`;
  try {
    return execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } finally {
    try { require('fs').unlinkSync(tmpFile); } catch {}
    try { require('fs').rmdirSync(tmpDir); } catch {}
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let slug = null;
  let propertyId = null;

  for (const arg of args) {
    if (arg.startsWith('--slug=')) slug = arg.slice(7);
    else if (arg.startsWith('--property-id=')) propertyId = arg.slice(14);
  }

  if (!slug) {
    console.error('Usage: node scripts/deploy-react-property.mjs --slug=<slug> [--property-id=<id>]');
    process.exit(1);
  }

  console.log(`\n🚀 Deploying React app for slug=${slug}\n`);

  // Step 1: Build the React app with correct base path for the slug
  const basePath = `/props/${slug}/`;
  console.log(`📦 Step 1: Building React app with base=${basePath}...`);
  try {
    execSync(`VITE_BASE_PATH=${basePath} npm run build`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, GENERATE_SOURCEMAP: 'false' }
    });
    console.log('✅ Build complete');
  } catch (err) {
    console.error('❌ Build failed:', err.message);
    process.exit(1);
  }

  const distDir = join(PROJECT_ROOT, 'dist');
  if (!existsSync(distDir)) {
    console.error('❌ dist/ directory not found after build');
    process.exit(1);
  }

  // Step 2: Create remote directory
  const remoteDir = `${HOSTINGER_BASE}/props/${slug}`;
  console.log('\n📂 Step 2: Creating/cleaning remote directory...');
  // Remove existing directory if it has permission issues (from previous failed deploys)
  try {
    ssh(`rm -rf '${remoteDir}' 2>/dev/null; mkdir -p '${remoteDir}' && chmod 755 '${remoteDir}'`);
  } catch {
    // If rm fails due to permission issues, just create with mkdir -p
    ssh(`mkdir -p '${remoteDir}' && chmod 755 '${remoteDir}'`);
  }
  console.log(`✅ Directory ready: ${remoteDir}`);

  // Step 3: Upload dist/ contents via rsync (preserves permissions correctly)
  console.log('\n📤 Step 3: Uploading dist/ files via rsync...');
  try {
    execSync(
      `sshpass -p '${HOSTINGER_PASS}' rsync -avz --no-perms -e "ssh -o StrictHostKeyChecking=no -p ${HOSTINGER_PORT}" "${distDir}/" "${HOSTINGER_USER}@${HOSTINGER_HOST}:${remoteDir}/"`,
      { encoding: 'utf8', cwd: PROJECT_ROOT, maxBuffer: 100 * 1024 * 1024 }
    );
    console.log('✅ Files uploaded via rsync');
  } catch (err) {
    console.error('❌ rsync failed:', err.message);
    process.exit(1);
  }

  // Step 4: Fix all directory permissions (rsync can create dirs with 0755 but subdirs might vary)
  console.log('\n🔧 Step 4: Fixing directory permissions...');
  ssh(`find '${remoteDir}' -type d -exec chmod 755 {} \\; && find '${remoteDir}' -type f -exec chmod 644 {} \\;`);
  console.log('✅ Permissions fixed (755 for dirs, 644 for files)');

  // Step 5: Write .htaccess for SPA routing
  console.log('\n🔀 Step 5: Writing .htaccess for SPA routing...');
  const htaccess = `
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  # Skip rewrite for /props/ subdirectory — it has its own routing
  RewriteRule ^props/ - [L]
  # Serve index.html for all non-file, non-directory requests (SPA routing)
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ /index.html [L]
</IfModule>
`.trim();
  sftpWrite(`${remoteDir}/.htaccess`, htaccess);
  ssh(`chmod 644 '${remoteDir}/.htaccess'`);
  console.log('✅ .htaccess written');

  const siteUrl = `https://www.propbook.pro/props/${slug}`;

  // Step 6: Update Supabase property status if propertyId provided
  if (propertyId && SUPABASE_SERVICE_KEY) {
    console.log('\n🗄️ Step 6: Updating property status in Supabase...');
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/properties?id=eq.${encodeURIComponent(propertyId)}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ status: 'published', site_url: siteUrl })
      });
      if (res.ok) {
        console.log('✅ Property status set to published');
      } else {
        console.warn('⚠️ Could not update property status:', res.status);
      }
    } catch (err) {
      console.warn('⚠️ Supabase update failed:', err.message);
    }
  }

  console.log(`\n🎉 Deploy complete!`);
  console.log(`   🔗 ${siteUrl}`);
  console.log(`   📁 Directory: ${remoteDir}`);

  return { siteUrl, slug };
}

main().catch(err => {
  console.error('\n❌ Deploy failed:', err.message);
  process.exit(1);
});