// Fixes the root propbook.pro/index.html to load React from CDN instead of missing /assets/
// Run once: supabase functions call fix-root-index

const UPLOAD_PHP_URL = "https://www.propbook.pro/upload.php";
const DEPLOY_SECRET = Deno.env.get("DEPLOY_SECRET") ?? "propbook-deploy-2026";

const ROOT_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PropBook.pro</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.loader { text-align: center; }
.loader h1 { font-size: 2rem; margin-bottom: 1rem; }
.loader p { color: #888; }
</style>
</head>
<body>
<div id="root">
<div class="loader">
<h1>PropBook.pro</h1>
<p>Loading...</p>
</div>
</div>
<script type="module" crossorigin src="https://www.propbook.pro/scripts/react-assets/assets/index-BON-3s3m.js?v=10"></script>
</body>
</html>`;

Deno.serve(async (req: Request) => {
  try {
    console.log("[fix-root-index] Starting...");
    
    // Check current state
    let beforeText = "";
    try {
      const beforeRes = await fetch("https://www.propbook.pro/index.html");
      beforeText = await beforeRes.text();
      console.log("[fix-root-index] Current status:", beforeRes.status, "length:", beforeText.length);
    } catch (e) {
      console.error("[fix-root-index] Fetch error:", e.message);
    }
    
    const hasStaleBundle = beforeText.includes("index-BONZL-bG");
    console.log("[fix-root-index] Has stale bundle:", hasStaleBundle);

    if (!hasStaleBundle) {
      console.log("[fix-root-index] Already fixed or not the expected file.");
      return new Response(JSON.stringify({ success: true, message: "Already fixed", status: 200 }), { headers: { "Content-Type": "application/json" } });
    }

    // Write fixed index.html via upload.php
    console.log("[fix-root-index] Writing fixed index.html via upload.php...");
    
    const encode = (str: string) =>
      btoa(new TextEncoder().encode(str).reduce((acc, b) => acc + String.fromCharCode(b), ""));

    const uploadRes = await fetch(UPLOAD_PHP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: DEPLOY_SECRET,
        slug: "root",
        files: {
          "index.html": encode(ROOT_INDEX_HTML),
        },
      }),
    });

    const uploadData = await uploadRes.json().catch(() => null);
    console.log("[fix-root-index] Upload result:", JSON.stringify(uploadData));

    if (!uploadRes.ok) {
      throw new Error(`upload.php HTTP ${uploadRes.status}: ${JSON.stringify(uploadData)}`);
    }

    if (!uploadData?.success) {
      throw new Error(`upload.php error: ${uploadData?.error || "unknown"}`);
    }

    // Verify
    const afterRes = await fetch("https://www.propbook.pro/index.html");
    const afterText = await afterRes.text();
    const isFixed = afterText.includes("index-BON-3s3m") && !afterText.includes("index-BONZL-bG");
    console.log("[fix-root-index] Verified fixed:", isFixed);

    return new Response(JSON.stringify({ 
      success: true, 
      fixed: isFixed,
      written: uploadData?.written,
      message: isFixed ? "Root index.html fixed!" : "Upload succeeded but verification failed"
    }), { headers: { "Content-Type": "application/json" } });
    
  } catch (e) {
    console.error("[fix-root-index] Error:", e.message);
    return new Response(JSON.stringify({ success: false, error: e.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" } 
    });
  }
});
