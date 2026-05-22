import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = (req.headers.get("Authorization") || "").trim();
    const receivedToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const expectedToken = supabaseKey.trim();

    if (receivedToken !== expectedToken) {
      console.error("[save-site-records] Auth mismatch.",
        "Received token starts with:", receivedToken.slice(0, 15),
        "Expected token starts with:", expectedToken.slice(0, 15));
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: "Invalid auth" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new Error("Invalid JSON body");
    }

    const { title, slug, description, location, maxGuests, bedrooms, beds, baths,
            pricePerNight, heroImage, images, stripeAccountId, stripeAccountStatus,
            userId } = body;

    console.log("[save-site-records] Inserting property:", title, slug);

    const { data: propertyRecord, error: propertyError } = await supabase
      .from("properties")
      .insert({
        title: title || "Untitled Property",
        slug,
        description: description || "",
        address: location || "",
        max_guests: maxGuests || 8,
        bedrooms: bedrooms || 2,
        bathrooms: bedrooms || 2,
        beds: beds || 3,
        baths: baths || 1,
        price_per_night: pricePerNight || 150,
        hero_image: heroImage || "",
        images: images || [],
        stripe_account_id: stripeAccountId || null,
        stripe_account_status: stripeAccountStatus || null,
      })
      .select("id, slug")
      .single();

    if (propertyError) {
      console.error("[save-site-records] propertyError:", propertyError);
      throw new Error(`Property insert failed: ${propertyError.message}`);
    }

    console.log("[save-site-records] Property created:", propertyRecord.id);

    // Also upsert onboarding_data so Home.tsx doesn't get duplicate-key errors on re-import
    const { error: onboardingError } = await supabase
      .from("onboarding_data")
      .upsert(
        {
          user_id: userId || null,
          property_name: title || "Untitled Property",
          property_desc: description || "",
          slug,
          hero_image: heroImage || "",
          images: images || [],
          bedrooms: bedrooms ? String(bedrooms) : null,
          beds: beds ? String(beds) : null,
          baths: baths ? String(baths) : null,
          guests: maxGuests ? String(maxGuests) : null,
          price: pricePerNight ? String(pricePerNight) : null,
          property_id: propertyRecord.id,
        },
        { onConflict: "slug" }
      );

    if (onboardingError) {
      console.warn("[save-site-records] onboarding_data upsert warning:", onboardingError.message);
      // Non-fatal — property was created successfully
    }

    console.log("[save-site-records] Success! propertyId:", propertyRecord.id);

    return new Response(
      JSON.stringify({
        propertyId: propertyRecord.id,
        siteUrl: `https://propbook.pro/props/${propertyRecord.slug}`,
        slug: propertyRecord.slug,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("save-site-records error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});