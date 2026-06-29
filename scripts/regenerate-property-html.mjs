/**
 * Regenerate and redeploy static HTML for a property slug.
 * Fetches property data from Supabase, renders template, uploads to Hostinger.
 * Run: node scripts/regenerate-property-html.mjs <slug>
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const SB_URL = 'https://jtzagpbdrqfifdisxipr.supabase.co';
const SB_KEY = 'eyJhbG…AgjM';
const supabase = createClient(SB_URL, SB_KEY);

const slug = process.argv[2];
if (!slug) { console.error('Usage: node scripts/regenerate-property-html.mjs <slug>'); process.exit(1); }

const GITHUB_RAW = 'https://raw.githubusercontent.com/millymollison-stack/surfhousebaja/main/src/public/template';
const REACT_BUNDLE = 'index-CTzHXcen.js';
const REACT_CSS = 'index-BwoOEFWc.css';

async function main() {
  // 1. Fetch property from DB
  const { data: prop, error } = await supabase
    .from('properties')
    .select('*, property_images(*)')
    .eq('slug', slug)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !prop) { console.error('Property not found:', slug); process.exit(1); }
  console.log(`Found property: ${prop.id} — title="${prop.title}" slug="${prop.slug}"`);
  console.log('  hero_image:', prop.hero_image);
  console.log('  images count:', prop.images?.length || 0);
  console.log('  property_images count:', prop.property_images?.length || 0);

  // 2. Load template from GitHub
  const templateRes = await fetch(`${GITHUB_RAW}/template.html`);
  if (!templateRes.ok) { console.error('Failed to fetch template'); process.exit(1); }
  const templateHtml = await templateRes.text();
  console.log(`Template loaded: ${templateHtml.length} chars`);

  // 3. Build scrapedData from property record
  const dbImages = prop.images && prop.images.length > 0
    ? prop.images
    : (prop.property_images || []).map((img) => img.url);

  const scrapedData = {
    title: prop.title || slug,
    location: prop.address || '',
    description: prop.description || prop.property_intro || prop.property_details || '',
    hero_image: prop.hero_image || '',
    images: dbImages,
    guests: prop.max_guests || null,
    bedrooms: prop.bedrooms || null,
    beds: prop.beds || null,
    baths: prop.bathrooms || prop.baths || null,
    rating: prop.rating || null,
    reviews: prop.reviews || null,
    host_name: null,
    price: prop.price_per_night ? String(prop.price_per_night) : '150',
  };

  console.log('  scrapedData.title:', scrapedData.title);
  console.log('  scrapedData.images[0]:', scrapedData.images[0]);

  // 4. Generate HTML with token replacements
  const img1 = scrapedData.images?.[0] || scrapedData.hero_image || '';
  const img2 = scrapedData.images?.[1] || img1;
  const img3 = scrapedData.images?.[2] || img1;
  const img4 = scrapedData.images?.[3] || img1;
  const img5 = scrapedData.images?.[4] || img1;
  const img6 = scrapedData.images?.[5] || img1;
  const pricePerNight = scrapedData.price ? scrapedData.price.replace(/[^0-9.]/g, '') : '150';
  const rating = scrapedData.rating?.toString() || '4.8';
  const reviewCount = String(scrapedData.reviews ?? 0);
  const title = scrapedData.title || slug;
  const address = scrapedData.location || '';
  const propertyIntro = scrapedData.description || '';

  let indexHtml = templateHtml
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
    .replace(/\{\{AMENITIES_BG_IMAGE\}\}/g, img1)
    .replace(/\{\{REVIEWS_BG_IMAGE\}\}/g, img2 || img1)
    .replace(/\{\{DROPDOWNS_BG_IMAGE\}\}/g, img3 || img1)
    .replace(/\{\{GETTING_THERE\}\}/g, prop.getting_there || '')
    .replace(/\{\{LOCAL_AREA\}\}/g, prop.local_area || '')
    .replace(/\{\{CONTACT_EMAIL\}\}/g, prop.contact_email || 'hello@propbook.pro')
    .replace(/\{\{CURRENT_URL\}\}/g, `https://www.propbook.pro/props/${slug}`)
    .replace(/\{\{BRAND_HANDLE\}\}/g, '@' + slug)
    .replace(/\{\{LATITUDE\}\}/g, prop.latitude || '')
    .replace(/\{\{LONGITUDE\}\}/g, prop.longitude || '')
    .replace(/\{\{SUPABASE_URL\}\}/g, SB_URL)
    .replace(/\{\{SUPABASE_ANON_KEY\}\}/g, SB_KEY)
    // Fix old bundle references
    .replace(/index-CL6DNYFW\.js\?v=\d+/g, `${REACT_BUNDLE}?v=10`)
    .replace('./assets/index-BwoOEFWc.css', `https://www.propbook.pro/scripts/react-assets/assets/${REACT_CSS}`);

  // Replace APP_JS marker with correct bundle loader
  const appJsBlock = `<script>
(function() {
  var params = new URLSearchParams(window.location.search);
  if (params.has('book')) {
    sessionStorage.setItem('scroll_to_booking', '1');
    window.history.replaceState({}, '', window.location.pathname);
  }
  if (params.has('paid') && params.has('session_id')) {
    sessionStorage.setItem('stripe_session_id', params.get('session_id'));
    sessionStorage.setItem('stripe_paid_flag', 'true');
    window.history.replaceState({}, '', window.location.pathname);
  }
})();
</script>
<script type="module" crossorigin src="https://www.propbook.pro/scripts/react-assets/assets/${REACT_BUNDLE}?v=10"></script>`;

  if (indexHtml.includes('<!--APP_JS-->')) {
    indexHtml = indexHtml.replace('<!--APP_JS-->', appJsBlock);
  } else {
    // Replace any old app.js reference
    indexHtml = indexHtml.replace(/<script[^>]*app\.js[^>]*><\/script>/gi, appJsBlock);
  }

  console.log(`Generated HTML: ${indexHtml.length} chars`);

  // 5. Write to temp file and upload via SCP
  const tmpPath = `/tmp/${slug}-index.html`;
  writeFileSync(tmpPath, indexHtml);

  const remotePath = `/home/u805830916/domains/propbook.pro/public_html/props/${slug}/index.html`;
  const scpCmd = `sshpass -p 'Clawbot12!' scp -o StrictHostKeyChecking=no -P 65002 "${tmpPath}" "u805830916@82.29.86.252:${remotePath}"`;

  console.log('Uploading to Hostinger...');
  try {
    execSync(scpCmd, { stdio: 'inherit' });
    console.log(`✅ Deployed: https://www.propbook.pro/props/${slug}/`);
  } catch (e) {
    console.error('SCP upload failed');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
