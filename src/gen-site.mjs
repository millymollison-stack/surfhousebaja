#!/usr/bin/env node
/**
 * generate-property-site.mjs
 * Reads base property data from Supabase, merges with scraped data,
 * generates HTML, saves to src/props/{slug}/index.html
 */

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jtzagpbdrqfifdisxipr.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0emFncGJkcnFmaWZkaXN4aXByIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDczNTI4NSwiZXhwIjoyMDYwMzExMjg1fQ.FjzjJYgN83YtmhwqKsW8kJhvkrqvlkWOzy5T4JxAgjM';

const PROPERTY_ID = 'efa8d280-afee-4971-9145-d591740f484d';

async function fetchPropertyData(propertyId) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: prop, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .single();

  if (error) throw new Error('Failed to load property: ' + error.message);

  const { data: images } = await supabase
    .from('property_images')
    .select('*')
    .eq('property_id', propertyId)
    .order('position');

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id, stripe_subscription_status, stripe_connect_account_id')
    .eq('id', prop.user_id)
    .single();

  return { property: prop, images: images || [], profile: profile || {} };
}

async function fetchScrapedData(userId) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data } = await supabase
    .from('onboarding_data')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data || null;
}

function loadTemplate() {
  const p = '/Users/davidsassistant/.openclaw/workspace/projects/02-surfhousebaja-template/src/public/template/template.html';
  if (!fs.existsSync(p)) throw new Error('Template not found: ' + p);
  return fs.readFileSync(p, 'utf8');
}

