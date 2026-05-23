import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Fixed property ID — the migration copy of Surf House Baja
const MIGRATION_PROPERTY_ID = "03fccab6-a997-4a38-bb7f-4b3e7a6c09a8";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the calling user's JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const {
      title, description, location, price,
      hero_image, images,
      guests, bedrooms, beds, baths,
      rating, reviews, host_name, amenities,
    } = await req.json();

    // ── STEP 1: Update properties table ─────────────────────────────────
    const { error: propertyError } = await supabase
      .from("properties")
      .update({
        title: title || null,
        description: description || null,
        location: location || null,
        price: price || null,
        max_guests: guests ? Number(guests) : null,
        bedrooms: bedrooms ? Number(bedrooms) : null,
        beds: beds ? Number(beds) : null,
        baths: baths ? Number(baths) : null,
        rating: rating ? Number(rating) : null,
        reviews: reviews ? Number(reviews) : null,
        amenities: amenities || [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", MIGRATION_PROPERTY_ID);

    if (propertyError) throw new Error("Failed to update property: " + propertyError.message);

    // ── STEP 2: Replace property_images ─────────────────────────────────
    await supabase.from("property_images").delete().eq("property_id", MIGRATION_PROPERTY_ID);

    if (images && images.length > 0) {
      const imageRecords = images.map((url: string, idx: number) => ({
        property_id: MIGRATION_PROPERTY_ID,
        url,
        position: idx + 1,
        is_featured: idx === 0,
        is_main: idx === 0,
        is_background: false,
        created_at: new Date().toISOString(),
      }));
      const { error: imagesError } = await supabase.from("property_images").insert(imageRecords);
      if (imagesError) throw new Error("Failed to save images: " + imagesError.message);
    }

    // ── STEP 3: Set hero_image ──────────────────────────────────────────
    if (images?.[0] || hero_image) {
      await supabase
        .from("properties")
        .update({ hero_image: images?.[0] || hero_image })
        .eq("id", MIGRATION_PROPERTY_ID);
    }

    return new Response(
      JSON.stringify({
        success: true,
        property_id: MIGRATION_PROPERTY_ID,
        message: "Property migrated to Surf House Baja (Migration)",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[migrate-property]", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});