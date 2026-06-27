import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UPLOAD_PHP_URL = "https://www.propbook.pro/upload.php";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/millymollison-stack/surfhousebaja/main/src/public/template";
const REACT_CDN_BASE = "https://www.propbook.pro/scripts/react-assets/assets";
// Cache-bust: v=2 forces Cloudflare to fetch fresh instead of returning cached HTML error page
const REACT_BUNDLE = "index-DDlHWOjw.js?v=2";
const DEPLOY_SECRET = "propbook-deploy-2026";

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
      .select("id, owner_id, status, site_url")
      .eq("id", propertyId)
      .maybeSingle();
    if (!property) throw new Error("Property not found");
    if (property.owner_id !== user.id) throw new Error("Not authorized");

    console.log(`[deploy-site] 🚀 Starting deploy for slug=${slug} property=${propertyId}`);

    let siteUrl = `https://www.propbook.pro/props/${slug}`;

    // ─── Skip if site already deployed via deployViaUploadPhp ────────────
    // handleSaveSiteInPopup calls deployViaUploadPhp FIRST (uploads correct React
    // index.html + app.js), THEN calls this function. If site_url already exists,
    // the correct React files are already in place — don't overwrite with the old
    // GitHub template.
    if (property.site_url) {
      console.log(`[deploy-site] ⏭️ site_url already exists (${property.site_url}) — skipping template overwrite, only updating status`);
      await supabase
        .from("properties")
        .update({ status: "active" })
        .eq("id", propertyId);
      return new Response(
        JSON.stringify({ success: true, siteUrl: property.site_url, slug, propertyId, deployed_via: "skipped_template_already_deployed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Fetch template files from GitHub raw ─────────────────────────
    console.log("[deploy-site] Fetching template files from GitHub...");
    let indexHtml: string;
    let stylesCss: string;

    try {
      const [indexRes, cssRes] = await Promise.all([
        fetch(`${GITHUB_RAW_BASE}/index.html`),
        fetch(`${GITHUB_RAW_BASE}/styles.css`),
      ]);

      if (!indexRes.ok) throw new Error(`index.html not found (${indexRes.status})`);
      if (!cssRes.ok) throw new Error(`styles.css not found (${cssRes.status})`);

      [indexHtml, stylesCss] = await Promise.all([
        indexRes.text(),
        cssRes.text(),
      ]);
    } catch (fetchErr: any) {
      console.error("[deploy-site] Template fetch error:", fetchErr.message);
      throw new Error(`Failed to fetch template from GitHub: ${fetchErr.message}`);
    }

    // ─── Fetch React bundle from CDN ──────────────────────────────────
    // The GitHub template app.js is plain JS (no React). We need the actual
    // React bundle so the site renders property content instead of 'Loading...'.
    // Cache-bust (?v=2) forces Cloudflare to bypass its cached HTML error page.
    console.log("[deploy-site] Fetching React bundle from CDN...");
    let reactAppJs: string;
    try {
      const reactRes = await fetch(`${REACT_CDN_BASE}/${REACT_BUNDLE}`);
      if (!reactRes.ok) {
        throw new Error(`React bundle not found at ${REACT_CDN_BASE}/${REACT_BUNDLE} (${reactRes.status}). ` +
          `Ensure the bundle was uploaded to Hostinger at /scripts/react-assets/assets/`);
      }
      reactAppJs = await reactRes.text();
      console.log(`[deploy-site] React bundle loaded: ${(reactAppJs.length / 1024).toFixed(0)}KB`);
    } catch (fetchErr: any) {
      console.error("[deploy-site] React bundle fetch error:", fetchErr.message);
      throw new Error(`Failed to fetch React bundle: ${fetchErr.message}`);
    }

    // Inject config into index.html
    const configuredHtml = indexHtml
      .replace("{{SUPABASE_URL}}", supabaseUrl)
      .replace("{{SUPABASE_ANON_KEY}}", supabaseKey)
      .replace("{{PROPERTY_SLUG}}", slug);

    // Encode files as base64
    const encode = (str: string) => btoa(new TextEncoder().encode(str).reduce((acc, b) => acc + String.fromCharCode(b), ""));

    // ─── POST files to upload.php on Hostinger ──────────────────────
    // index.html loads ./app.js — uploading reactAppJs as app.js so React renders
    console.log("[deploy-site] Uploading files to Hostinger via upload.php...");
    const uploadRes = await fetch(UPLOAD_PHP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: DEPLOY_SECRET,
        slug,
        propertyId,
        files: {
          "index.html": encode(configuredHtml),
          "app.js": encode(reactAppJs),
          "styles.css": encode(stylesCss),
        },
      }),
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => uploadRes.statusText);
      throw new Error(`upload.php HTTP ${uploadRes.status}: ${text}`);
    }

    const uploadData = await uploadRes.json();
    console.log("[deploy-site] upload.php response:", JSON.stringify(uploadData));

    if (!uploadData.success) {
      throw new Error(`upload.php error: ${uploadData.error || "unknown"}`);
    }

    siteUrl = uploadData.siteUrl || siteUrl;
    console.log(`[deploy-site] ✅ Files uploaded: ${uploadData.written} files written`);

    // ─── Update property status in Supabase ────────────────────────────
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
      // Don't fail — files were already deployed successfully
    }

    console.log(`[deploy-site] ✅ Deploy complete: ${siteUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        siteUrl,
        slug,
        propertyId,
        deployed_via: "upload.php",
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
