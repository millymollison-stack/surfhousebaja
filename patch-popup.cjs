const fs = require('fs');
let content = fs.readFileSync('src/components/OnboardingPopup.tsx', 'utf8');

const oldText = `  setStripeError('');
  await saveToSupabase();
  setStripeProcessing(true);

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;`;

const newText = `  setStripeError('');
  await saveToSupabase();

  // ── Stage 1 (pre-Stripe): Save scraped data to Supabase migration property.
  //    This guarantees it survives the page unload / Stripe redirect / remount.
  //    On return we fetch it back from Supabase, not from memory.
  if (scrapedData && designChoice === 'airbnb') {
    try {
      const { migrateProperty } = await import('../services/migratePropertyService');
      await migrateProperty({
        title: scrapedData.title || websiteName || '',
        description: scrapedData.description || websiteDesc || '',
        location: scrapedData.location || '',
        price: scrapedData.price || '',
        hero_image: scrapedData.hero_image || '',
        images: scrapedData.images || [],
        guests: scrapedData.guests ?? null,
        bedrooms: scrapedData.bedrooms ?? null,
        beds: scrapedData.beds ?? null,
        baths: scrapedData.baths ?? null,
        rating: scrapedData.rating ?? null,
        reviews: scrapedData.reviews ?? null,
        host_name: scrapedData.host_name ?? null,
        amenities: [],
      });
      console.log('[handlePublish] ✅ Scraped data saved to migration property BEFORE Stripe');
    } catch (migErr) {
      console.warn('[handlePublish] ⚠️ migrateProperty failed, continuing:', migErr);
    }
  }

  setStripeProcessing(true);
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;`;

if (!content.includes(oldText)) {
  console.log('OLD TEXT NOT FOUND');
  process.exit(1);
}
content = content.replace(oldText, newText);
fs.writeFileSync('src/components/OnboardingPopup.tsx', content);
console.log('SUCCESS');