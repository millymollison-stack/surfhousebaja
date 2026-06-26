import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SOURCE_PROPERTY_ID = "efa8d280-afee-4971-9145-d591740f484d";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    const { targetPropertyId, onboardingData } = await req.json();
    if (!targetPropertyId) throw new Error("Missing targetPropertyId");

    console.log(`[migrate-property] Starting migration for user=${user.id}, targetProperty=${targetPropertyId}`);

    let scrapedFields: Record<string, any> = {};
    let sourceImages: any[] = [];
    let sourceLabel = '';

    // Use onboarding data if ANY scraped content is present (text OR images).
    // Even partial data (only text, or only images) should be used — missing fields
    // can be edited later. Only fall back to reference property if onboardingData is absent.
    const scrapedImgList = onboardingData?.scraped_images || onboardingData?.images || [];
    const hasRealText = onboardingData?.scraped_title != null ||
                        onboardingData?.scraped_description != null ||
                        onboardingData?.scraped_property_intro != null ||
                        onboardingData?.property_name != null;
    const hasRealImages = scrapedImgList.length >= 1;
    const hasOnboardingData = hasRealText || hasRealImages;

    console.log('[migrate-property] hasOnboardingData:', hasOnboardingData, '{ text:', hasRealText, 'images:', hasRealImages, '(' + scrapedImgList.length + ' total) }');
    console.log('[migrate-property] scraped_title:', onboardingData?.scraped_title);
    console.log('[migrate-property] scraped_description:', onboardingData?.scraped_description);
    console.log('[migrate-property] scraped_images length:', scrapedImgList.length);
    console.log('[migrate-property] scraped_images first 3:', scrapedImgList.slice(0, 3));

    if (hasOnboardingData) {
      const heroImg = onboardingData.scraped_hero_image || onboardingData.hero_image || '';
      const imgList = scrapedImgList;
      console.log('[migrate-property] Using onboarding_data, heroImg:', heroImg, 'imgList length:', imgList.length);
      scrapedFields = {
        title: onboardingData.scraped_title || onboardingData.property_name || '',
        description: onboardingData.scraped_description || onboardingData.property_desc || '',
        property_intro: onboardingData.scraped_property_intro || onboardingData.scraped_description || onboardingData.property_desc || '',
        address: onboardingData.scraped_location || onboardingData.location || null,
        hero_image: heroImg,
        images: imgList,
        max_guests: onboardingData.scraped_guests || null,
        bedrooms: onboardingData.bedrooms || null,
        beds: onboardingData.beds || null,
        baths: onboardingData.baths || onboardingData.bathrooms || null,
      };
      sourceImages = imgList.map((url: string, i: number) => ({ url, position: i }));
      sourceLabel = 'onboarding_data';
    } else {
      // No onboarding data found — fall back to reference property
      console.warn('[migrate-property] ⚠️ No scraped data in onboardingData (text=', hasRealText, 'images=', hasRealImages, '). Falling back to reference property.');
      const { data: sourceProperty, error: sourceError } = await supabase
        .from("properties")
        .select("*")
        .eq("id", SOURCE_PROPERTY_ID)
        .maybeSingle();

      if (sourceError) throw new Error(`Failed to fetch source property: ${sourceError.message}`);
      if (!sourceProperty) throw new Error(`Source property ${SOURCE_PROPERTY_ID} not found`);

      scrapedFields = {
        title: sourceProperty.property_title || sourceProperty.title,
        description: sourceProperty.property_intro || sourceProperty.description,
        address: sourceProperty.address || null,
        latitude: sourceProperty.latitude,
        longitude: sourceProperty.longitude,
        bedrooms: sourceProperty.bedrooms,
        beds: sourceProperty.beds,
        baths: sourceProperty.bathrooms,
        max_guests: sourceProperty.max_guests,
        price_per_night: sourceProperty.price_per_night ?? (sourceProperty.price ? Number(sourceProperty.price) : null),
        hero_image: sourceProperty.hero_image,
        images: sourceProperty.images || [],
        amenities: sourceProperty.amenities,
        property_details: sourceProperty.property_details,
        activities: sourceProperty.activities,
        local_area: sourceProperty.local_area,
        getting_there: sourceProperty.getting_there,
        neighborhood_overview: sourceProperty.neighborhood_overview,
      };
      const { data: imgs } = await supabase
        .from("property_images")
        .select("*")
        .eq("property_id", SOURCE_PROPERTY_ID)
        .order("position");
      sourceImages = imgs || [];
      sourceLabel = `property ${SOURCE_PROPERTY_ID}`;
    }

    const { data: targetProperty, error: targetError } = await supabase
      .from("properties")
      .select("*")
      .eq("id", targetPropertyId)
      .maybeSingle();

    if (targetError) throw new Error(`Failed to fetch target property: ${targetError.message}`);
    if (!targetProperty) throw new Error(`Target property ${targetPropertyId} not found`);
    if (targetProperty.owner_id !== user.id) throw new Error("Not authorized to migrate to this property");

    console.log(`[migrate-property] Target property: ${targetProperty.title}`);

    Object.keys(scrapedFields).forEach(k => {
      if (scrapedFields[k] === undefined || scrapedFields[k] === null) delete scrapedFields[k];
    });

    console.log(`[migrate-property] Copying fields: ${Object.keys(scrapedFields).join(', ')}`);

    const { error: updateError } = await supabase
      .from("properties")
      .update(scrapedFields)
      .eq("id", targetPropertyId);

    if (updateError) throw new Error(`Failed to update target property: ${updateError.message}`);

    if (sourceImages && sourceImages.length > 0) {
      console.log(`[migrate-property] Replacing ${sourceImages.length} images from ${sourceLabel}...`);
      const newImageRows = sourceImages.map((img: any, i: number) => ({
        property_id: targetPropertyId,
        url: img.url,
        caption: img.caption || null,
        position: img.position ?? i,
      }));
      await supabase.from("property_images").delete().eq("property_id", targetPropertyId);
      const { error: insertError } = await supabase.from("property_images").insert(newImageRows);
      if (insertError) {
        console.warn(`[migrate-property] ⚠️ Image insert failed: ${insertError.message}`);
      } else {
        console.log(`[migrate-property] ✅ Copied ${newImageRows.length} images`);
      }
    } else {
      console.log(`[migrate-property] No onboarding images — preserving existing property_images (from save-site-records)`);
    }

    if (!hasOnboardingData) {
      await supabase.from("properties").update({ status: "migrated" }).eq("id", SOURCE_PROPERTY_ID);
    }

    console.log(`[migrate-property] ✅ Migration complete for property ${targetPropertyId}`);

    return new Response(
      JSON.stringify({
        success: true,
        migrated_from: sourceLabel,
        migrated_to: targetPropertyId,
        fields_copied: Object.keys(scrapedFields),
        images_copied: sourceImages?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[migrate-property] ❌ Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
