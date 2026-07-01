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
const REACT_BUNDLE = "index-CTzHXcen.js?v=10";
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

    // ── Fetch the FULL property row (fresh DB data, not stale sessionStorage) ──
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("*")
      .eq("id", propertyId)
      .maybeSingle();
    if (propError) throw new Error(`Failed to fetch property: ${propError.message}`);
    if (!property) throw new Error("Property not found");
    if (property.owner_id !== user.id) throw new Error("Not authorized");

    // ── Fetch property images (used for {{IMAGE_N}} tokens) ───────────────────
    const { data: propertyImages } = await supabase
      .from("property_images")
      .select("url, position")
      .eq("property_id", propertyId)
      .order("position");

    console.log(`[deploy-site] 🚀 Deploying slug=${slug} property=${propertyId}`);
    console.log(`[deploy-site] Property data: title="${property.title}", images=${propertyImages?.length ?? 0}`);

    // ── Fetch template from GitHub ────────────────────────────────────────────
    console.log("[deploy-site] Fetching template from GitHub...");
    let templateHtml: string;
    let stylesCss: string;
    try {
      const [indexRes, cssRes] = await Promise.all([
        fetch(`${GITHUB_RAW_BASE}/index.html`),
        fetch(`${GITHUB_RAW_BASE}/styles.css`),
      ]);
      if (!indexRes.ok) throw new Error(`index.html not found (${indexRes.status})`);
      if (!cssRes.ok) throw new Error(`styles.css not found (${cssRes.status})`);
      [templateHtml, stylesCss] = await Promise.all([indexRes.text(), cssRes.text()]);
    } catch (fetchErr: any) {
      throw new Error(`Failed to fetch template from GitHub: ${fetchErr.message}`);
    }

    // ── Fetch React bundle from CDN ─────────────────────────────────────────
    let reactAppJs: string;
    try {
      const reactRes = await fetch(`${REACT_CDN_BASE}/${REACT_BUNDLE}`);
      if (!reactRes.ok) {
        throw new Error(`React bundle not found at ${REACT_CDN_BASE}/${REACT_BUNDLE} (${reactRes.status}). ` +
          `Ensure the bundle was uploaded to Hostinger at /scripts/react-assets/assets/`);
      }
      reactAppJs = await reactRes.text();
      console.log(`[deploy-site] React bundle: ${(reactAppJs.length / 1024).toFixed(0)}KB`);
    } catch (fetchErr: any) {
      throw new Error(`Failed to fetch React bundle: ${fetchErr.message}`);
    }

    // ── Build a scrapedData-like object from the DB row ──────────────────────
    // This mirrors generateTemplateHtml in p.ts but runs server-side with fresh DB data.
    const imgList: string[] = propertyImages?.map((img: any) => img.url) || property.images || [];
    const img1 = imgList[0] || property.hero_image || "";
    const img2 = imgList[1] || img1;
    const img3 = imgList[2] || img1;
    const img4 = imgList[3] || img1;
    const img5 = imgList[4] || img1;
    const img6 = imgList[5] || img1;

    const pricePerNight = property.price_per_night != null ? String(property.price_per_night) : "150";
    const rating = property.rating != null ? String(property.rating) : "4.8";
    const reviewCount = property.reviews != null ? String(property.reviews) : "0";
    const title = property.title || slug;
    const address = property.address || "";
    const propertyIntro = property.description || property.property_intro || "";

    // ── Token replacement ────────────────────────────────────────────────────
    const configuredHtml = templateHtml
      .replace(/\{\{SUPABASE_URL\}\}/g, supabaseUrl)
      .replace(/\{\{SUPABASE_ANON_KEY\}\}/g, supabaseKey)
      .replace(/\{\{PROPERTY_SLUG\}\}/g, slug)
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
      .replace(/\{\{GETTING_THERE\}\}/g, property.getting_there || "")
      .replace(/\{\{LOCAL_AREA\}\}/g, property.local_area || "")
      .replace(/\{\{LATITUDE\}\}/g, property.latitude != null ? String(property.latitude) : "")
      .replace(/\{\{LONGITUDE\}\}/g, property.longitude != null ? String(property.longitude) : "")
      .replace(/\{\{BRAND_HANDLE\}\}/g, `@${slug}`)
      .replace(/\{\{CURRENT_URL\}\}/g, `https://www.propbook.pro/props/${slug}`)
      .replace(/\{\{CONTACT_EMAIL\}\}/g, user.email || "hello@propbook.pro");

    console.log(`[deploy-site] HTML generated: ${configuredHtml.length} chars, ${imgList.length} images`);

    // ── Upload to Hostinger via upload.php ────────────────────────────────
    const encode = (str: string) =>
      btoa(new TextEncoder().encode(str).reduce((acc, b) => acc + String.fromCharCode(b), ""));

    console.log("[deploy-site] Uploading to Hostinger...");
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
    if (!uploadData.success) {
      throw new Error(`upload.php error: ${uploadData.error || "unknown"}`);
    }

    const siteUrl = uploadData.siteUrl || `https://www.propbook.pro/props/${slug}`;
    console.log(`[deploy-site] ✅ Files written: ${uploadData.written}`);

    // ── Mark property active in DB ────────────────────────────────────────
    await supabase
      .from("properties")
      .update({ status: "active", site_url: siteUrl })
      .eq("id", propertyId);

    console.log(`[deploy-site] ✅ Deploy complete: ${siteUrl}`);

    return new Response(
      JSON.stringify({ success: true, siteUrl, slug, propertyId, deployed_via: "upload.php" }),
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
