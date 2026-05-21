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

import { supabase } from '../lib/supabase';
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
  const res = await fetch('/template/Airbnb Import Template/template.html');
  if (!res.ok) throw new Error('Failed to load template.html');
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
// STEP 3a — Create Supabase records (Button 1: Save Site)
// ─────────────────────────────────────────────
export async function createNewSiteRecords(data: NewSiteData): Promise<{
  propertyId: string;
  siteUrl: string;
  slug: string;
}> {
  const slug = createSlug(data.websiteName);

  // Create property record
  const { data: propertyRecord, error: propertyError } = await supabase
    .from('properties')
    .insert({
      title: data.scrapedData?.title || data.websiteName,
      slug,
      description: data.scrapedData?.description || data.websiteDesc,
      location: data.scrapedData?.location || '',
      max_guests: data.scrapedData?.guests || 8,
      bedrooms: data.scrapedData?.bedrooms || 2,
      beds: data.scrapedData?.beds || 3,
      baths: data.scrapedData?.baths || 1,
      price_per_night: data.scrapedData?.price
        ? parseFloat(data.scrapedData.price.replace(/[^0-9.]/g, ''))
        : 150,
      hero_image: data.scrapedData?.hero_image || '',
      images: data.scrapedData?.images || [],
      // Wire Stripe Connect account so booking payments route correctly
      stripe_account_id: data.userStripeAccountId || null,
      stripe_account_status: data.userStripeAccountId ? 'active' : null,
      owner_id: data.userId,
      status: 'draft',
    })
    .select('id')
    .single();

  if (propertyError) throw new Error(`Property insert failed: ${propertyError.message}`);
  const propertyId = propertyRecord.id;

  // Upsert profile with property link
  await supabase
    .from('profiles')
    .upsert({
      id: data.userId,
      email: data.email,
      full_name: data.websiteName,
      booking_email: data.bookingsEmail || data.email,
      user_type: 'admin',
      stripe_plan: data.planChoice,
      owner_id: propertyId,
      services_ai_seo: data.extras?.seo ?? false,
      services_marketing: data.extras?.ads ?? false,
      services_advertising: data.extras?.ads ?? false,
      services_analytics: data.extras?.analytics ?? false,
      services_influencers: false,
      services_social: data.extras?.social ?? false,
    });

  // Save full onboarding data with property link
  await supabase
    .from('onboarding_data')
    .upsert({
      user_id: data.userId,
      property_name: data.websiteName,
      property_desc: data.websiteDesc,
      airbnb_url: data.scrapedData?.title ? '(scraped)' : '',
      design_choice: data.designChoice,
      hosting_choice: data.hostingChoice,
      plan_choice: data.planChoice,
      email: data.email,
      bookings_email: data.bookingsEmail,
      property_id: propertyId,
      slug,
      hero_image: data.scrapedData?.hero_image || '',
      images: data.scrapedData?.images || [],
      guests: data.scrapedData?.guests || null,
      bedrooms: data.scrapedData?.bedrooms || null,
      beds: data.scrapedData?.beds || null,
      baths: data.scrapedData?.baths || null,
      rating: data.scrapedData?.rating || null,
      reviews: data.scrapedData?.reviews || null,
      host_name: data.scrapedData?.host_name || null,
      price: data.scrapedData?.price || null,
      created_at: new Date().toISOString(),
    });

  return { propertyId, siteUrl: `https://propbook.pro/props/${slug}`, slug };
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
  await supabase
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