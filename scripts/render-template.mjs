/**
 * render-template.mjs
 *
 * Reads the server-rendered HTML template, fetches property data from Supabase,
 * replaces all {{PLACEHOLDER}} tokens with real data, and outputs a complete
 * static HTML page ready to be pushed to Hostinger.
 *
 * Usage:
 *   node scripts/render-template.mjs --slug=surfhousebaja-preview
 *   node scripts/render-template.mjs --property-id=efa8d280-...
 *
 * Output: writes rendered HTML to stdout (pipe to file or SFTP upload)
 */

import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ── Helpers ────────────────────────────────────────────────────────

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

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
  } catch {
    return [];
  }
}

async function fetchPropertyImages(propertyId, supabaseUrl, anonKey) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/property_images?property_id=eq.${propertyId}&select=url,position&order=position&limit=30`,
    {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
    }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
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
    'pool': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12c.6.5 1.2 1 2.5 1C7 13 7 11 9.5 11s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 17c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2M2 7c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2"/></svg>',
    'kitchen': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 11h18M3 11v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M3 11l2-9h14l2 9M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    'ac': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"/><circle cx="12" cy="12" r="4"/></svg>',
    'washer': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="6"/><path d="M3 12h18"/></svg>',
    'tv': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="15" rx="2"/><path d="M7 19h10M12 15v4"/></svg>',
    'parking': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>',
    'gym': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.5 6.5h11M6.5 17.5h11M3 12h3M18 12h3M6.5 6.5v11M17.5 6.5v11"/></svg>',
    'hot tub': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 16c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z"/><path d="M12 6v2M8 9h8M12 2v1M2 12h1M22 12h-1M4.22 4.22l.71.71M19.07 4.22l-.71.71M4.22 19.78l.71-.71M19.07 19.78l-.71-.71"/></svg>',
    'beach': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-3-3.87M3 21h18M9 9a3 3 0 1 1 6 0M9 9l-5 5"/><circle cx="12" cy="7" r="4"/></svg>',
    'surfboards': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l4 20-4-1-4 1 4-20z"/></svg>',
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

function buildImageGallery(property, dbImageUrls) {
  // Prefer DB images (from property_images table), fall back to hero_image + images JSON column
  const hero = dbImageUrls[0] || property.hero_image || '';
  const allImages = dbImageUrls.length > 0 ? dbImageUrls : [hero, ...parseImages(property.images)].filter(Boolean);
  const total = allImages.length;

  if (total === 0) return { galleryHtml: '', heroFallback: '' };

  // Build thumbnails
  let thumbsHtml = '';
  allImages.forEach((src, i) => {
    thumbsHtml += `
      <div class="thumb-item ${i === 0 ? 'active' : ''}" data-index="${i}">
        <img src="${escapeHtml(src)}" alt="Photo ${i + 1}" loading="lazy"/>
      </div>`;
  });

  // Build hero images (all stacked, CSS shows only active)
  let heroSlidesHtml = '';
  allImages.forEach((src, i) => {
    heroSlidesHtml += `
      <div class="hero-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
        <img src="${escapeHtml(src)}" alt="${escapeHtml(property.title || 'Property')}"/>
      </div>`;
  });

  const galleryHtml = `
    <div class="gallery-container" id="gallery">
      <div class="hero-section">
        <div class="hero-slides" id="heroSlides">
          ${heroSlidesHtml}
        </div>
        <button class="gallery-arrow arrow-prev" id="prevBtn" aria-label="Previous photo">&#10094;</button>
        <button class="gallery-arrow arrow-next" id="nextBtn" aria-label="Next photo">&#10095;</button>
        <div class="image-counter" id="imageCounter">1 / ${total}</div>
      </div>
      <div class="thumbnail-strip" id="thumbnailStrip">
        ${thumbsHtml}
      </div>
    </div>`;

  return { galleryHtml, heroFallback: allImages[0] || '' };
}

// ── Token replacement ─────────────────────────────────────────────

function replaceToken(template, token, value) {
  const regex = new RegExp(`\\{\\{${token}\\}\\}`, 'g');
  return template.replace(regex, value !== undefined && value !== null ? String(value) : '');
}

function renderTemplate(template, property, propertyImages) {
  const p = property;
  const slug = p.slug || 'property';

  // propertyImages: array from property_images table [{url, position}, ...]
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
  // Prefer property_images table, fall back to hero_image + images JSON column
  const allImages = dbImageUrls.length > 0
    ? dbImageUrls
    : [heroImage, ...parseImages(p.images)].filter(Boolean);

  // Build image gallery
  const { galleryHtml } = buildImageGallery(p, dbImageUrls);

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

  // Individual images (IMAGE_1, IMAGE_2, etc.)
  for (let i = 1; i <= 20; i++) {
    html = replaceToken(html, `IMAGE_${i}`, allImages[i - 1] || '');
  }

  // Background images for sections (use images[1] and images[2] if available)
  html = replaceToken(html, 'AMENITIES_BG_IMAGE', allImages[1] || allImages[0] || '');
  html = replaceToken(html, 'REVIEWS_BG_IMAGE', allImages[2] || allImages[0] || '');
  html = replaceToken(html, 'DROPDOWNS_BG_IMAGE', allImages[3] || allImages[0] || '');

  // Star rating HTML
  html = replaceToken(html, 'STAR_RATING_HTML', renderStars(rating));

  // Amenities HTML
  html = replaceToken(html, 'AMENITIES_HTML', renderAmenities(amenities));

  // Gallery HTML
  html = replaceToken(html, 'IMAGE_GALLERY_HTML', galleryHtml);

  // Hero image (first image as fallback)
  html = replaceToken(html, 'HERO_IMAGE', heroImage || allImages[0] || '');

  // SEO
  const metaDesc = description.slice(0, 160).replace(/\n/g, ' ').trim() || `${title} — beautiful vacation rental in ${address}`;
  html = replaceToken(html, 'META_DESCRIPTION', metaDesc);

  // Handle pluralization tokens: {{#BEDROOMS_plural}}s{{/BEDROOMS_plural}} → 's' if plural
  const numReplacements = [];
  const bedroomMatch = String(bedrooms).match(/^(\d+)/);
  const bedsMatch = String(beds).match(/^(\d+)/);
  const bathsMatch = String(baths).match(/^(\d+)/);
  const guestsMatch = String(maxGuests).match(/^(\d+)/);
  const bedroomCount = bedroomMatch ? parseInt(bedroomMatch[1]) : 0;
  const bedsCount = bedsMatch ? parseInt(bedsMatch[1]) : 0;
  const bathsCount = bathsMatch ? parseInt(bathsMatch[1]) : 0;
  const guestsCount = guestsMatch ? parseInt(guestsMatch[1]) : 0;

  // Replace {{#BEDROOMS_plural}}s{{/BEDROOMS_plural}} with 's' if > 1, else ''
  html = html.replace(/\{\{#BEDROOMS_plural\}\}(s)\{\{\/BEDROOMS_plural\}\}/gi, bedroomCount !== 1 ? '$1' : '');
  html = html.replace(/\{\{#BEDS_plural\}\}(s)\{\{\/BEDS_plural\}\}/gi, bedsCount !== 1 ? '$1' : '');
  html = html.replace(/\{\{#BATHROOMS_plural\}\}(s)\{\{\/BATHROOMS_plural\}\}/gi, bathsCount !== 1 ? '$1' : '');
  html = html.replace(/\{\{#MAX_GUESTS_plural\}\}(s)\{\{\/MAX_GUESTS_plural\}\}/gi, guestsCount !== 1 ? '$1' : '');

  // Clean up any remaining Handlebars block tokens (case-insensitive)
  html = html.replace(/\{\{#[A-Za-z_][A-Za-z0-9_]*\}\}\s*/gi, '');
  html = html.replace(/\{\{\/[A-Za-z_][A-Za-z0-9_]*\}\}\s*/gi, '');
  // Handle {{.}} in Handlebars each blocks (replace with empty)
  html = html.replace(/\{\{\.\}\}\s*/g, '');
  // Clean up any remaining {{UNUSED}} tokens — replace with empty string
  html = html.replace(/\{\{[A-Za-z_][A-Za-z0-9_]*\}\}\s*/gi, '');

  return html;
}

// ── Supabase fetch ─────────────────────────────────────────────────

async function fetchPropertyBySlug(slug, supabaseUrl, anonKey) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/properties?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`,
    {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch property: ${res.status}`);
  const data = await res.json();
  return data?.[0] || null;
}

async function fetchPropertyById(id, supabaseUrl, anonKey) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/properties?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch property: ${res.status}`);
  const data = await res.json();
  return data?.[0] || null;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let slug = null;
  let propertyId = null;

  for (const arg of args) {
    if (arg.startsWith('--slug=')) slug = arg.slice(7);
    else if (arg.startsWith('--property-id=')) propertyId = arg.slice(14);
    else if (arg.startsWith('--output=')) {} // ignore, we write to stdout
  }

  if (!slug && !propertyId) {
    console.error('Usage: node render-template.mjs --slug=my-property [--output=file.html]');
    process.exit(1);
  }

  // Load env
  const envPath = join(PROJECT_ROOT, '.env');
  let supabaseUrl = 'https://jtzagpbdrqfifdisxipr.supabase.co';
  let anonKey = '';

  try {
    const envContent = readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const [key, val] = line.split('=');
      if (key === 'VITE_SUPABASE_URL') supabaseUrl = val.trim();
      if (key === 'VITE_SUPABASE_ANON_KEY') anonKey = val.trim();
    }
  } catch { /* use defaults */ }

  console.error(`Fetching property (slug=${slug || propertyId})...`);

  const property = slug
    ? await fetchPropertyBySlug(slug, supabaseUrl, anonKey)
    : await fetchPropertyById(propertyId, supabaseUrl, anonKey);

  if (!property) {
    console.error(`Property not found: ${slug || propertyId}`);
    process.exit(1);
  }

  console.error(`Got: "${property.title}" (${property.slug})`);

  // Fetch property images from property_images table
  let propertyImages = [];
  if (property.id) {
    try {
      propertyImages = await fetchPropertyImages(property.id, supabaseUrl, anonKey);
      console.error(`Got ${propertyImages.length} images from property_images table`);
    } catch(e) {
      console.error(`Warning: could not fetch property images: ${e.message}`);
    }
  }

  // Load template
  const templatePath = join(PROJECT_ROOT, 'src', 'public', 'template', 'template.html');
  const template = readFileSync(templatePath, 'utf8');
  console.error(`Template loaded: ${template.length} bytes`);

  // Render
  const rendered = renderTemplate(template, property, propertyImages);
  console.error(`Rendered HTML: ${rendered.length} bytes`);

  // Output to stdout
  process.stdout.write(rendered);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});