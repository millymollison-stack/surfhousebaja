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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    const { propertyId, slug } = await req.json();
    if (!propertyId || !slug) throw new Error("Missing propertyId or slug");

    // Verify property belongs to user
    const { data: property } = await supabase
      .from("properties")
      .select("id, owner_id, status")
      .eq("id", propertyId)
      .maybeSingle();
    if (!property) throw new Error("Property not found");
    if (property.owner_id !== user.id) throw new Error("Not authorized");

    const DEPLOY_SECRET = "propbook-deploy-2026";
    const RSYNC_DEPLOY_URL = "https://www.propbook.pro/rsync-deploy.php";

    console.log(`[deploy-site] Starting HTTP deploy for slug=${slug} property=${propertyId}`);

    // ─── Call rsync-deploy.php on Hostinger via HTTP ───────────────────────
    const deployFormData = new URLSearchParams({
      secret: DEPLOY_SECRET,
      slug,
      property_id: propertyId,
    });

    let deploySuccess = false;
    let siteUrl = `https://www.propbook.pro/props/${slug}`;

    try {
      const deployRes = await fetch(RSYNC_DEPLOY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: deployFormData.toString(),
      });

      const deployData = await deployRes.json();
      console.log("[deploy-site] rsync-deploy response:", deployRes.status, JSON.stringify(deployData));

      if (!deployRes.ok || !deployData.success) {
        throw new Error(`Deploy failed: ${deployData.error || deployRes.status}`);
      }

      deploySuccess = true;
      siteUrl = deployData.site_url || siteUrl;
      console.log(`[deploy-site] ✅ rsync succeeded: ${siteUrl}`);
    } catch (fetchErr: any) {
      console.error("[deploy-site] ❌ Deploy fetch error:", fetchErr.message);
      throw new Error(`Deploy call failed: ${fetchErr.message}`);
    }

    // ─── Update property status in Supabase ─────────────────────────────────
    console.log("[deploy-site] Updating property status to 'active'...");
    const { error: updateErr } = await supabase
      .from("properties")
      .update({
        status: "active",
        site_url: siteUrl,
      })
      .eq("id", propertyId);

    if (updateErr) {
      console.error("[deploy-site] ⚠️ Property status update failed:", updateErr.message);
      // Don't fail the deploy — rsync worked, status can be fixed manually
    }

    console.log(`[deploy-site] ✅ Deploy complete: ${siteUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        siteUrl,
        slug,
        propertyId,
        deployed_via: "rsync-deploy.php"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[deploy-site] ❌ Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});