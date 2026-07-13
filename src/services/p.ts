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

import { supabase, supabaseAdmin } from '../lib/supabase';
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
  slug?: string;  // optional explicit slug — if not provided, one is generated from websiteName
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
  const res = await fetch('/template/template.html');
  if (!res.ok) throw new Error(`Failed to load template.html: ${res.status}`);
  return res.text();
}

// ─────────────────────────────────────────────
// STEP 2 — Generate HTML by replacing placeholders
// ─────────────────────────────────────────────
export function generateSiteHtml(template: string, data: NewSiteData, jsBundle?: string, cssBundle?: string): string {
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
// STATIC HTML — Generate the full template.html with ALL tokens filled
// This is the SEO-friendly static landing page with property data baked in.
// The React app for booking/editing is deployed alongside at /app/.
// ─────────────────────────────────────────────
export function generateTemplateHtml(template: string, data: NewSiteData, supabaseUrl?: string, supabaseAnonKey?: string, jsBundle?: string): string {
  const s = data.scrapedData;

  // Primary images
  const img1 = s?.images?.[0] || s?.hero_image || '';
  const img2 = s?.images?.[1] || img1;
  const img3 = s?.images?.[2] || img1;
  const img4 = s?.images?.[3] || img1;
  const img5 = s?.images?.[4] || img1;
  const img6 = s?.images?.[5] || img1;

  // Price — strip non-numeric chars
  const pricePerNight = s?.price ? s.price.replace(/[^0-9.]/g, '') : '150';

  // Rating + reviews
  const rating = s?.rating?.toString() || '4.8';
  const reviewCount = String(s?.reviews ?? 0);

  // Property basics
  const title = s?.title || data.websiteName;
  const address = s?.location || '';
  const propertyIntro = s?.description || data.websiteDesc || '';

  // Brand/contact (not in scraped data — use defaults)
  const contactEmail = data.email || 'hello@propbook.pro';
  const brandHandle = '@' + data.slug || '@property';
  const currentUrl = `https://www.propbook.pro/props/${data.slug}`;

  // These tokens exist in template.html but aren't in scraped data — use empty/default
  const gettingThere = '';
  const localArea = '';
  const latitude = '';
  const longitude = '';
  const amenitiesBgImage = img1; // reuse first image as ambient bg
  const reviewsBgImage = img2 || img1;
  const dropdownsBgImage = img3 || img1;

  return template
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{ADDRESS\}\}/g, address)
    .replace(/\{\{PRICE_PER_NIGHT\}\}/g, pricePerNight)
    .replace(/\{\{PROPERTY_TITLE\}\}/g, title)
    .replace(/\{\{PROPERTY_INTRO\}\}/g, propertyIntro)
    .replace(/\{\{DESCRIPTION\}\}/g, propertyIntro)
    .replace(/\{\{IMAGE_1\}\}/g, img1)
    .replace(/\{\{IMAGE_2\}\}/g, img2)
    .replace(/\{\{IMAGE_3\}\}/g, img3)
    .replace(/\{\{IMAGE_4\}\}/g, img4)
    .replace(/\{\{IMAGE_5\}\}/g, img5)
    .replace(/\{\{IMAGE_6\}\}/g, img6)
    .replace(/\{\{IMAGE_SIDE_A\}\}/g, img2 || img1)
    .replace(/\{\{IMAGE_SIDE_B\}\}/g, img3 || img1)
    .replace(/\{\{HERO_IMAGE\}\}/g, img1)
    .replace(/\{\{RATING\}\}/g, rating)
    .replace(/\{\{REVIEW_COUNT\}\}/g, reviewCount)
    .replace(/\{\{AMENITIES_BG_IMAGE\}\}/g, amenitiesBgImage)
    .replace(/\{\{REVIEWS_BG_IMAGE\}\}/g, reviewsBgImage)
    .replace(/\{\{DROPDOWNS_BG_IMAGE\}\}/g, dropdownsBgImage)
    .replace(/\{\{GETTING_THERE\}\}/g, gettingThere)
    .replace(/\{\{LOCAL_AREA\}\}/g, localArea)
    .replace(/\{\{CONTACT_EMAIL\}\}/g, contactEmail)
    .replace(/\{\{CURRENT_URL\}\}/g, currentUrl)
    .replace(/\{\{BRAND_HANDLE\}\}/g, brandHandle)
    .replace(/\{\{LATITUDE\}\}/g, latitude)
    .replace(/\{\{LONGITUDE\}\}/g, longitude)
    // Supabase config (for the React app that runs in static template)
    .replace(/\{\{SUPABASE_URL\}\}/g, supabaseUrl || import.meta.env.VITE_SUPABASE_URL || 'https://jtzagpbdrqfifdisxipr.supabase.co')
    .replace(/\{\{SUPABASE_ANON_KEY\}\}/g, supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '')
    // Replace <!--APP_JS--> with pre-mount capture script + React bundle loader.
    // - Captures ?book=true into sessionStorage BEFORE React mounts
    // - Captures ?paid=true + session_id for Stripe redirect handling
    // - React app reads sessionStorage and scrolls to booking section
    // - React bundle served from CDN so it works from any /props/{slug}/ path
    .replace('<!--APP_JS-->', `
<script>
(function() {
  var params = new URLSearchParams(window.location.search);
  if (params.has('book')) {
    sessionStorage.setItem('scroll_to_booking', '1');
    var cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', cleanUrl);
  }
  if (params.has('paid') && params.has('session_id')) {
    sessionStorage.setItem('stripe_session_id', params.get('session_id'));
    sessionStorage.setItem('stripe_paid_flag', 'true');
    window.history.replaceState({}, '', window.location.pathname);
  }
})();
</script>
<script type="module" crossorigin src="https://www.propbook.pro/scripts/react-assets/assets/${jsBundle || 'index-DmF6Iksu.js'}?v=10"></script>`);
}

