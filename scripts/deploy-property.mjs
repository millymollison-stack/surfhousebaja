/**
 * deploy-property.mjs
 *
 * End-to-end deploy script for post-subscription property websites.
 *
 * Usage:
 *   node scripts/deploy-property.mjs --slug=<slug> --user-id=<userId> --original-property-id=<propId> [--scraped-data=<json>]
 *
 * Steps:
 *  1. Load original property from Supabase
 *  2. Merge with scraped data (if provided)
 *  3. Create new Property ID in Supabase via save-site-records or direct insert
 *  4. Render HTML template with merged data
 *  5. Upload to Hostinger via SSH/SCP
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join as pathJoin } from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ── Config ──────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://jtzagpbdrqfifdisxipr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Hostinger
const HOSTINGER_HOST = '82.29.86.252';
const HOSTINGER_PORT = '65002';
const HOSTINGER_USER = 'u805830916';
const HOSTINGER_PASS = 'Clawbot12!';
const HOSTINGER_BASE = '/home/u805830916/domains/propbook.pro/public_html';

// ── Helpers ─────────────────────────────────────────────────────────

function ssh(cmd) {
  return execSync(
    `sshpass -p '${HOSTINGER_PASS}' ssh -o StrictHostKeyChecking=no -p ${HOSTINGER_PORT} ${HOSTINGER_USER}@${HOSTINGER_HOST} "${cmd.replace(/"/g, '\\"')}"`,
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
}

function sftpWrite(remotePath, content) {
  // sftp can't read from /dev/stdin via heredoc — write to a temp file first
  const tmpDir = mkdtempSync(pathJoin(tmpdir(), 'propbook-deploy-'));
  const tmpFile = pathJoin(tmpDir, 'upload.tmp');
  writeFileSync(tmpFile, content);
  const cmd = `sshpass -p '${HOSTINGER_PASS}' sftp -o StrictHostKeyChecking=no -P ${HOSTINGER_PORT} ${HOSTINGER_USER}@${HOSTINGER_HOST} <<'SFTP_EOF'
put "${tmpFile}" "${remotePath}"
bye
SFTP_EOF`;
  try {
    return execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  } finally {
    try { require('fs').unlinkSync(tmpFile); } catch {}
    try { require('fs').rmdirSync(tmpDir); } catch {}
  }
}

async function fetchPropertyById(propertyId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/properties?id=eq.${encodeURIComponent(propertyId)}&select=*&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch property ${propertyId}: ${res.status}`);
  const data = await res.json();
  return data?.[0] || null;
}

async function fetchPropertyImages(propertyId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/property_images?property_id=eq.${encodeURIComponent(propertyId)}&select=url,position&order=position&limit=30`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function createPropertyInSupabase(slug, userId, mergedData) {
  // Use the save-site-records function approach — insert directly into properties table
  const payload = {
    title: mergedData.title || mergedData.property_title || 'Untitled Property',
    slug,
    owner_id: userId,
    description: mergedData.description || mergedData.property_intro || '',
    address: mergedData.address || '',
    max_guests: mergedData.max_guests || 8,
    bedrooms: mergedData.bedrooms || 2,
    bathrooms: mergedData.bathrooms || mergedData.baths || 1,
    beds: mergedData.beds || 3,
    price_per_night: mergedData.price_per_night || mergedData.price || 150,
    hero_image: mergedData.hero_image || '',
    images: Array.isArray(mergedData.images) ? mergedData.images : [],
    // Rich content from reference
    property_details: mergedData.property_details || null,
    property_intro: mergedData.property_intro || null,
    activities: mergedData.activities || null,
    local_area: mergedData.local_area || null,
    getting_there: mergedData.getting_there || null,
    brand_color: mergedData.brand_color || '#C47756',
    font_accent: mergedData.font_accent || null,
    status: 'active',
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/properties`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create property: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data?.[0] || null;
}

async function copyPropertyImages(sourcePropertyId, targetPropertyId) {
  // Copy images from source to target property
  const images = await fetchPropertyImages(sourcePropertyId);
  if (images.length === 0) return;

  const imageRecords = images.map((img, idx) => ({
    property_id: targetPropertyId,
    url: img.url,
    position: img.position || idx + 1,
    is_featured: idx === 0,
    is_main: idx === 0,
  }));

  // Delete existing images for target
  await fetch(`${SUPABASE_URL}/rest/v1/property_images?property_id=eq.${encodeURIComponent(targetPropertyId)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });

  // Insert new images
  const res = await fetch(`${SUPABASE_URL}/rest/v1/property_images`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(imageRecords),
  });

  if (!res.ok) {
    console.warn(`⚠️ Image copy warning: ${res.status}`);
  } else {
    console.log(`✅ Copied ${imageRecords.length} images to new property`);
  }
}

// ── Render template (abbreviated — delegates to render-template.mjs logic) ──

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseImages(imagesJson) {
  if (!imagesJson) return [];
  if (Array.isArray(imagesJson)) return imagesJson;
  try {
    const parsed = JSON.parse(imagesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function renderStars(rating) {
  const r = parseFloat(rating || 0);
  const full = Math.floor(r);
  const half = r - full >= 0.5;
  let html = '';
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      html += '<svg viewBox="0 0 24 24" fill="#FBBF24" stroke="#FBBF24" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    } else if (i === full && half) {
      html += '<svg viewBox="0 0 24 24" fill="#FBBF24" stroke="#FBBF24" stroke-width="1"><defs><linearGradient id="h"><stop offset="50%" stop-color="#FBBF24"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="url(#h)"/></svg>';
    } else {
      html += '<svg viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    }
  }
  return html;
}

function renderAmenityIcon(name) {
  const icons = {
    'wifi': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>',
    'pool': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12c.6.5 1.2 1 2.5 1C7 13 7 11 9.5 11s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2c.6 0 1.2-.5 2.5-1"/><path d="M2 17c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c.6 0 1.2-.5 2.5-1"/><path d="M2 7c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c.6 0 1.2-.5 2.5-1"/></svg>',
    'kitchen': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 11h18M3 11v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M3 11l2-9h14l2 9M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    'ac': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"/><circle cx="12" cy="12" r="4"/></svg>',
    'washer': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="6"/><path d="M3 12h18"/></svg>',
    'tv': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="15" rx="2"/><path d="M7 19h10M12 15v4"/></svg>',
    'parking': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>',
    'gym': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 6.5h11M6.5 17.5h11M3 12h3M18 12h3M6.5 6.5v11M17.5 6.5v11"/></svg>',
    'hot tub': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 16c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z"/><path d="M12 6v2M8 9h8M12 2v1M2 12h1M22 12h-1M4.22 4.22l.71.71M19.07 4.22l-.71.71M4.22 19.78l.71-.71M19.07 19.78l-.71-.71"/></svg>',
    'beach': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-3-3.87M3 21h18M9 9a3 3 0 1 1 6 0M9 9l-5 5"/><circle cx="12" cy="7" r="4"/></svg>',
    'surfboard': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l4 20-4-1-4 1 4-20z"/></svg>',
    'fire pit': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 21c-4 0-6-2-6-6 0-3 2-5 4-7 0 2 1 3 2 3s2-1 2-3c2 2 4 4 4 7 0 4-2 6-6 6z"/></svg>',
    'default': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>',
  };
  const key = Object.keys(icons).find(k => name.toLowerCase().includes(k));
  return icons[key] || icons['default'];
}

function renderAmenities(amenitiesStr) {
  if (!amenitiesStr) return '';
  let list;
  if (Array.isArray(amenitiesStr)) {
    list = amenitiesStr;
  } else if (typeof amenitiesStr === 'string') {
    try { list = JSON.parse(amenitiesStr); } catch { list = amenitiesStr.split(','); }
  } else {
    list = [];
  }
  if (!Array.isArray(list) || list.length === 0) return '';
  const badges = list.map(item => `
    <div class="amenity-badge">
      ${renderAmenityIcon(item)}
      <span>${escapeHtml(item)}</span>
    </div>
  `).join('');
  return `<div class="amenities-grid">${badges}</div>`;
}

function replaceToken(template, token, value) {
  const regex = new RegExp(`\\{\\{${token}\\}\\}`, 'g');
  return template.replace(regex, value !== undefined && value !== null ? String(value) : '');
}

function renderTemplate(template, property, propertyImages) {
  const p = property;
  const slug = p.slug || 'property';
  const dbImages = Array.isArray(propertyImages) ? propertyImages : [];
  const dbImageUrls = dbImages.map(img => img.url).filter(Boolean);
  const brandColor = p.brand_color || '#C47756';
  const brandName = p.name || 'PropBook';
  const price = p.price_per_night || p.price || '0';
  const rating = parseFloat(p.rating || 0);
  const reviewCount = parseInt(p.reviews || p.review_count || 0, 10);
  const bedrooms = p.bedrooms || 0;
  const beds = p.beds || 0;
  const baths = p.bathrooms || p.baths || 0;
  const maxGuests = p.max_guests || 0;
  const title = p.title || 'Beach House';
  const address = p.address || p.location || '';
  const latitude = p.latitude || '30.861383';
  const longitude = p.longitude || '-116.167874';
  const description = p.description || '';
  const propertyIntro = p.property_intro || '';
  const hostName = p.host_name || 'your host';
  const amenities = p.amenities || '';
  const activities = p.activities || '';
  const localArea = p.local_area || '';
  const gettingThere = p.getting_there || '';
  const propertyTitle = p.property_title || `@${slug}`;
  const bookingUrl = p.booking_url || p.airbnb_url || '#';
  const heroImage = p.hero_image || '';
  const allImages = dbImageUrls.length > 0
    ? dbImageUrls
    : [heroImage, ...parseImages(p.images)].filter(Boolean);

  let html = template;

  // Basic tokens
  html = replaceToken(html, 'BRAND_NAME', brandName);
  html = replaceToken(html, 'BRAND_COLOR', brandColor);
  html = replaceToken(html, 'TITLE', title);
  html = replaceToken(html, 'ADDRESS', address);
  html = replaceToken(html, 'LATITUDE', latitude);
  html = replaceToken(html, 'LONGITUDE', longitude);
  html = replaceToken(html, 'PRICE_PER_NIGHT', price);
  html = replaceToken(html, 'DESCRIPTION', description);
  html = replaceToken(html, 'BEDROOMS', bedrooms);
  html = replaceToken(html, 'BEDS', beds);
  html = replaceToken(html, 'BATHROOMS', baths);
  html = replaceToken(html, 'MAX_GUESTS', maxGuests);
  html = replaceToken(html, 'RATING', rating.toFixed(1));
  html = replaceToken(html, 'REVIEW_COUNT', reviewCount.toString());
  html = replaceToken(html, 'HOST_NAME', hostName);
  html = replaceToken(html, 'AMENITIES', amenities);
  html = replaceToken(html, 'ACTIVITIES', activities);
  html = replaceToken(html, 'LOCAL_AREA', localArea);
  html = replaceToken(html, 'GETTING_THERE', gettingThere);
  html = replaceToken(html, 'PROPERTY_TITLE', propertyTitle);
  html = replaceToken(html, 'PROPERTY_INTRO', propertyIntro);
  html = replaceToken(html, 'SLUG', slug);
  html = replaceToken(html, 'BOOKING_URL', bookingUrl);
  html = replaceToken(html, 'PROPERTY_ID', p.id || '');

  for (let i = 1; i <= 20; i++) {
    html = replaceToken(html, `IMAGE_${i}`, allImages[i - 1] || '');
  }

  html = replaceToken(html, 'AMENITIES_BG_IMAGE', allImages[1] || allImages[0] || '');
  html = replaceToken(html, 'REVIEWS_BG_IMAGE', allImages[2] || allImages[0] || '');
  html = replaceToken(html, 'DROPDOWNS_BG_IMAGE', allImages[3] || allImages[0] || '');

  html = replaceToken(html, 'STAR_RATING_HTML', renderStars(rating));
  html = replaceToken(html, 'AMENITIES_HTML', renderAmenities(amenities));
  html = replaceToken(html, 'HERO_IMAGE', heroImage || allImages[0] || '');

  const metaDesc = description.slice(0, 160).replace(/\n/g, ' ').trim() || `${title} — beautiful vacation rental in ${address}`;
  html = replaceToken(html, 'META_DESCRIPTION', metaDesc);

  // Pluralization
  const bedroomMatch = String(bedrooms).match(/^(\d+)/);
  const bedsMatch = String(beds).match(/^(\d+)/);
  const bathsMatch = String(baths).match(/^(\d+)/);
  const guestsMatch = String(maxGuests).match(/^(\d+)/);
  const bedroomCount = bedroomMatch ? parseInt(bedroomMatch[1]) : 0;
  const bedsCount = bedsMatch ? parseInt(bedsMatch[1]) : 0;
  const bathsCount = bathsMatch ? parseInt(bathsMatch[1]) : 0;
  const guestsCount = guestsMatch ? parseInt(guestsMatch[1]) : 0;

  html = html.replace(/\{\{#BEDROOMS_plural\}\}(s)\{\{\/BEDROOMS_plural\}\}/gi, bedroomCount !== 1 ? '$1' : '');
  html = html.replace(/\{\{#BEDS_plural\}\}(s)\{\{\/BEDS_plural\}\}/gi, bedsCount !== 1 ? '$1' : '');
  html = replaceToken(html, 'BATHROOMS_plural', bathsCount !== 1 ? 's' : '');
  html = replaceToken(html, 'MAX_GUESTS_plural', guestsCount !== 1 ? 's' : '');

  // Clean up remaining tokens
  html = html.replace(/\{\{#[A-Za-z_][A-Za-z0-9_]*\}\}\s*/gi, '');
  html = html.replace(/\{\{\/[A-Za-z_][A-Za-z0-9_]*\}\}\s*/gi, '');
  html = html.replace(/\{\{\.\}\}\s*/g, '');
  html = html.replace(/\{\{[A-Za-z_][A-Za-z0-9_]*\}\}\s*/gi, '');

  return html;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let slug = null;
  let userId = null;
  let originalPropertyId = null;
  let scrapedDataJson = null;

  // Support both --flag=value and positional arguments
  // node deploy-property.mjs --slug=x --user-id=y --original-property-id=z
  // node deploy-property.mjs slug userId originalPropertyId
  if (args.length >= 3 && !args[0].startsWith('--')) {
    [slug, userId, originalPropertyId] = args;
  } else {
    for (const arg of args) {
      if (arg.startsWith('--slug=')) slug = arg.slice(7);
      else if (arg.startsWith('--user-id=')) userId = arg.slice(10);
      else if (arg.startsWith('--original-property-id=')) originalPropertyId = arg.slice(21);
      else if (arg.startsWith('--scraped-data=')) scrapedDataJson = arg.slice(14);
    }
  }

  if (!slug || !userId || !originalPropertyId) {
    console.error('Usage: node deploy-property.mjs [--slug=<slug>] [--user-id=<userId>] [--original-property-id=<propId>] [--scraped-data=<json>]');
    console.error('   or:  node deploy-property.mjs <slug> <userId> <originalPropertyId>');
    process.exit(1);
  }

  console.log(`\n🚀 Starting deploy for slug=${slug}, user=${userId}, source=${originalPropertyId}\n`);

  // Step 1: Load original property
  console.log('📋 Step 1: Loading original property from Supabase...');
  const originalProperty = await fetchPropertyById(originalPropertyId);
  if (!originalProperty) {
    throw new Error(`Original property ${originalPropertyId} not found in Supabase`);
  }
  console.log(`✅ Got original property: "${originalProperty.title || originalProperty.property_title}"`);

  // Step 2: Parse scraped data
  let scrapedData = {};
  if (scrapedDataJson) {
    try {
      scrapedData = JSON.parse(scrapedDataJson);
      console.log('✅ Parsed scraped data');
    } catch {
      console.warn('⚠️ Failed to parse scraped data, using empty object');
    }
  }

  // Step 3: Merge data
  console.log('\n🔀 Step 2: Merging property data...');
  const { mergePropertyData } = await import('./merge-property-data.mjs');
  const merged = mergePropertyData(originalProperty, scrapedData);
  console.log(`✅ Merge complete — title: "${merged.title || merged.property_title}", price: $${merged.price_per_night}`);

  // Step 4: Create new Property ID in Supabase
  console.log('\n🗄️ Step 3: Creating new Property ID in Supabase...');
  const newProperty = await createPropertyInSupabase(slug, userId, merged);
  if (!newProperty) throw new Error('Failed to create property in Supabase');
  console.log(`✅ New property created: ${newProperty.id}`);

  // Step 4b: Copy images from source to new property
  console.log('\n🖼️ Step 3b: Copying property images...');
  await copyPropertyImages(originalPropertyId, newProperty.id);

  // Step 5: Render HTML template
  console.log('\n🎨 Step 4: Rendering HTML template...');
  const templatePath = join(PROJECT_ROOT, 'src', 'public', 'template', 'template.html');
  const template = readFileSync(templatePath, 'utf8');

  // Also need app.js for interactive features
  const appJsPath = join(PROJECT_ROOT, 'src', 'public', 'template', 'app.js');
  const appJsContent = readFileSync(appJsPath, 'utf8');

  // Inject Supabase config into app.js for React interactive features
  const configuredAppJs = appJsContent
    .replace('window.__SUPABASE_URL__ = \'\';', `window.__SUPABASE_URL__ = '${SUPABASE_URL}';`)
    .replace('window.__SUPABASE_ANON_KEY__ = \'\';', `window.__SUPABASE_ANON_KEY__ = '${SUPABASE_SERVICE_KEY}';`)
    .replace('window.__PROPERTY_SLUG__ = \'\';', `window.__PROPERTY_SLUG__ = '${slug}';`);

  const propertyImages = await fetchPropertyImages(newProperty.id);
  const mergedWithId = { ...merged, id: newProperty.id, slug };
  const renderedHtml = renderTemplate(template, mergedWithId, propertyImages);
  console.log(`✅ HTML rendered: ${renderedHtml.length} bytes`);

  // Step 6: Upload to Hostinger
  const remoteDir = `${HOSTINGER_BASE}/props/${slug}`;
  const siteUrl = `https://www.propbook.pro/props/${slug}`;

  console.log('\n📤 Step 5: Uploading to Hostinger...');
  console.log(`   Directory: ${remoteDir}`);

  // Create directory
  ssh(`mkdir -p '${remoteDir}' && echo DIR_OK`);
  console.log('✅ Directory created');

  // Write HTML
  sftpWrite(`${remoteDir}/index.html`, renderedHtml);
  // Fix permissions so Apache can serve the file
  ssh(`chmod 644 '${remoteDir}/index.html'`);
  console.log('✅ index.html uploaded (0644)');

  // Write app.js
  sftpWrite(`${remoteDir}/app.js`, configuredAppJs);
  ssh(`chmod 644 '${remoteDir}/app.js'`);
  console.log('✅ app.js uploaded (0644)');

  console.log(`\n🎉 Deploy complete!`);
  console.log(`   🔗 ${siteUrl}`);
  console.log(`   📋 New Property ID: ${newProperty.id}`);
  console.log(`   ✏️  Edit: ${siteUrl}/edit`);

  return { siteUrl, propertyId: newProperty.id, slug };
}

main().catch(err => {
  console.error('\n❌ Deploy failed:', err.message);
  process.exit(1);
});