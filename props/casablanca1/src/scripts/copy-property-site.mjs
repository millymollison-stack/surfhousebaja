#!/usr/bin/env node
/**
 * copy-property-site.mjs
 * Copies the built dist to a self-contained property folder.
 * Fetches property data from Supabase at copy time and embeds it
 * so the copied site doesn't need runtime Supabase calls.
 *
 * Usage:
 *   node src/scripts/copy-property-site.mjs [slug] [port]
 *   e.g.: node src/scripts/copy-property-site.mjs casablanca1 8200
 *
 * Run from project root: /Users/davidsassistant/.openclaw/workspace/projects/02-surfhousebaja-template
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// script is at src/scripts/, prjRoot = project-root (two levels up)
const prjRoot = path.join(__dirname, '..', '..');

const SLUG = process.argv[2] || 'casablanca1';
const PORT = process.argv[3] || '8200';
const SUPABASE_URL = 'https://jtzagpbdrqfifdisxipr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0emFncGJkcnFmaWZkaXN4aXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3MzUyODUsImV4cCI6MjA2MDMxMTI4NX0.uWqc82Hb-qnRq4H9kg5IPykUosm9VvU2s6e8mOalkR0';

const distDir = path.join(prjRoot, 'dist');
const targetDir = path.join(prjRoot, 'props', SLUG);

console.log('\n📦 Fetching property "' + SLUG + '" from Supabase…\n');

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { data: property, error } = await supabase
  .from('properties')
  .select('*')
  .eq('slug', SLUG.toLowerCase())
  .limit(1)
  .single();

if (error || !property) {
  console.error('❌ Property not found:', error?.message);
  process.exit(1);
}

console.log('✅ Found:', property.title || property.name);

// Amenities list for matching scraped amenities to known types
const AMENITIES = [
  'Wifi', 'Kitchen', 'Air conditioning', 'Washer', 'Free parking',
  'Pool', 'Hot tub', 'Gym', 'Beach access', 'BBQ grill',
  'Fire pit', 'Outdoor shower', 'EV charger', 'Beach towels',
  'Board games', 'Books', 'Smart TV', 'Coffee machine',
  'High chair', 'Pack \'n play', 'ski-in/ski-out', 'Fireplace',
  'Workspace', 'Luggage transfer', 'Airport transfer', 'Personal concierge',
];

// Merge scraped amenities with property amenities
const scrapedData = property.scraped_data || {};
const scrapedAmenities = scrapedData.amenities || [];
const propertyAmenities = (property.amenities && property.amenities.length > 0)
  ? property.amenities
  : AMENITIES.filter(a =>
      scrapedAmenities.some(sa =>
        sa.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(sa.toLowerCase())
      )
    );

const propertyData = {
  id: property.id,
  slug: property.slug,
  title: property.title || property.name || 'Untitled Property',
  description: property.description || scrapedData.description || '',
  price: property.price_per_night || scrapedData.price || 150,
  currency: property.currency_symbol || '$',
  bedrooms: property.bedrooms || scrapedData.bedrooms || 1,
  bathrooms: property.baths || scrapedData.baths || 1,
  beds: property.beds || scrapedData.beds || 1,
  maxGuests: property.max_guests || scrapedData.max_guests || 2,
  heroImage: property.hero_image || scrapedData.hero_image || '',
  images: property.images && property.images.length > 0
    ? property.images
    : scrapedData.images || [],
  amenities: propertyAmenities,
  address: property.address || scrapedData.address || '',
  latitude: property.latitude || scrapedData.latitude || null,
  longitude: property.longitude || scrapedData.longitude || null,
  brandColor: property.brand_color || '#C47756',
  fontAccent: property.font_accent || 'Playfair Display',
  status: property.status,
};

// Dynamically discover hashed asset filenames from dist/assets/
function getDistAssets() {
  const assetsDir = path.join(distDir, 'assets');
  if (!fs.existsSync(assetsDir)) return {};
  const files = fs.readdirSync(assetsDir);
  const assets = {};
  for (const f of files) {
    if (f.startsWith('index-') && f.endsWith('.js')) assets.mainJs = f;
    else if (f.startsWith('index-') && f.endsWith('.css')) assets.mainCss = f;
    else if (f.endsWith('.js')) { assets.miscJs = assets.miscJs || []; assets.miscJs.push(f); }
    else if (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp')) assets.placeholder = f;
  }
  return assets;
}

console.log('\n🗑️  Cleaning target directory…');
fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.mkdirSync(path.join(targetDir, 'assets'), { recursive: true });

const assets = getDistAssets();
console.log('📁 Discovered assets:', JSON.stringify(assets));

// Copy and patch entry files
const entries = ['index.html', 'onboarding-overlay.html', 'template.html'];
for (const f of entries) {
  const src = path.join(distDir, f);
  if (fs.existsSync(src)) {
    let content = fs.readFileSync(src, 'utf8');
    // For index.html: inject property data replacing only the placeholder string value
    // The placeholder appears twice: window.__PROPERTY_DATA__ (var name) + '__PROPERTY_DATA__' (string value)
    // We target only the string value assignment to avoid breaking the variable name
    if (f === 'index.html') {
      const dataStr = JSON.stringify(propertyData);
      // Replace the entire <script>window.__PROPERTY_DATA__ = '__PROPERTY_DATA__';</script>
      // block with the actual JSON embedded as a JS object literal
      // Use <\/script> (escaped forward slash) to prevent HTML parser from
      // prematurely closing the script tag when </script> appears inside the JSON string
      content = content.replace(
        "<script>window.__PROPERTY_DATA__ = '__PROPERTY_DATA__';\x3c/script>",
        "<script>window.__PROPERTY_DATA__ = " + dataStr + ";<\/script>"
      );
    }
    fs.writeFileSync(path.join(targetDir, f), content);
    console.log('  ✅ ' + f);
  } else {
    console.log('  ⚠️  Missing: ' + f);
  }
}

// Copy assets
const assetsToCopy = [assets.mainJs, assets.mainCss, assets.placeholder, ...(assets.miscJs || [])].filter(Boolean);
for (const f of assetsToCopy) {
  const src = path.join(distDir, 'assets', f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(targetDir, 'assets', f));
    console.log('  ✅ assets/' + f);
  }
}

// Write property JSON for debugging
fs.writeFileSync(path.join(targetDir, 'property-data.json'), JSON.stringify(propertyData, null, 2));

// Calculate total
let total = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else total += fs.statSync(p).size;
  }
};
walk(targetDir);

console.log('\n' + '═'.repeat(50));
console.log('✅ Total: ' + (total / 1024).toFixed(0) + 'KB in ' + targetDir);
console.log('\n🚀 Serve with:');
console.log('   cd ' + targetDir + ' && python3 -m http.server ' + PORT + ' --directory .');
console.log('   → http://localhost:' + PORT + '/props/' + SLUG);
console.log('═'.repeat(50) + '\n');