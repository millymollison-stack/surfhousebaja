// Standalone test: simulate what Home.tsx loadProperty() does
// Run: node test-property-load.js

const SUPABASE_URL = 'https://jtzagpbdrqfifdisxipr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0emFncGJkcnFmaWZkaXN4aXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ3MzUyODUsImV4cCI6MjA2MDMxMTI4NX0.uWqc82Hb-qnRq4H9kg5IPykUosm9VvU2s6e8mOalkR0';

// A27 user auth id
const USER_ID = '61a73e59-a899-4553-b620-e7826faf782f';
const SURF_HOUSE_BAJA_ID = 'efa8d280-afee-4971-9145-d591740f484d';

async function test() {
  console.log('=== TEST: Property load simulation ===\n');

  // Step 1: Fetch user's property by owner_id
  console.log('Step 1: Finding property for owner_id:', USER_ID);
  const propRes = await fetch(`${SUPABASE_URL}/rest/v1/properties?owner_id=eq.${USER_ID}&select=id,title,images,hero_image,bedrooms,beds,bathrooms,max_guests`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    }
  });
  const props = await propRes.json();
  console.log('Properties found:', props.length);
  if (props.length > 0) {
    console.log('  ID:', props[0].id);
    console.log('  Title:', props[0].title);
    console.log('  Images count:', props[0].images?.length || 0);
    console.log('  First 3 images:', props[0].images?.slice(0, 3));
    console.log('  bedrooms:', props[0].bedrooms, '| beds:', props[0].beds, '| bathrooms:', props[0].bathrooms, '| max_guests:', props[0].max_guests);
  } else {
    console.log('  No property found for user, checking template:', SURF_HOUSE_BAJA_ID);
    const templateRes = await fetch(`${SUPABASE_URL}/rest/v1/properties?id=eq.${SURF_HOUSE_BAJA_ID}&select=id,title,images`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    });
    const template = await templateRes.json();
    console.log('  Template property:', template[0]?.id, template[0]?.title);
    console.log('  Template images:', template[0]?.images?.length);
  }

  // Step 2: Check property_images table for same property
  console.log('\nStep 2: property_images table for user property');
  const imgRes = await fetch(`${SUPABASE_URL}/rest/v1/property_images?property_id=eq.${props[0]?.id || SURF_HOUSE_BAJA_ID}&select=id,url,position`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    }
  });
  const imgs = await imgRes.json();
  console.log('property_images rows:', imgs.length);
  if (imgs.length > 0) {
    console.log('  First 3:', imgs.slice(0, 3).map(i => i.url));
  }

  // Step 3: What Home.tsx would display after fix
  console.log('\nStep 3: What Home.tsx would display (image list)');
  let displayImages = [];
  if (props[0]?.images && props[0].images.length > 0) {
    displayImages = props[0].images.map((url, i) => ({ id: `img-${i}`, url, position: i }));
    console.log('  ✅ Using properties.images array:', displayImages.length, 'images');
  } else if (imgs.length > 0) {
    displayImages = imgs;
    console.log('  ⚠️  Using property_images table:', displayImages.length, 'images');
  } else {
    console.log('  ❌ No images found anywhere');
  }

  console.log('\n=== RESULT ===');
  if (displayImages.length > 0) {
    console.log('SUCCESS: Would display', displayImages.length, 'images');
    console.log('First image URL:', displayImages[0].url);
  } else {
    console.log('FAIL: No images to display');
  }
}

test().catch(console.error);
