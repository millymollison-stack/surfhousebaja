#!/usr/bin/env node
/**
 * upload-cdn.js — Uploads the built React assets to the CDN directory on Hostinger.
 * Run after `npm run build` to publish the latest bundle.
 *
 * Usage:
 *   node scripts/upload-cdn.js
 *   npm run upload-cdn
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const ASSETS_DIR = path.join(DIST_DIR, 'assets');
const CDN_UPLOAD_URL = 'https://www.propbook.pro/upload-cdn.php';
const SECRET = 'propbook-deploy-2026';

function readFile(filePath) {
  return fs.readFileSync(filePath);
}

function uploadToCdn(files) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ secret: SECRET, files });
    const url = new URL(CDN_UPLOAD_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          reject(new Error(`Invalid response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  // Read manifest
  const manifestPath = path.join(DIST_DIR, 'assets-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('❌ assets-manifest.json not found. Run `npm run build` first.');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`📦 Manifest: js=${manifest.js}, css=${manifest.css}, built=${new Date(manifest.builtAt).toISOString()}`);

  const files = {};

  // JS bundle
  const jsPath = path.join(ASSETS_DIR, manifest.js);
  if (fs.existsSync(jsPath)) {
    files[manifest.js] = readFile(jsPath).toString('base64');
    console.log(`  ✓ ${manifest.js} (${(readFile(jsPath).length / 1024).toFixed(0)}KB)`);
  } else {
    console.error(`  ✗ Missing: ${jsPath}`);
  }

  // CSS bundle
  const cssPath = path.join(ASSETS_DIR, manifest.css);
  if (fs.existsSync(cssPath)) {
    files[manifest.css] = readFile(cssPath).toString('base64');
    console.log(`  ✓ ${manifest.css} (${(readFile(cssPath).length / 1024).toFixed(0)}KB)`);
  } else {
    console.error(`  ✗ Missing: ${cssPath}`);
  }

  // Manifest
  files['assets-manifest.json'] = Buffer.from(JSON.stringify(manifest)).toString('base64');

  console.log('\n☁️  Uploading to CDN...');
  try {
    const result = await uploadToCdn(files);
    if (result.success) {
      console.log(`✅ CDN upload complete — ${result.written} files written`);
    } else {
      console.error(`❌ CDN upload failed:`, result.errors || result.error);
      process.exit(1);
    }
  } catch (e) {
    console.error('❌ Upload error:', e.message);
    process.exit(1);
  }
}

main();
