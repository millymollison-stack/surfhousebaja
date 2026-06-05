/**
 * Vercel API route: /api/deploy
 * Uses Node.js runtime — ssh2 + ssh2-sftp-client for file transfers
 *
 * Two modes:
 * 1. uploadTemplate=true  → uploads local dist/ to _templates/migration/ on Hostinger
 * 2. slug+propertyId     → copies _templates/migration/ to props/{slug}/ on Hostinger
 */
export const runtime = 'nodejs';

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from 'ssh2';
import SFTPClient from 'ssh2-sftp-client';
import fs from 'fs';
import path from 'path';

const HOSTINGER = {
  host: '82.29.86.252',
  port: 65002,
  user: 'u805830916',
  pass: process.env.HOSTINGER_SSH_PASS!,
  siteRoot: '/home/u805830916/domains/propbook.pro/public_html',
};

function sshConnect(client: Client): Promise<void> {
  return new Promise((resolve, reject) => {
    client.connect({
      host: HOSTINGER.host,
      port: HOSTINGER.port,
      username: HOSTINGER.user,
      password: HOSTINGER.pass,
      readyTimeout: 20000,
    });
    client.on('ready', () => resolve());
    client.on('error', (err) => reject(err));
  });
}

function sshExec(client: Client, cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    client.exec(cmd, (err, stream) => {
      if (err) { reject(err); return; }
      let stdout = '';
      let stderr = '';
      stream.on('close', (code: number) => resolve({ stdout, stderr, code }));
      stream.on('data', (data: Buffer) => { stdout += data.toString(); });
      stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    });
  });
}

async function sftpUploadDir(localPath: string, remotePath: string): Promise<void> {
  const sftp = new SFTPClient();
  await sftp.connect({
    host: HOSTINGER.host,
    port: HOSTINGER.port,
    username: HOSTINGER.user,
    password: HOSTINGER.pass,
    readyTimeout: 20000,
  });
  try {
    // Ensure remote dir exists
    await sftp.mkdir(remotePath, true);
    // Upload directory recursively
    await sftp.uploadDir(localPath, remotePath);
  } finally {
    sftp.end();
  }
}

async function sftpCopyDir(srcPath: string, destPath: string, client: Client): Promise<void> {
  // Use cp -r via SSH exec since SFTP doesn't have a native copy dir
  await sshExec(client, `cp -r "${srcPath}/" "${destPath}/"`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug, propertyId, uploadTemplate } = req.body;

  const client = new Client();
  const templateDist = `${HOSTINGER.siteRoot}/_templates/migration`;

  try {
    await sshConnect(client);
    console.log('[deploy] SSH connected');

    if (uploadTemplate === true) {
      // ── MODE 1: Upload local dist/ to _templates/migration/ on Hostinger ──
      console.log('[deploy] Mode: upload template to _templates/migration/');

      // Build props/site Migration (the correct template) locally first
      const templateSourceDir = path.join(process.cwd(), 'props', 'site Migration');
      const localDist = path.join(templateSourceDir, 'dist');
      if (!fs.existsSync(localDist)) {
        return res.status(400).json({ error: `No dist/ found at ${localDist}. Run build first.` });
      }

      // Delete old template
      await sshExec(client, `rm -rf "${templateDist}"`);
      console.log('[deploy] Old template deleted');

      // Upload via SFTP from local dist/ → Hostinger _templates/migration/
      console.log('[deploy] Starting SFTP upload from local dist/...');
      await sftpUploadDir(localDist, templateDist);
      console.log('[deploy] SFTP upload done');

      // chmod for LiteSpeed
      await sshExec(client, `chmod -R 755 "${templateDist}"`);
      console.log('[deploy] chmod done');

      return res.status(200).json({
        success: true,
        message: 'Template uploaded to _templates/migration/',
        url: `https://propbook.pro/_templates/migration/`,
      });

    } else {
      // ── MODE 2: Deploy property site ─────────────────────────────────────
      if (!slug || !propertyId) {
        return res.status(400).json({ error: 'slug and propertyId are required' });
      }

      const siteDest = `${HOSTINGER.siteRoot}/props/${slug}`;
      console.log(`[deploy] Mode: deploy property slug=${slug} propertyId=${propertyId}`);

      // Ensure parent dirs traversable by LiteSpeed
      await sshExec(client, `chmod 755 "${HOSTINGER.siteRoot}" && chmod 755 "${HOSTINGER.siteRoot}/props"`);

      // Copy template → property site
      await sshExec(client, `rm -rf "${siteDest}" && cp -r "${templateDist}/" "${siteDest}/"`);
      console.log('[deploy] Copy complete');

      // chmod for LiteSpeed
      await sshExec(client, `chmod -R 755 "${siteDest}"`);
      console.log('[deploy] chmod complete');

      const siteUrl = `https://propbook.pro/props/${slug}/`;
      console.log(`[deploy] Done: ${siteUrl}`);

      return res.status(200).json({
        success: true,
        url: siteUrl,
        slug,
        propertyId,
      });
    }

  } catch (err) {
    console.error('[deploy] Error:', err);
    return res.status(500).json({ error: String(err) });
  } finally {
    client.end();
  }
}