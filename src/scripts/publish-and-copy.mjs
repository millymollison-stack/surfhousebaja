#!/usr/bin/env node
/**
 * publish-and-copy.mjs — Stage 6 of the Publish My Site flow
 *
 * After OnboardingPopup saves all data to Supabase (Stages 1–5),
 * this script copies the React app to a new folder named after the site slug.
 *
 * USAGE:
 *   node scripts/publish-and-copy.mjs [slug] [port]
 *   e.g.: node scripts/publish-and-copy.mjs casablanca1 8400
 *
 * REQUIREMENTS (passed from OnboardingPopup via sessionStorage or arguments):
 *   - slug: URL-friendly site name (e.g. "surf-house-baja")
 *   - port: local dev port to serve the copy on (e.g. 8400)
 *
 * WHAT IT DOES:
 *   1. Reads slug from args (or sessionStorage popup_website_name)
 *   2. Copies minimal React app files to props/{slug}/
 *   3. Cleans out non-essential folders (template, docs, photos, etc.)
 *   4. Runs npm install in the copy
 *   5. Starts dev server on chosen port
 *   6. Opens URL in browser
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRJ_ROOT = path.join(__dirname, '..', '..'); // → 02-surfhousebaja-template

// ─────────────────────────────────────────────────────────────
const SLUG = process.argv[2] || 'new-site';
const PORT = process.argv[3] || '8400';
// ─────────────────────────────────────────────────────────────

const SOURCE = PRJ_ROOT;                        // the working React app
const TARGET = path.join(PRJ_ROOT, 'props', SLUG);  // destination folder

console.log('\n📦 STAGE 6 — Copying React app to props/' + SLUG + '\n');

// ─── STEP 6a: Clean target folder ────────────────────────────
console.log('6a. Cleaning target folder…');
execSync(`rm -rf "${TARGET}"`, { cwd: PRJ_ROOT });
fs.mkdirSync(TARGET, { recursive: true });
console.log('   ✅ Target clean: ' + TARGET);

// ─── STEP 6b: Copy essential files only ─────────────────────
console.log('\n6b. Copying essential files…');

// Files to keep at root level
const ROOT_FILES = [
  'index.html',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'postcss.config.js',
  'tailwind.config.js',
  'eslint.config.js',
  'App.tsx',
  'main.tsx',
  'index.css',
];

// Directories to copy
const DIRS = [
  'components',
  'pages',
  'lib',
  'services',
  'types',
  'store',
  'export',
  'app',
  'supabase',
  'public',
  'scripts',
];

// Copy root files
for (const f of ROOT_FILES) {
  const src = path.join(SOURCE, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(TARGET, f));
    console.log('   ✅ ' + f);
  } else {
    console.log('   ⚠️  Missing: ' + f);
  }
}

// Copy directories
for (const d of DIRS) {
  const src = path.join(SOURCE, d);
  const dst = path.join(TARGET, d);
  if (fs.existsSync(src)) {
    execSync(`cp -r "${src}" "${dst}"`, { cwd: SOURCE });
    console.log('   ✅ ' + d + '/');
  } else {
    console.log('   ⚠️  Missing: ' + d + '/');
  }
}

// ─── STEP 6c: Delete non-essential folders ───────────────────
console.log('\n6c. Deleting non-essential folders…');

const DELETE = [
  'props',      // nested props inside copy — not needed
  'node_modules', // fresh install only
  'dist',        // build artifacts
  '.vercel',     // deploy configs
  '.netlify',    // deploy configs
  'template',    // template source files
  'docs',        // documentation
  'memory',      // agent memory
  'photos1',     // reference photos
  'photos2',     // reference photos
];

for (const d of DELETE) {
  const fullPath = path.join(TARGET, d);
  if (fs.existsSync(fullPath)) {
    execSync(`rm -rf "${fullPath}"`);
    console.log('   🗑️  Deleted: ' + d + '/');
  }
}

// ─── STEP 6d: npm install ─────────────────────────────────────
console.log('\n6d. Installing dependencies…');
execSync('npm install', { cwd: TARGET, stdio: 'inherit' });

// ─── STEP 6e: Start dev server ───────────────────────────────
console.log('\n6e. Starting dev server on port ' + PORT + '…');
execSync(`npm run dev -- --port ${PORT}`, {
  cwd: TARGET,
  detached: true,
  stdio: 'ignore',
});

// ─── STEP 6f: Open in browser ────────────────────────────────
console.log('\n6f. Opening http://localhost:' + PORT + '/ in browser…');
const url = `http://localhost:${PORT}/`;
execSync(`open "${url}"`);

console.log('\n' + '═'.repeat(50));
console.log('✅ STAGE 6 COMPLETE');
console.log('   Folder: ' + TARGET);
console.log('   URL:    http://localhost:' + PORT + '/');
console.log('   Size:   ' + (execSync(`du -sh "${TARGET}"`).toString().trim()));
console.log('═'.repeat(50) + '\n');