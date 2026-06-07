import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// The known source property ID with Airbnb scrape data
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

    const { targetPropertyId } = await req.json();
    if (!targetPropertyId) throw new Error("Missing targetPropertyId");

    console.log(`[migrate-property] Starting migration for user=${user.id}, targetProperty=${targetPropertyId}`);

    // ─── STEP 1: Fetch source property scraped data ─────────────────────────
    const { data: sourceProperty, error: sourceError } = await supabase
      .from("properties")
      .select("*")
      .eq("id", SOURCE_PROPERTY_ID)
      .maybeSingle();

    if (sourceError) throw new Error(`Failed to fetch source property: ${sourceError.message}`);
    if (!sourceProperty) throw new Error(`Source property ${SOURCE_PROPERTY_ID} not found`);

    console.log(`[migrate-property] Source property: ${sourceProperty.title || sourceProperty.property_title}`);

    // ─── STEP 2: Fetch target property ───────────────────────────────────────
    const { data: targetProperty, error: targetError } = await supabase
      .from("properties")
      .select("*")
      .eq("id", targetPropertyId)
      .maybeSingle();

    if (targetError) throw new Error(`Failed to fetch target property: ${targetError.message}`);
    if (!targetProperty) throw new Error(`Target property ${targetPropertyId} not found`);
    if (targetProperty.owner_id !== user.id) throw new Error("Not authorized to migrate to this property");

    console.log(`[migrate-property] Target property: ${targetProperty.title}`);

    // ─── STEP 3: Copy scraped data from source → target property ─────────────
    // Map source fields to target property record
    const scrapedFields: Record<string, any> = {
      // Use property_title as the display title (that's what the UI reads)
      title: sourceProperty.property_title || sourceProperty.title,
      // Use property_intro as the description
      description: sourceProperty.property_intro || sourceProperty.description,
      // Location fields
      location: sourceProperty.address || sourceProperty.location,
      latitude: sourceProperty.latitude,
      longitude: sourceProperty.longitude,
      // Physical specs (source uses bedrooms/bathrooms, target uses beds/baths)
      bedrooms: sourceProperty.bedrooms,
      beds: sourceProperty.beds,
      baths: sourceProperty.bathrooms,
      max_guests: sourceProperty.max_guests,
      // Pricing
      price: sourceProperty.price_per_night ? String(sourceProperty.price_per_night) : sourceProperty.price,
      // Media
      hero_image: sourceProperty.hero_image,
      images: sourceProperty.images || [],
      // Content
      amenities: sourceProperty.amenities,
      property_details: sourceProperty.property_details,
      activities: sourceProperty.activities,
      local_area: sourceProperty.local_area,
      getting_there: sourceProperty.getting_there,
      neighborhood_overview: sourceProperty.neighborhood_overview,
      // NOTE: last_scraped_at column doesn't in the properties table
      // If you add it later, uncomment this line:
      // last_scraped_at: new Date().toISOString(),
    };

    // Remove undefined/null fields so we don't overwrite with nulls
    Object.keys(scrapedFields).forEach(k => {
      if (scrapedFields[k] === undefined || scrapedFields[k] === null) delete scrapedFields[k];
    });

    console.log(`[migrate-property] Copying fields: ${Object.keys(scrapedFields).join(', ')}`);

    const { error: updateError } = await supabase
      .from("properties")
      .update(scrapedFields)
      .eq("id", targetPropertyId);

    if (updateError) throw new Error(`Failed to update target property: ${updateError.message}`);

    // ─── STEP 4: Copy property_images from source → target ─────────────────
    const { data: sourceImages, error: imagesError } = await supabase
      .from("property_images")
      .select("*")
      .eq("property_id", SOURCE_PROPERTY_ID)
      .order("position");

    if (imagesError) {
      console.warn(`[migrate-property] ⚠️ Could not fetch source images: ${imagesError.message}`);
    } else if (sourceImages && sourceImages.length > 0) {
      console.log(`[migrate-property] Copying ${sourceImages.length} images...`);
      
      // Build new image rows for the target property
      const newImageRows = sourceImages.map((img: any) => ({
        property_id: targetPropertyId,
        url: img.url,
        caption: img.caption || null,
        position: img.position || 0,
      }));

      // Delete any existing images for target property
      await supabase
        .from("property_images")
        .delete()
        .eq("property_id", targetPropertyId);

      // Insert new image rows
      const { error: insertError } = await supabase
        .from("property_images")
        .insert(newImageRows);

      if (insertError) {
        console.warn(`[migrate-property] ⚠️ Image insert failed: ${insertError.message}`);
      } else {
        console.log(`[migrate-property] ✅ Copied ${newImageRows.length} images`);
      }
    }

    // ─── STEP 5: Mark source property as migrated ───────────────────────────
    await supabase
      .from("properties")
      .update({ status: "migrated" })
      .eq("id", SOURCE_PROPERTY_ID);

    console.log(`[migrate-property] ✅ Migration complete for property ${targetPropertyId}`);

    return new Response(
      JSON.stringify({
        success: true,
        migrated_from: SOURCE_PROPERTY_ID,
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