// ─────────────────────────────────────────────
// STEP 3a — Create Supabase records via Edge Function (Button 1: Save Site)
// ─────────────────────────────────────────────
export async function createNewSiteRecords(data: NewSiteData): Promise<{
  propertyId: string;
  siteUrl: string;
  slug: string;
}> {
  const slug = data.slug || createSlug(data.websiteName);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  console.log('[createNewSiteRecords] INPUT slug:', data.slug, '-> final slug:', slug);
  console.log('[createNewSiteRecords] INPUT websiteName:', data.websiteName);
  console.log('[createNewSiteRecords] INPUT scrapedData.title:', data.scrapedData?.title);
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(`Supabase env not configured: VITE_SUPABASE_URL=${supabaseUrl}, VITE_SUPABASE_ANON_KEY=${supabaseAnonKey}`);
  }

  let res;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/save-site-records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        title: data.websiteName,
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
        rating: data.scrapedData?.rating ?? null,
        reviews: data.scrapedData?.reviews ?? null,
        heroImage: data.scrapedData?.hero_image || '',
        images: data.scrapedData?.images || [],
        stripeAccountId: data.userStripeAccountId || null,
        stripeAccountStatus: data.userStripeAccountId ? 'active' : null,
        userId: data.userId,
        // Pass full scrapedData so save-site-records can use it directly
        // (migrate-property is the primary migration path; this is the fallback)
        scrapedData: data.scrapedData || null,
      }),
    });
    const result = await res.json();
    if (!res.ok || result.error) {
      throw new Error(`Property insert failed: ${result.error || res.statusText}`);
    }
    const { propertyId } = result;
    return { propertyId, siteUrl: `https://www.propbook.pro/props/${slug}`, slug };
  } catch (err) {
    console.error('[createNewSiteRecords] Error:', err);
    throw err;
  }
}

// ─────────────────────────────────────────────
// STEP 3b — Push HTML to Hostinger + activate site (Button 2: Go Live)
// ─────────────────────────────────────────────
export async function goLiveSite(propertyId: string, slug: string, html: string): Promise<string> {
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

  await supabaseAdmin
    .from('properties')
    .update({
      status: 'active',
      site_url: `https://www.propbook.pro/props/${slug}`,
      server_ip: '82.29.86.252',
      folder_path: hostingerDir,
    })
    .eq('id', propertyId);

  console.log(`[goLive] Site live: https://www.propbook.pro/props/${slug}`);
  return `https://www.propbook.pro/props/${slug}`;
}

