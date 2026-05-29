/**
 * deploy-to-hostinger.js
 * Usage:
 *   node deploy-to-hostinger.js                  # deploys entire app to public_html/ (root)
 *   node deploy-to-hostinger.js <slug>            # deploys to public_html/props/<slug>/
 *
 * Builds the React app, then uploads src/dist/ to Hostinger.
 * Works as a standalone script or called by deploy-service (Railway webhook receiver).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOST = '82.29.86.252';
const PORT = '65002';
const USER = 'u805830916';
const PASS = 'Clawbot12!';
const ROOT_DEST = 'public_html';

// Slug passed as first CLI arg — deploy to public_html/props/<slug>/
// If omitted, deploys to public_html/ (root site)
const SLUG = process.argv[2] || null;
const DEST = SLUG ? `${ROOT_DEST}/props/${SLUG}` : ROOT_DEST;

const PROJECT_DIR = __dirname;

function run(cmd, label) {
  console.log(`\n[${label}] $ ${cmd}`);
  try {
    return execSync(cmd, { cwd: PROJECT_DIR, stdio: 'inherit', timeout: 300_000 });
  } catch (e) {
    console.error(`[${label}] FAILED (exit ${e.status})`);
    process.exit(1);
  }
}

function ssh(cmd) {
  const fullCmd = `sshpass -p '${PASS}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o PreferredAuthentications=password -o PubkeyAuthentication=no -p ${PORT} ${USER}@${HOST} "${cmd.replace(/"/g, '\\"')}"`;
  return execSync(fullCmd, { cwd: PROJECT_DIR, stdio: 'inherit', timeout: 60_000 });
}

function scpPut(localPath, remotePath) {
  const fullCmd = `sshpass -p '${PASS}' scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o PreferredAuthentications=password -o PubkeyAuthentication=no -P ${PORT} "${localPath}" ${USER}@${HOST}:"${remotePath}"`;
  return execSync(fullCmd, { cwd: PROJECT_DIR, stdio: 'inherit', timeout: 60_000 });
}

const destLabel = SLUG ? `props/${SLUG}/` : 'root (public_html/)';
console.log(`=== PropBook Deploy → Hostinger ===`);
console.log(`Target: ${destLabel} on propbook.pro\n`);

// 1. Build
run('cd src && npm run build', 'BUILD');

// 2. Check dist exists
const distDir = path.join(PROJECT_DIR, 'src', 'dist');
if (!fs.existsSync(distDir)) {
  console.error('dist/ not found after build!');
  process.exit(1);
}

// 3. Check/create remote base path
console.log(`\n[CHECK] Ensuring remote ${ROOT_DEST} exists…`);
try { ssh(`mkdir -p ${ROOT_DEST}`); } catch (e) {}

if (SLUG) {
  console.log(`[CHECK] Ensuring remote ${DEST} exists…`);
  try { ssh(`mkdir -p ${DEST}`); } catch (e) {}
}

// 4. Upload all files recursively
console.log(`\n[UPLOAD] Copying src/dist/ → Hostinger ${destLabel}…`);
const distFiles = execSync(`find src/dist -type f`, { cwd: PROJECT_DIR }).toString().trim().split('\n');
const distDirs  = execSync(`find src/dist -type d`,  { cwd: PROJECT_DIR }).toString().trim().split('\n');

// Create remote dirs first
console.log(`  Creating ${distDirs.filter(d => d.trim()).length} remote directories…`);
for (const dir of distDirs) {
  if (!dir.trim()) continue;
  const remoteDir = dir.replace(/^src\/dist\/?/, DEST + '/').replace(/\/+$/, '');
  try { ssh(`mkdir -p "${remoteDir}"`); } catch (e) {}
}

// Upload files
let uploaded = 0;
let failed = 0;
for (const file of distFiles) {
  if (!file.trim()) continue;
  const remotePath = file.replace(/^src\/dist\/?/, DEST + '/').replace(/\/+$/, '');
  const localPath = path.join(PROJECT_DIR, file);
  try {
    scpPut(localPath, remotePath);
    uploaded++;
    process.stdout.write(`\r  Uploaded ${uploaded}/${distFiles.length} files…`);
  } catch (e) {
    failed++;
    console.error(`\n  Failed: ${file}`);
  }
}

console.log(`\n\n✅ Deployed ${uploaded} files${failed ? ` (${failed} failed)` : ''}`);
console.log(`   URL: https://propbook.pro/${SLUG ? `props/${SLUG}` : ''}`);