function adjustBrightness(hex, percent) {
  if (!hex || !hex.startsWith('#')) return '#888888';
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function generateHtml(template, { base, scrape, websiteName, slug, brandColor, fontAccent }) {
  const title       = scrape?.title       || base?.name       || websiteName || 'My Property';
  const location    = scrape?.location     || base?.location    || '';
  const description = scrape?.description || base?.description || '';
  const price       = scrape?.price ? scrape.price.replace(/[^0-9.]/g, '') : String(base?.price_per_night || 150);
  const hero_image  = scrape?.hero_image  || scrape?.images?.[0] || base?.images?.[0]?.url || '';
  const images      = scrape?.images      || base?.images?.map(i => i.url) || [];
  const guests      = scrape?.guests      || base?.max_guests  || 8;
  const bedrooms    = scrape?.bedrooms    || base?.bedrooms    || 2;
  const beds        = scrape?.beds        || base?.beds        || 3;
  const baths       = scrape?.baths       || base?.baths       || 1;
  const rating      = scrape?.rating     || '4.8';
  const reviews     = scrape?.reviews    || 0;
  const host_name   = scrape?.host_name  || 'Property Manager';
  const reviewPlural = reviews === 1 ? '' : 's';

  const galleryImages = images.slice(1);
  const heroAndGalleryHTML = galleryImages.length > 0
    ? '<img class="p-bg-img" src="' + hero_image + '" alt="Hero">\n    ' + galleryImages.map((img, i) =>
        '<img src="' + img + '" alt="' + title + '" loading="lazy" style="width:100%;border-radius:4px;margin-bottom:8px;display:block;" />'
      ).join('\n    ')
    : '<img class="p-bg-img" src="' + hero_image + '" alt="Hero">';

  const detailsHTML = [
    '<span class="p-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>' + guests + ' Guests</span>',
    '<span class="p-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4v16h20V4H2zM2 8h20M12 12v8"/></svg>' + bedrooms + ' Bedrooms</span>',
    '<span class="p-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l9 6-9 6V6z"/></svg>' + beds + ' Beds</span>',
    '<span class="p-detail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' + baths + ' Baths</span>',
  ].join('');

  const brandCSS = brandColor
    ? ':root { --brand: ' + brandColor + '; }\n  .p-book-btn { background: ' + brandColor + ' !important; }\n  .p-book-btn:hover { background: ' + adjustBrightness(brandColor, -15) + ' !important; }'
    : '';

  const fontLink = (fontAccent && fontAccent !== 'Inter')
    ? '<link href="https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fontAccent) + ':wght@300;400;500;600;700&display=swap" rel="stylesheet">'
    : '';

  const fontFamily = (fontAccent && fontAccent !== 'Inter')
    ? '.p-title, .p-location, .p-price { font-family: "' + fontAccent + '", Inter, sans-serif; }'
    : '';

  let html = template
    .replace('{{BRAND_NAME}}', websiteName || title)
    .replace('{{TITLE}}', title)
    .replace('{{LOCATION}}', location)
    .replace('{{PRICE}}', price)
    .replace('{{DESCRIPTION}}', description)
    .replace('{{HERO_IMAGE}}', hero_image)
    .replace('{{REVIEW_COUNT}}', String(reviews))
    .replace('{{REVIEW_PLURAL}}', reviewPlural)
    .replace('{{DETAILS}}', detailsHTML)
    .replace('</head>', (fontLink ? fontLink + '\n  ' : '') + '<style>\n    ' + brandCSS + '\n    ' + fontFamily + '\n  </style>\n</head>')
    .replace('<img class="p-bg-img" src="{{HERO_IMAGE}}" alt="Hero">', heroAndGalleryHTML);

  const propId = base?.id || slug;
  html = html.replace('class="p-book-btn">Book Now', 'class="p-book-btn" href="https://propbook.pro/pay/' + propId + '">Book Now');

  return html;
}

async function main() {
  const slug = process.argv[2] || 'casablanca1';
  const scrapedArg = process.argv[3];

  console.log('\n🔧 Generating site for: ' + slug + '\n');

  const { property, images, profile } = await fetchPropertyData(PROPERTY_ID);
  console.log('✅ Property loaded: ' + (property.name || property.slug));
  console.log('   Images: ' + images.length);
  console.log('   Brand color: ' + (property.brand_color || '#C47756'));
  console.log('   Font: ' + (property.font_accent || 'Playfair Display'));
  console.log('   Stripe sub status: ' + (profile.stripe_subscription_status || 'none'));
  console.log('   Stripe Connect: ' + (profile.stripe_connect_account_id ? 'linked ✅' : 'not linked ❌'));
  console.log('   Stripe sub ID: ' + (profile.stripe_subscription_id || 'none'));

  let scrapedData = null;
  if (scrapedArg) {
    scrapedData = JSON.parse(scrapedArg);
    console.log('   Scrape (from arg): ' + scrapedData.title);
  } else {
    scrapedData = await fetchScrapedData(property.user_id);
    if (scrapedData) {
      console.log('   Scrape from DB: ' + (scrapedData.title || scrapedData.property_name || '(no title)'));
      console.log('   Scrape images: ' + (scrapedData.images?.length || 0));
    } else {
      console.log('   No scrape data — using base property data only');
    }
  }

  const template = loadTemplate();

  const html = generateHtml(template, {
    base: { ...property, images },
    scrape: scrapedData,
    websiteName: scrapedData?.property_name || property.name || slug,
    slug,
    brandColor: property.brand_color || '#C47756',
    fontAccent: property.font_accent || 'Playfair Display',
  });

  const outDir = '/Users/davidsassistant/.openclaw/workspace/projects/02-surfhousebaja-template/src/props/' + slug;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outDir + '/index.html', html);

  console.log('\n✅ Generated: ' + outDir + '/index.html');
  console.log('   Size: ' + html.length + ' bytes');
  console.log('   Final title: ' + (scrapedData?.title || scrapedData?.property_name || property.name || slug));

  console.log('\n📋 Stripe Info:');
  console.log('   Subscription ID: ' + (profile.stripe_subscription_id || '(none)'));
  console.log('   Subscription status: ' + (profile.stripe_subscription_status || '(none)'));
  console.log('   Connect account ID: ' + (profile.stripe_connect_account_id || '(none)'));
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

// TEMP: Query by email to get David mollison user profile
async function fetchProfileByEmail() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'davidmollison1+D@gmail.com')
    .single();
  return data;
}
