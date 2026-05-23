#!/usr/bin/env node
/**
 * generate-property-site.mjs
 * Reads base property data from Supabase, merges with scraped Airbnb data,
 * generates HTML, saves to src/props/{slug}/index.html
 * 
 * Usage: node scripts/gen-site.mjs [slug] [scrapedDataJson]
 *   slug — property slug (e.g. casablanca1)
 *   scrapedDataJson — optional JSON string for scraped data (testing only)
 *   normally reads from sessionStorage via the browser after scrape
 */

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prjRoot = join(__dirname, '..');

const SUPABASE_URL = 'https://jtzagpbdrqfifdisxipr.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0emFncGJkcnFmaWZkaXN4aXByIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDczNTI4NSwiZXhwIjoyMDYwMzExMjg1fQ.FjzjJYgN83YtmhwqKsW8kJhvkrqvlkWOzy5T4JxAgjM';

// ── Fetch profile by email ─────────────────────────────────────────────────
async function fetchProfileByEmail(email) {
  const sb = createClient(SUPABASE_URL, SB_KEY);
  const { data } = await sb.from('profiles').select('*').eq('email', email).single();
  return data;
}

// ── Fetch property by id ──────────────────────────────────────────────────────────
async function fetchPropertyById(id) {
  const sb = createClient(SUPABASE_URL, SB_KEY);
  const { data: prop, error } = await sb.from('properties').select('*').eq('id', id).single();
  if (error) throw new Error('Property not found: ' + error.message);
  return prop;
}

// ── Fetch property images ───────────────────────────────────────────────────
async function fetchPropertyImages(propertyId) {
  const sb = createClient(SUPABASE_URL, SB_KEY);
  const { data } = await sb.from('property_images').select('*').eq('property_id', propertyId).order('position');
  return data || [];
}

