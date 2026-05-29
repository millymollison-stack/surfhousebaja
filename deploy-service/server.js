/**
 * deploy-service/server.js
 * Railway webhook receiver for PropBook "Publish My Site".
 *
 * POST /deploy
 *   Body: { slug: string, propertyId: string }
 *   Header: Authorization: Bearer <WEBHOOK_SECRET>
 *
 * Runs deploy-to-hostinger.js with the slug, which builds the React app
 * and rsync's src/dist/ to Hostinger public_html/props/{slug}/
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

// Railway clones the repo and runs from repo root.
// __dirname = /repo-root/deploy-service (where server.js lives).
// The deploy script lives at repo-root/deploy-to-hostinger.js
// Railway root dir = repo root. deploy-service/ is a subdir.
// __dirname = /repo-root/deploy-service (or /app on some hosts).
// deploy-to-hostinger.js lives at /repo-root/deploy-to-hostinger.js
const REPO_ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
// Railway clones the repo and runs the start command from deploy-service/.
// __dirname = /app/deploy-service/ (container path).
// Repo root = parent dir = path.join(__dirname, '..').
const DEPLOY_SCRIPT = path.resolve(__dirname, 'deploy-to-hostinger.js');

const app = express();
app.use(express.json());

// ─── Health check ───────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Deploy webhook ─────────────────────────────────────────
app.post('/deploy', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  // Verify secret
  if (WEBHOOK_SECRET && token !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { slug, propertyId } = req.body;
  if (!slug || !propertyId) {
    return res.status(400).json({ error: 'Missing slug or propertyId' });
  }

  console.log(`[deploy-service] 🚀 Deploy triggered for slug="${slug}", propertyId="${propertyId}"`);

  // Collect stdout/stderr
  let logs = '';
  const MAX_LOG_BYTES = 40_000;

  try {
    const deployProcess = spawn('node', [DEPLOY_SCRIPT, slug, propertyId], {
      cwd: path.join(__dirname, '..'), // repo root (parent of deploy-service/)
      env: { ...process.env, DEPLOY_SLUG: slug, DEPLOY_PROPERTY_ID: propertyId },
    });

    // Non-blocking log capture
    const appendLog = (chunk, source) => {
      if (logs.length < MAX_LOG_BYTES) {
        const line = `[${source}] ${chunk.toString()}`;
        logs += line;
        console.log(line.trim());
      }
    };

    deployProcess.stdout.on('data', (d) => appendLog(d, 'stdout'));
    deployProcess.stderr.on('data', (d) => appendLog(d, 'stderr'));

    // Wait for deploy to finish (up to 5 minutes)
    const exitCode = await new Promise((resolve) => {
      deployProcess.on('close', (code) => resolve(code));
      setTimeout(() => {
        deployProcess.kill('SIGTERM');
        resolve(124);
      }, 300_000);
    });

    if (exitCode === 0) {
      console.log(`[deploy-service] ✅ Deploy complete for "${slug}"`);
      res.json({ ok: true, slug, propertyId, logs: logs.slice(-MAX_LOG_BYTES) });
    } else if (exitCode === 124) {
      console.error(`[deploy-service] ⏱️  Deploy timed out for "${slug}"`);
      res.status(504).json({ error: 'Deploy timed out after 5 minutes', slug, logs: logs.slice(-MAX_LOG_BYTES) });
    } else {
      console.error(`[deploy-service] ❌ Deploy failed for "${slug}" (exit ${exitCode})`);
      res.status(500).json({ error: `Deploy failed with exit code ${exitCode}`, slug, logs: logs.slice(-MAX_LOG_BYTES) });
    }
  } catch (err) {
    console.error(`[deploy-service] ❌ Exception:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[deploy-service] Listening on port ${PORT}`);
});