// ─────────────────────────────────────────────
// STEP 4 — Browser-based deploy via upload.php on Hostinger
// Uses the Vite React build (NOT the GitHub template's plain JS).
// The React bundle includes CustomerSite which fetches property data by slug
// from Supabase — Supabase URL is baked in at build time via VITE_SUPABASE_URL.
// Works entirely in-browser (no Node.js exec, no SSH).
// ─────────────────────────────────────────────
const DEPLOY_SECRET = 'propbook-deploy-2026';
const UPLOAD_PHP_URL = 'https://www.propbook.pro/upload.php';

// Asset filenames are read from the manifest uploaded with each build.
// The manifest is written to dist/assets-manifest.json by vite.config.ts post-build hook,
// and uploaded to the CDN alongside the JS/CSS assets.
interface AssetManifest {
  js: string;
  css: string;
  builtAt: number;
}

async function getAssetManifest(cdnBase: string): Promise<AssetManifest> {
  const res = await fetch(`${cdnBase}/assets-manifest.json?v=${Date.now()}`);
  if (!res.ok) throw new Error(`Manifest not found at ${cdnBase}/assets-manifest.json — run \`npm run build\` and upload assets to CDN first.`);
  return res.json();
}

// Generate index.html for a property-specific React deployment.
// Uses RELATIVE asset paths so it works at /props/{slug}/.
// Includes Stripe pre-mount capture so ?paid=true survives SPA routing.
function buildPropertyIndexHtml(slug: string, jsFile: string, cssFile: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${slug} — PropBook</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Libre+Baskerville:wght@400;700&family=Oswald:wght@400;500;600;700&family=Sintony:wght@400;700&family=Raleway:wght@400;500;600;700&family=Urbanist:wght@400;500;600;700&family=DM+Serif+Display&family=Fraunces:wght@400;700&family=Archivo+Black&display=swap" rel="stylesheet">
  <style>
    :root{--brand:#C47756;--brand-hover:#B5684A;--brand-disabled:#D4A393;--font-accent:'Playfair Display',serif}
    body { margin: 0; background: #111; }
    #root:empty::after {
      content: 'Loading property...';
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: #111; color: rgba(255,255,255,0.5);
      font-family: 'Inter', sans-serif; font-size: 0.85rem; letter-spacing: 0.1em;
    }
  </style>
  <!-- Stripe return param capture + ?book=true scroll — BEFORE React mounts -->
  <script>
  (function() {
    var params = new URLSearchParams(window.location.search);
    var hasPaid = params.has('paid');
    var sessionId = params.get('session_id');
    var wantsBook = params.has('book');
    if (hasPaid && sessionId) {
      sessionStorage.setItem('stripe_session_id', sessionId);
      sessionStorage.setItem('stripe_paid_flag', 'true');
      window.history.replaceState({}, '', window.location.pathname);
    }
    // Tell React to scroll to #calendar-section after mount
    if (wantsBook) {
      sessionStorage.setItem('scroll_to_booking', '1');
      window.history.replaceState({}, '', window.location.pathname);
    }
  })();
  </script>
  <link rel="stylesheet" href="./assets/${CSS_FILE}">
</head>
<body>
  <div id="root"></div>
  <script type="module" crossorigin src="./assets/${JS_FILE}"></script>
</body>
</html>`;
}

export async function deployViaUploadPhp(
  slug: string,
  propertyId: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
  data: NewSiteData,
  onProgress?: (msg: string) => void
): Promise<string> {
  const siteUrl = `https://www.propbook.pro/props/${slug}`;

  onProgress?.('Fetching React bundle manifest from CDN...');

  // ── Step 1: Read asset manifest to get current bundle filenames ─────────────
  // Must upload dist/assets-manifest.json to CDN after each `npm run build`
  const cdnBase = 'https://www.propbook.pro/scripts/react-assets/assets';
  const manifestRes = await getAssetManifest('https://www.propbook.pro/scripts/react-assets');
  const jsFile = manifestRes.js;
  const cssFile = manifestRes.css;
  if (!jsFile || !cssFile) throw new Error(`Invalid manifest: ${JSON.stringify(manifestRes)}`);
  console.log(`[deployViaUploadPhp] Bundle: ${jsFile}, CSS: ${cssFile} (built ${new Date(manifestRes.builtAt).toISOString()})`);

  // ── Step 2: Fetch React bundle + CSS from CDN ─────────────────────────────
  onProgress?.('Fetching React bundle from CDN...');
  let reactJs: string;
  let reactCss: string;
  try {
    const r = await fetch(`${cdnBase}/${jsFile}?v=${manifestRes.builtAt}`);
    if (!r.ok) throw new Error(`React bundle not found at ${cdnBase}/${jsFile} — run \`npm run build\` and upload assets to CDN first.`);
    reactJs = await r.text();
    reactCss = await (await fetch(`${cdnBase}/${cssFile}?v=${manifestRes.builtAt}`)).text();
    console.log(`[deployViaUploadPhp] React bundle: ${(reactJs.length/1024).toFixed(0)}KB, CSS: ${(reactCss.length/1024).toFixed(0)}KB`);
  } catch (e) {
    throw new Error(`Failed to fetch React bundle from CDN: ${e.message}`);
  }

  // ── Step 3: Fetch template from GitHub ────────────────────────────────────
  onProgress?.('Fetching template from GitHub...');
  const GITHUB_RAW = 'https://raw.githubusercontent.com/millymollison-stack/surfhousebaja/main/src/public/template';
  let templateHtml: string;
  try {
    const res = await fetch(`${GITHUB_RAW}/template.html`);
    if (!res.ok) throw new Error(`Template not found (${res.status})`);
    templateHtml = await res.text();
    console.log(`[deployViaUploadPhp] Template: ${templateHtml.length} chars`);
  } catch (e) {
    throw new Error(`Failed to fetch template from GitHub: ${e.message}`);
  }

  // ── Step 4: Fill template tokens with property data ─────────────────────────
  // jsFile from manifest is passed so CDN URL in template gets correct bundle filename
  onProgress?.('Generating static HTML with property data...');
  const indexHtml = generateTemplateHtml(templateHtml, { ...data, slug }, supabaseUrl, supabaseAnonKey, jsFile);

  // UTF-8 safe base64 — btoa() only handles Latin1, template files have smart quotes/em-dashes
  const encodeBase64 = (str: string) => btoa(unescape(encodeURIComponent(str)));

  onProgress?.('Uploading files to server...');

  // ── Upload files to Hostinger via upload.php ────────────────────────────
  // index.html  = static template with ALL property data baked in (SEO content)
  // app.js      = React bundle for interactive booking/editing (loaded by index.html)
  const uploadPayload = {
    secret: DEPLOY_SECRET,
    slug,
    propertyId,
    files: {
      'index.html': encodeBase64(indexHtml),
      [jsFile]: encodeBase64(reactJs),
      [cssFile]: encodeBase64(reactCss),
    },
  };

  const res = await fetch(UPLOAD_PHP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(uploadPayload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`upload.php HTTP ${res.status}: ${text}`);
  }

  const result = await res.json();
  if (!result.success) {
    throw new Error(`upload.php error: ${result.error || 'unknown'}`);
  }

  onProgress?.('Site deployed!');
  return result.siteUrl || siteUrl;
}

// ─────────────────────────────────────────────
// STEP 4 — Deploy to Hostinger via edge function
// Calls deploy-site edge function which SSHs into Hostinger,
// copies Migration template, builds the React app, and activates the site
// ─────────────────────────────────────────────
export async function duplicateSiteAfterPayment(
  slug: string,
  propertyId: string
): Promise<{ slug: string; propertyId: string; deployUrl: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const siteUrl = `https://www.propbook.pro/props/${slug}`;

  console.log('[duplicateSiteAfterPayment] 🚀 Deploying to Hostinger for slug:', slug);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No session — please sign in again');

    const res = await fetch(`${supabaseUrl}/functions/v1/deploy-site`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'Apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ slug, propertyId }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || `Deploy failed: ${res.status}`);
    }

    console.log('[duplicateSiteAfterPayment] ✅ Deploy complete:', siteUrl);
    return { slug, propertyId, deployUrl: siteUrl };
  } catch (err) {
    console.error('[duplicateSiteAfterPayment] ❌ Deploy error:', err);
    return { slug, propertyId, deployUrl: siteUrl };
  }
}

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
// deploy trigger
