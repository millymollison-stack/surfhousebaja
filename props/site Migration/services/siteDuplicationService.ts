/**
 * SiteDuplicationService — creates a new customer site after Stripe payment
 *
 * TWO-BUTTON PUBLISH FLOW:
 *
 *  Button 1 — "Save Site"
 *    → createNewSiteRecords() — creates property + profile + onboarding records
 *    → status: 'draft', site_url: null — NOT live yet
 *    → Stripe Connect account wired to property so booking payments route correctly
 *
 *  Button 2 — "Go Live"
 *    → generateSiteHtml() — replaces {{PLACEHOLDER}} tokens with scraped data
 *    → rsyncToHostinger() — copies generated HTML to Hostinger /props/{slug}/
 *    → marks property status: 'active', site_url set — site is now live
 *
 * Hostinger SSH: u805830916@82.29.86.252 port 65002
 */

import { supabaseAdmin } from '../lib/supabase';
import { createSlug } from './slugService';

export interface ScrapedData {
  title: string;
  location: string;
  description: string;
  hero_image: string;
  images: string[];
  guests: number | null;
  bedrooms: number | null;
  beds: number | null;
  baths: number | null;
  rating: number | null;
  reviews: number | null;
  host_name: string | null;
  price: string;
}

export interface NewSiteData {
  email: string;
  userId: string;
  userStripeAccountId?: string;
  bookingsEmail: string;
  websiteName: string;
  websiteDesc: string;
  planChoice: 'starter' | 'pro' | 'agency';
  hostingChoice: 'our' | 'own';
  extras: { seo: boolean; ads: boolean; analytics: boolean; social: boolean };
  scrapedData: ScrapedData | null;
  designChoice: string;
  bankChoice: string;
}

// ─────────────────────────────────────────────
// STEP 1 — Read template.html from the src/public template folder
// ─────────────────────────────────────────────
export async function loadTemplateHtml(): Promise<string> {
  // Template is in public/template/template.html (copied from src/template/Airbnb Import Template/)
  const res = await fetch('/template/template.html');
  if (!res.ok) throw new Error(`Failed to load template.html: ${res.status}`);
  return res.text();
}

// ─────────────────────────────────────────────
// STEP 2 — Generate HTML by replacing placeholders
// ─────────────────────────────────────────────
export function generateSiteHtml(template: string, data: NewSiteData): string {
  const s = data.scrapedData;
  const price = s?.price ? s.price.replace(/[^0-9.]/g, '') : '150';
  const heroImage = s?.hero_image || '/template/surfhousebaja-main.jpg';
  const images = s?.images?.length
    ? s.images.map((img: string) => `<img src="${img}" alt="${s.title}" loading="lazy" />`).join('\n')
    : `<img src="${heroImage}" alt="${s?.title || data.websiteName}" loading="lazy" />`;

  return template
    .replace(/\{\{BRAND_NAME\}\}/g, data.websiteName)
    .replace(/\{\{TITLE\}\}/g, s?.title || data.websiteName)
    .replace(/\{\{LOCATION\}\}/g, s?.location || '')
    .replace(/\{\{PRICE\}\}/g, price)
    .replace(/\{\{DESCRIPTION\}\}/g, s?.description || data.websiteDesc)
    .replace(/\{\{HERO_IMAGE\}\}/g, heroImage)
    .replace(/\{\{IMAGES\}\}/g, images)
    .replace(/\{\{REVIEW_COUNT\}\}/g, String(s?.reviews ?? 0))
    .replace(/\{\{GUESTS\}\}/g, String(s?.guests ?? 8))
    .replace(/\{\{BEDROOMS\}\}/g, String(s?.bedrooms ?? 2))
    .replace(/\{\{BEDS\}\}/g, String(s?.beds ?? 3))
    .replace(/\{\{BATHS\}\}/g, String(s?.baths ?? 1))
    .replace(/\{\{RATING\}\}/g, String(s?.rating ?? '4.8'))
    .replace(/\{\{HOST_NAME\}\}/g, s?.host_name || 'Property Manager');
}

// ─────────────────────────────────────────────
// STEP 3a — Create Supabase records via Edge Function (Button 1: Save Site)
// Routes through the edge function to use service role key server-side
// ─────────────────────────────────────────────
export async function createNewSiteRecords(data: NewSiteData): Promise<{
  propertyId: string;
  siteUrl: string;
  slug: string;
}> {
  const slug = createSlug(data.websiteName);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  // Call the save-site-records edge function (server-side, uses service role key)
  console.log('[createNewSiteRecords] Calling edge function, URL:', `${supabaseUrl}/functions/v1/save-site-records`);
  let res;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/save-site-records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        title: data.scrapedData?.title || data.websiteName,
        slug,
        description: data.scrapedData?.description || data.websiteDesc,
        location: data.scrapedData?.location || '',
        maxGuests: data.scrapedData?.guests || 8,
        bedrooms: data.scrapedData?.bedrooms || 2,
        beds: data.scrapedData?.beds || 3,
        baths: data.scrapedData?.baths || 1,
        pricePerNight: data.scrapedData?.price
          ? parseFloat(data.scrapedData.price.replace(/[^0-9.]/g, ''))
          : 150,
        heroImage: data.scrapedData?.hero_image || '',
        images: data.scrapedData?.images || [],
        stripeAccountId: data.userStripeAccountId || null,
        stripeAccountStatus: data.userStripeAccountId ? 'active' : null,
        userId: data.userId,
      }),
    });
    const result = await res.json();
    console.log('[createNewSiteRecords] Edge function response:', res.status, result);
    if (!res.ok || result.error) {
      throw new Error(`Property insert failed: ${result.error || res.statusText}`);
    }
    const { propertyId } = result;
    return { propertyId, siteUrl: `https://propbook.pro/props/${slug}`, slug };
  } catch (err) {
    console.error('[createNewSiteRecords] Error:', err);
    throw err;
  }
}

