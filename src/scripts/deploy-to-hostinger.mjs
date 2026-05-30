/**
 * deploy-to-hostinger.mjs
 * Copies the Migration template to Hostinger, builds it, and makes it live.
 *
 * USAGE:
 *   node scripts/deploy-to-hostinger.mjs <slug> <propertyId>
 *   e.g.: node scripts/deploy-to-hostinger.mjs casablanca103fccab6-a997-4a38-bb7f-4b3e7a6c09a8
 *
 * WHAT IT DOES:
 *   1. SSH into Hostinger
 *   2. Create /domains/propbook.pro/public_html/props/{slug}/
 *   3. Rsync the Migration template files to that folder
 *   4. Update Home.tsx to point at the new propertyId
 *   5. Run npm install && npm run build on Hostinger
 *   6. Done — site is live at propbook.pro/props/{slug}/
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.join(__dirname, '..', '..'); // → 02-surfhousebaja-template

const SLUG = process.argv[2];
const PROPERTY_ID = process.argv[3];

if (!SLUG || !PROPERTY_ID) {
  console.error('Usage: node scripts/deploy-to-hostinger.mjs <slug> <propertyId>');
  process.exit(1);
}

const HOST = '82.29.86.252';
const PORT = '65002';
const USER = 'u805830916';
const PASS = 'Clawbot12!';
const REMOTE_BASE = '/home/u805830916/domains/propbook.pro/public_html';
const REMOTE_TARGET = `${REMOTE_BASE}/props/${SLUG}`;
const SOURCE = path.join(PROJECT_DIR, 'props', 'site Migration');

const SSH = `sshpass -p '${PASS}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${PORT}`;
const SFTP = `sshpass -p '${PASS}' sftp -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o PreferredAuthentications=password -o PubkeyAuthentication=no -P ${PORT}`;
const RSYNC = `sshpass -p '${PASS}' rsync -avz -e "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${PORT}"`;

function run(cmd, label, cwd = PROJECT_DIR) {
  console.log(`\n[${label}] $ ${cmd}`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', timeout: 300_000 });
  } catch (e) {
    console.error(`[${label}] FAILED (exit ${e.status})`);
    process.exit(1);
  }
}

function ssh(cmd) {
  return execSync(`${SSH} ${USER}@${HOST} "${cmd.replace(/"/g, '\\"')}"`, {
    cwd: PROJECT_DIR,
    stdio: 'inherit',
    timeout: 120_000,
  });
}

// ─── STEP 1: Create remote directory ────────────────────────
console.log('\n=== STEP 1: Creating remote directory ===');
try {
  ssh(`mkdir -p "${REMOTE_TARGET}"`);
  console.log('✅ Remote directory created');
} catch (e) {
  console.error('❌ Failed to create remote directory');
  process.exit(1);
}

// ─── STEP 2: Rsync Migration folder to Hostinger ───────────
console.log('\n=== STEP 2: Copying Migration template to Hostinger ===');
run(
  `${RSYNC} -e "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${PORT}" "${SOURCE}/" "${USER}@${HOST}:${REMOTE_TARGET}/"`,
  'RSYNC'
);
console.log('✅ Files copied');

// ─── STEP 3: Update Home.tsx property ID ───────────────────
console.log('\n=== STEP 3: Updating Home.tsx with new property ID ===');
const homePath = path.join(SOURCE, 'pages', 'Home.tsx');
if (fs.existsSync(homePath)) {
  let content = fs.readFileSync(homePath, 'utf8');
  content = content.replace(
    /SURF_HOUSE_BAJA_ID\s*=\s*['"][^'"]+['"]/,
    `SURF_HOUSE_BAJA_ID = '${PROPERTY_ID}'`
  );
  fs.writeFileSync(homePath, content);
  console.log(`✅ Home.tsx updated to use property ID: ${PROPERTY_ID}`);
} else {
  console.warn('⚠️  Home.tsx not found, skipping property ID update');
}

// Write the updated Home.tsx to remote
try {
  const homeContent = fs.readFileSync(homePath, 'utf8');
  const tmpPath = `/tmp/Home.tsx.${SLUG}.${Date.now()}`;
  fs.writeFileSync(tmpPath, homeContent);
  execSync(`scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 -P ${PORT} "${tmpPath}" "${USER}@${HOST}:${REMOTE_TARGET}/pages/Home.tsx"`, { stdio: 'inherit' });
  execSync(`rm "${tmpPath}"`);
  console.log('✅ Home.tsx uploaded to Hostinger');
} catch (e) {
  console.error('⚠️  Failed to upload Home.tsx');
}

// ─── STEP 4: npm install on Hostinger ───────────────────────
console.log('\n=== STEP 4: npm install on Hostinger ===');
try {
  ssh(`cd "${REMOTE_TARGET}" && npm install 2>&1`);
  console.log('✅ npm install complete');
} catch (e) {
  console.error('❌ npm install failed');
  process.exit(1);
}

// ─── STEP 5: npm run build on Hostinger ──────────────────────
console.log('\n=== STEP 5: Building React app on Hostinger ===');
try {
  ssh(`cd "${REMOTE_TARGET}/src" && npm run build 2>&1`);
  console.log('✅ Build complete');
} catch (e) {
  console.error('❌ Build failed');
  process.exit(1);
}

// ─── STEP 6: Fix permissions ────────────────────────────────
console.log('\n=== STEP 6: Fixing permissions ===');
try {
  ssh(`chmod -R 755 "${REMOTE_TARGET}/src/dist" && chmod 644 "${REMOTE_TARGET}/src/dist"/*`);
  console.log('✅ Permissions fixed');
} catch (e) {
  console.warn('⚠️  Permission fix failed (non-fatal)');
}

console.log('\n' + '='.repeat(50));
console.log('✅ DEPLOY COMPLETE');
console.log(`   URL:     https://propbook.pro/props/${SLUG}/`);
console.log(`   Folder:  ${REMOTE_TARGET}`);
console.log('='.repeat(50) + '\n');
