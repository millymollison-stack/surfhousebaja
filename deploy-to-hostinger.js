/**
 * deploy-to-hostinger.js
 * Usage: node deploy-to-hostinger.js
 * Builds the React app, then uploads dist/ to Hostinger public_html/
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOST = '82.29.86.252';
const PORT = '65002';
const USER = 'u805830916';
const PASS = 'Clawbot12!';
const DEST = 'public_html';
const PROJECT_DIR = __dirname;

function run(cmd, label) {
  console.log(`\n[${label}] $ ${cmd}`);
  try {
    return execSync(cmd, { cwd: PROJECT_DIR, stdio: 'inherit' });
  } catch (e) {
    console.error(`[${label}] FAILED`);
    process.exit(1);
  }
}

function ssh(cmd) {
  const fullCmd = `sshpass -p '${PASS}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o PreferredAuthentications=password -o PubkeyAuthentication=no -p ${PORT} ${USER}@${HOST} "${cmd.replace(/"/g, '\\"')}"`;
  return execSync(fullCmd, { cwd: PROJECT_DIR, stdio: 'inherit' });
}

function scpPut(localPath, remotePath) {
  const fullCmd = `sshpass -p '${PASS}' scp -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o PreferredAuthentications=password -o PubkeyAuthentication=no -P ${PORT} "${localPath}" ${USER}@${HOST}:"${remotePath}"`;
  return execSync(fullCmd, { cwd: PROJECT_DIR, stdio: 'inherit' });
}

console.log('=== Deploying to Hostinger ===\n');

// 1. Build
run('cd src && npm run build', 'BUILD');

// 2. Check dist exists
const distDir = path.join(PROJECT_DIR, 'src', 'dist');
if (!fs.existsSync(distDir)) {
  console.error('dist/ not found after build!');
  process.exit(1);
}

// 3. Check remote path
console.log('\n[CHECK] Verifying remote public_html exists...');
try {
  ssh(`ls ${DEST} > /dev/null 2>&1 && echo OK`);
} catch (e) {
  console.error('Remote public_html not found!');
  process.exit(1);
}

// 4. Upload all files recursively
console.log('\n[UPLOAD] Copying dist/ to Hostinger public_html/...');
const distFiles = execSync(`find src/dist -type f`, { cwd: PROJECT_DIR }).toString().trim().split('\n');
const distDirs = execSync(`find src/dist -type d`, { cwd: PROJECT_DIR }).toString().trim().split('\n');

// Create remote dirs first
console.log('Creating remote directories...');
for (const dir of distDirs) {
  const remoteDir = dir.replace(/^src\/dist/, DEST).replace(/\/+$/, '');
  try { ssh(`mkdir -p "${remoteDir}"`); } catch (e) {}
}

// Upload files
let uploaded = 0;
for (const file of distFiles) {
  if (!file.trim()) continue;
  const remotePath = file.replace(/^src\/dist/, DEST).replace(/\/+$/, '');
  const localPath = path.join(PROJECT_DIR, file);
  try {
    scpPut(localPath, remotePath);
    uploaded++;
    process.stdout.write(`\r  Uploaded ${uploaded}/${distFiles.length} files...`);
  } catch (e) {
    console.error(`\nFailed to upload: ${file}`);
  }
}

console.log(`\n\n✅ Deployed ${uploaded} files to https://propbook.pro/`);