// ─────────────────────────────────────────────
// STEP 3b — Push HTML to Hostinger + activate site (Button 2: Go Live)
// html is pre-generated by Button 1 and passed in directly
// ─────────────────────────────────────────────
export async function goLiveSite(propertyId: string, slug: string, html: string): Promise<string> {

  // Create directory on Hostinger via SSH
  const hostingerDir = `/home/u805830916/domains/propbook.pro/public_html/props/${slug}`;

  const mkdirRes = await new Promise<string>((resolve, reject) => {
    const { exec } = require('child_process');
    const cmd = `sshpass -p 'Clawbot12!' ssh -o StrictHostKeyChecking=no -p 65002 u805830916@82.29.86.252 "mkdir -p '${hostingerDir}' && echo DIR_OK"`;
    exec(cmd, (err: Error | null, stdout: string, stderr: string) => {
      if (err) reject(new Error(`mkdir SSH failed: ${stderr || err.message}`));
      else resolve(stdout.trim());
    });
  });
  console.log('[goLive] mkdir:', mkdirRes);

  // Write index.html via SFTP pipe
  const sftpCmd = `sshpass -p 'Clawbot12!' sftp -o StrictHostKeyChecking=no -P 65002 u805830916@82.29.86.252 <<'SFTP_EOF'\nput /dev/stdin "${hostingerDir}/index.html"\nbye\nSFTP_EOF`;

  await new Promise<void>((resolve, reject) => {
    const { exec: exec2 } = require('child_process');
    const p = exec2(sftpCmd);
    if (!p.stdin) { reject(new Error('No stdin')); return; }
    p.stdin.write(html, (err: Error | null) => {
      if (err) { reject(err); return; }
      p.stdin.end();
    });
    let stderr = '';
    p.stderr?.on('data', (d: string) => (stderr += d));
    p.on('close', (code: number) => {
      if (code !== 0) reject(new Error(`SFTP write failed: ${stderr}`));
      else resolve();
    });
  });
  console.log('[goLive] HTML written');

  // Mark site as active in Supabase
  await supabaseAdmin
    .from('properties')
    .update({
      status: 'active',
      site_url: `https://propbook.pro/props/${slug}`,
      server_ip: '82.29.86.252',
      folder_path: hostingerDir,
    })
    .eq('id', propertyId);

  console.log(`[goLive] Site live: https://propbook.pro/props/${slug}`);
  return `https://propbook.pro/props/${slug}`;
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// STEP 4a — Trigger Railway build + deploy to Hostinger
// POSTs to the Railway webhook receiver which runs deploy-to-hostinger.js
// ─────────────────────────────────────────────
export async function duplicateSiteAfterPayment(
  slug: string,
  propertyId: string
): Promise<{ slug: string; propertyId: string; deployUrl: string }> {
  const webhookUrl = import.meta.env.VITE_RAILWAY_WEBHOOK_URL;
  const webhookSecret = import.meta.env.VITE_RAILWAY_WEBHOOK_SECRET;

  const copyCommand = `node scripts/publish-and-copy.mjs ${slug} 8400 ${propertyId}`;
  console.log('[duplicateSiteAfterPayment] ✅ Site records created for slug:', slug);
  console.log('[duplicateSiteAfterPayment] Run this if needed:', copyCommand);

  if (!webhookUrl) {
    console.warn('[duplicateSiteAfterPayment] VITE_RAILWAY_WEBHOOK_URL not set — skipping automated deploy.');
    return { slug, propertyId, deployUrl: '' };
  }

  try {
    console.log('[duplicateSiteAfterPayment] 🚀 Triggering Railway deploy for slug:', slug);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (webhookSecret) headers['Authorization'] = `Bearer ${webhookSecret}`;

    const res = await fetch(`${webhookUrl}/deploy`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ slug, propertyId }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[duplicateSiteAfterPayment] Railway deploy failed:', res.status, errText);
      throw new Error(`Railway deploy failed: ${res.status}`);
    }

    const data = await res.json();
    console.log('[duplicateSiteAfterPayment] ✅ Railway deploy triggered:', data);
    return { slug, propertyId, deployUrl: `${webhookUrl}/deploy` };
  } catch (err) {
    console.error('[duplicateSiteAfterPayment] ❌ Railway webhook error:', err);
    return { slug, propertyId, deployUrl: webhookUrl || '' };
  }
}

// STEP 4 — Send confirmation email
// ─────────────────────────────────────────────
export async function sendNewSiteEmail(data: NewSiteData, siteUrl: string): Promise<void> {
  try {
    await supabase.functions.invoke('send-booking-email', {
      body: {
        type: 'new_site_created',
        user: { email: data.email, full_name: data.websiteName },
        property: { title: data.scrapedData?.title || data.websiteName },
        booking: null,
        adminEmail: data.bookingsEmail || data.email,
        adminName: data.websiteName,
        siteUrl,
        message: `Your site is live at: ${siteUrl}`,
      },
    });
  } catch (err) {
    console.warn('Confirmation email error:', err);
  }
}