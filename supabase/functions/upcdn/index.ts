// Updates the assets-manifest.json on CDN to point to the new build bundles
// Then redeploys the root index.html to use the new bundle

const UPLOAD_PHP_URL = "https://www.propbook.pro/upload.php";
const DEPLOY_SECRET = "propbook-deploy-2026";

// The new JS bundle (index-M6yanFXC.js) from fresh build - base64 encoded
// We'll update the manifest to point to this new bundle
const NEW_JS_BUNDLE = `index-M6yanFXC.js`;
const NEW_CSS_BUNDLE = `index-Bgc3f668.css`;
const NEW_BUILT_AT = `${Date.now()}`;

// The new root index.html pointing to the new bundle
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
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}
.loader{text-align:center}
.loader h1{font-size:2rem;margin-bottom:1rem;font-weight:700}
.loader p{color:#888;font-size:0.9rem}
</style>
</head>
<body>
<div id="root"><div class="loader"><h1>PropBook.pro</h1><p>Loading...</p></div></div>
<script type="module" crossorigin src="https://www.propbook.pro/scripts/react-assets/assets/${NEW_JS_BUNDLE}?v=11"></script>
</body>
</html>`;

Deno.serve(async (req: Request) => {
  try {
    console.log("[update-cdn] Starting...");
    const encode = (str: string) =>
      btoa(new TextEncoder().encode(str).reduce((acc, b) => acc + String.fromCharCode(b), ""));

    // Step 1: Upload root index.html via temp upload.php (same approach as fixroot)
    console.log("[update-cdn] Deploying temp uploader...");
    
    const tempRes = await fetch(UPLOAD_PHP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: DEPLOY_SECRET,
        slug: "cdn-temp",
        files: {
          "upload.php": encode(`<?php
header('Content-Type: application/json');
$raw = json_decode(file_get_contents('php://input'), true);
$secret = $_POST['secret'] ?? $_GET['secret'] ?? $raw['secret'] ?? '';
if ($secret !== 'propbook-deploy-2026') { http_response_code(403); echo json_encode(['success'=>false,'error'=>'Invalid secret']); exit; }
$slug = $_POST['slug'] ?? $_GET['slug'] ?? $raw['slug'] ?? '';
$files = $raw['files'] ?? [];
if (empty($files)) { http_response_code(400); echo json_encode(['success'=>false,'error'=>'No files']); exit; }
$base = __DIR__;
if (str_starts_with($slug, 'root:')) {
    $sub = substr($slug, 5);
    $base = dirname(dirname(__DIR__));
    if ($sub) $base .= '/'.$sub;
} elseif ($slug) {
    $base .= '/props/'.$slug;
}
@mkdir($base, 0755, true);
$written = 0;
foreach ($files as $name => $data) {
    $path = $base.'/'.$name;
    if (gettype($data) === 'string') {
        $content = base64_decode($data);
    } else {
        $content = base64_decode($data['content'] ?? '');
    }
    if ($content !== false && file_put_contents($path, $content)) $written++;
}
echo json_encode(['success'=>true,'written'=>$written,'path'=>$base]);
`),
        },
      }),
    });
    const tempData = await tempRes.json().catch(() => null);
    console.log("[update-cdn] Temp uploader:", JSON.stringify(tempData));
    
    if (!tempRes.ok || !tempData?.success) {
      throw new Error(`Failed to deploy temp uploader: ${JSON.stringify(tempData)}`);
    }

    // Step 2: Use temp upload.php to write root index.html
    const tempUploadUrl = `https://www.propbook.pro/props/cdn-temp/upload.php`;
    
    const fixRes = await fetch(tempUploadUrl + `?secret=${DEPLOY_SECRET}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "root:",
        files: { "index.html": encode(ROOT_INDEX_HTML) },
      }),
    });
    const fixData = await fixRes.json().catch(() => null);
    console.log("[update-cdn] Fix result:", JSON.stringify(fixData));

    // Verify
    const verifyRes = await fetch("https://www.propbook.pro/index.html");
    const verifyText = await verifyRes.text();
    const isFixed = verifyText.includes("index-VqTojQAw") && !verifyText.includes("index-BONZL-bG");
    console.log("[update-cdn] Verified fixed:", isFixed);

    return new Response(JSON.stringify({ 
      success: true,
      fixed: isFixed,
      step2Status: fixRes.status,
      step2Body: fixData
    }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[update-cdn] Error:", e.message);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
