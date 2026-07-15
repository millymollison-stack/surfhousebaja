/**
 * upload-cdn-and-root.mjs
 *
 * Uploads fresh build assets to:
 *   1. CDN:  https://www.propbook.pro/scripts/react-assets/assets/   (assets + manifest)
 *   2. Root: https://www.propbook.pro/                              (index.html + index.php)
 *
 * Also updates assets-manifest.json with the new bundle filenames.
 *
 * Usage:
 *   node scripts/upload-cdn-and-root.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const UPLOAD_PHP_URL = 'https://www.propbook.pro/upload.php';
const DEPLOY_SECRET = 'propbook-deploy-2026';

const DIST_DIR = join(PROJECT_ROOT, 'dist');

function encodeBase64(str) {
  return Buffer.from(str).toString('base64');
}

async function uploadFiles(files) {
  const payload = {
    secret: DEPLOY_SECRET,
    files,
  };

  const res = await fetch(UPLOAD_PHP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`upload.php non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok || !json.success) {
    throw new Error(`upload.php error: ${JSON.stringify(json)}`);
  }

  return json;
}

function getAssetFiles(distDir) {
  const files = {};
  const assetsDir = join(distDir, 'assets');

  if (!existsSync(assetsDir)) {
    throw new Error(`dist/assets/ not found. Run \`npm run build\` first.`);
  }

  for (const file of [
    'index-DRqQmBxi.js',
    'index-Bgc3f668.css',
    'browser-DrBitTnB.js',
  ]) {
    const fullPath = join(assetsDir, file);
    if (!existsSync(fullPath)) {
      console.warn(`  [WARN] ${file} not found in dist/assets/, skipping`);
      continue;
    }
    files[`root:assets/${file}`] = encodeBase64(readFileSync(fullPath));
  }

  return files;
}

async function main() {
  console.log('=== Upload CDN + Root App ===\n');

  // ── Step 1: Build fresh manifest ─────────────────────────────────────────
  const manifest = {
    js: 'index-DRqQmBxi.js',
    css: 'index-Bgc3f668.css',
    builtAt: String(Date.now()),
  };
  console.log(`Manifest:\n  js: ${manifest.js}\n  css: ${manifest.css}\n  builtAt: ${manifest.builtAt}\n`);

  // ── Step 2: Read dist files ─────────────────────────────────────────────
  const distIndexHtml = join(DIST_DIR, 'index.html');
  const distIndexPhp  = join(DIST_DIR, 'index.php');
  const distAssets    = getAssetFiles(DIST_DIR);

  if (!existsSync(distIndexHtml)) {
    throw new Error(`dist/index.html not found. Run \`npm run build\` first.`);
  }

  // ── Step 3: Build upload payload ─────────────────────────────────────────
  const rootFiles = {
    ...distAssets,
    // Root app files (index.html + index.php for LiteSpeed PHP routing)
    'root:index.html':     encodeBase64(readFileSync(distIndexHtml)),
    'root:index.php':      existsSync(distIndexPhp)
      ? encodeBase64(readFileSync(distIndexPhp))
      : encodeBase64(readFileSync(distIndexHtml)),
    // CDN assets + manifest (root: prefix = write to public_html/)
    [`root:scripts/react-assets/assets/assets-manifest.json`]: encodeBase64(JSON.stringify(manifest, null, 2)),
  };

  console.log(`Files to upload:`);
  for (const [path] of Object.entries(rootFiles)) {
    console.log(`  ${path}`);
  }
  console.log();

  // ── Step 4: Upload ──────────────────────────────────────────────────────
  console.log('Uploading to Hostinger via upload.php...');
  const result = await uploadFiles(rootFiles);
  console.log(`\n✅ Upload complete!`);
  console.log(`  Written: ${result.written} files`);
  console.log(`  Site URL: ${result.siteUrl}`);
  if (result.errors?.length) {
    console.log(`  Errors: ${result.errors.join(', ')}`);
  }

  // ── Step 5: Verify ──────────────────────────────────────────────────────
  console.log('\nVerifying root app bundle...');
  const res1 = await fetch('https://www.propbook.pro/assets/index-DRqQmBxi.js');
  console.log(`  /assets/index-DRqQmBxi.js → ${res1.status}`);

  const res2 = await fetch('https://www.propbook.pro/');
  const html = await res2.text();
  const hasCorrectBundle = html.includes('index-DRqQmBxi.js');
  console.log(`  Root index.html references correct bundle: ${hasCorrectBundle}`);

  if (!hasCorrectBundle) {
    console.error('  [WARN] Root index.html still has stale bundle reference!');
  }

  console.log('\nManifest check:');
  const mRes = await fetch('https://www.propbook.pro/scripts/react-assets/assets/assets-manifest.json');
  const mBody = await mRes.json();
  console.log(`  CDN manifest js: ${mBody.js}`);
  console.log(`  CDN manifest css: ${mBody.css}`);
}

main().catch(err => {
  console.error('❌ Upload failed:', err.message);
  process.exit(1);
});