// ── Load template HTML ───────────────────────────────────────────────────────
function loadTemplate() {
  const p = join(prjRoot, 'public', 'template.html');
  if (!fs.existsSync(p)) throw new Error('Template not found: ' + p);
  return readFileSync(p, 'utf8');
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function adjustBrightness(hex, percent) {
  if (!hex || !hex.startsWith('#')) return '#888888';
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ── Generate HTML ───────────────────────────────────────────────────────────
function generateHtml(template, { prop, images, profile, scrape, websiteName, slug }) {
  // ── OVERRIDE LOGIC: scrape data takes priority over property base data ──
  const title       = scrape?.title       || prop?.title       || websiteName || 'My Property';
  const location    = scrape?.location     || prop?.location    || prop?.address || '';
  const description = scrape?.description || prop?.description || '';
  const price       = scrape?.price ? scrape.price.replace(/[^0-9.]/g, '') : String(prop?.price_per_night || 150);
  const hero_image  = scrape?.hero_image  || scrape?.images?.[0] || images?.[0]?.url || prop?.hero_image || '';
  const imagesArr   = scrape?.images      || images?.map(i => i.url) || prop?.images || [];
  const guests      = scrape?.guests      || prop?.max_guests  || 8;
  const bedrooms    = scrape?.bedrooms    || prop?.bedrooms    || 2;
  const beds        = scrape?.beds        || prop?.beds        || 3;
  const baths       = scrape?.baths       || prop?.bathrooms   || prop?.baths || 1;
  const rating      = scrape?.rating      || '4.8';
  const reviews     = scrape?.reviews    || 0;
  const reviewPlural = reviews === 1 ? '' : 's';

  const brandColor  = prop?.brand_color  || '#C47756';
  const fontAccent  = prop?.font_accent  || 'Playfair Display';

  // Gallery: slice off hero, render remaining images
  const galleryImages = imagesArr.slice(1);
  const heroBlock = hero_image
    ? '<img class="p-bg-img" src="' + hero_image + '" alt="Hero">'
    : '';
  const galleryBlock = galleryImages.map(img =>
    '<img src="' + img + '" alt="' + title + '" loading="lazy" style="width:100%;border-radius:4px;margin-bottom:8px;display:block;" />'
  ).join('\n    ');

  const detailsHTML = [
    '<span class="p-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>' + guests + ' Guests</span>',
    '<span class="p-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4v16h20V4H2zM2 8h20M12 12v8"/></svg>' + bedrooms + ' Bedrooms</span>',
    '<span class="p-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l9 6-9 6V6z"/></svg>' + beds + ' Beds</span>',
    '<span class="p-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' + baths + ' Baths</span>',
  ].join('');

  const brandCSS = '.p-book-btn { background: ' + brandColor + ' !important; }\n  .p-book-btn:hover { background: ' + adjustBrightness(brandColor, -15) + ' !important; }';
  const fontLink = (fontAccent && fontAccent !== 'Inter')
    ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fontAccent) + ':wght@300;400;500;600;700&display=swap">'
    : '';
  const fontFamilyCSS = (fontAccent && fontAccent !== 'Inter')
    ? '.p-title, .p-location, .p-price { font-family: "' + fontAccent + '", Inter, sans-serif; }'
    : '';

  const extraStyle = '<style>\n    ' + brandCSS + '\n    ' + fontFamilyCSS + '\n  </style>';
  const headInjection = fontLink + '\n  ' + extraStyle;

  let html = template
    .replace(/\{\{BRAND_NAME\}\}/g, websiteName || title)
    .replace(/\{\{TITLE\}\}/g, title)
    .replace(/\{\{LOCATION\}\}/g, location)
    .replace(/\{\{PRICE\}\}/g, price)
    .replace(/\{\{DESCRIPTION\}\}/g, description)
    .replace(/\{\{HERO_IMAGE\}\}/g, hero_image)
    .replace(/\{\{REVIEW_COUNT\}\}/g, String(reviews))
    .replace(/\{\{REVIEW_PLURAL\}\}/g, reviewPlural)
    .replace(/\{\{DETAILS\}\}/g, detailsHTML)
    .replace('<img class="p-bg-img" src="{{HERO_IMAGE}}" alt="Hero">', heroBlock + (galleryBlock ? '\n    ' + galleryBlock : ''));

  // Inject head CSS before </head>
  html = html.replace('</head>', headInjection + '\n</head>');

  // Booking button link
  const propId = prop?.id || slug;
  html = html.replace('class="p-book-btn">Book Now', 'class="p-book-btn" href="https://propbook.pro/pay/' + propId + '">Book Now');

  return html;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const propertyId = process.argv[2] || 'a57f4eb7-07f7-46e4-b310-28e01b308b11';
  const scrapeArg = process.argv[3];

  console.log('\n🔧 Generating site for property ID: ' + propertyId + '\n');

  // 1. Fetch property + images by id
  const prop = await fetchPropertyById(propertyId);
  const images = await fetchPropertyImages(prop.id);
  const slug = prop.slug || propertyId;

  console.log('📦 Property: ' + (prop.title || prop.slug));
  console.log('   ID: ' + prop.id);
  console.log('   Name field: ' + prop.name);
  console.log('   Title field: ' + prop.title);
  console.log('   Location: ' + (prop.location || prop.address));
  console.log('   Images: ' + images.length + ' (DB) | ' + (prop.images?.length || 0) + ' (inline)');
  console.log('   Brand color: ' + (prop.brand_color || '#C47756'));
  console.log('   Font: ' + (prop.font_accent || 'Playfair Display'));

  // 2. Scrape data from arg (simulates sessionStorage scrapedData after Airbnb import)
  let scrape = null;
  if (scrapeArg) {
    scrape = JSON.parse(scrapeArg);
    console.log('   Scrape (from arg): ' + scrape.title);
  }

  // 3. Website name
  const websiteName = scrape?.property_name || scrape?.title || prop.name || prop.title || slug;

  // 4. Generate HTML
  const template = loadTemplate();
  const html = generateHtml(template, { prop, images, profile: {}, scrape, websiteName, slug });

  // 5. Write file
  const outDir = join(prjRoot, 'props', slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(join(outDir, 'index.html'), html);

  console.log('\n✅ Written: ' + outDir + '/index.html');
  console.log('   Size: ' + html.length + ' bytes');
  console.log('   Title: ' + (scrape?.title || prop?.title || slug));

  // 6. Highlight override fields
  console.log('\n📝 Override fields applied:');
  if (scrape) {
    console.log('   ✅ SCRAPE → title: "' + scrape.title + '"');
    console.log('   ✅ SCRAPE → location: "' + scrape.location + '"');
    console.log('   ✅ SCRAPE → description: ' + (scrape.description || '').substring(0, 60) + '...');
    console.log('   ✅ SCRAPE → hero_image: ' + (scrape.hero_image || '').substring(0, 60));
    console.log('   ✅ SCRAPE → images: ' + (scrape.images?.length || 0) + ' total images');
    console.log('   ✅ SCRAPE → price: $' + (scrape.price || prop.price_per_night));
    console.log('   ✅ SCRAPE → guests: ' + scrape.guests);
    console.log('   ✅ SCRAPE → bedrooms: ' + scrape.bedrooms);
    console.log('   ✅ SCRAPE → beds: ' + scrape.beds);
    console.log('   ✅ SCRAPE → baths: ' + scrape.baths);
  } else {
    console.log('   ⚠️  No scrape data — used base property fields only');
    console.log('   Base title: "' + (prop.title || prop.name) + '"');
    console.log('   Base location: ' + (prop.location || prop.address));
    console.log('   Base images: ' + (prop.images?.length || 0));
  }
  console.log('   🔒 BASE → brand_color: ' + (prop.brand_color || '#C47756'));
  console.log('   🔒 BASE → font_accent: ' + (prop.font_accent || 'Playfair Display'));
  console.log('   🔒 BASE → Stripe sub: ' + (prop.stripe_subscription_id || '(from profile)'));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});