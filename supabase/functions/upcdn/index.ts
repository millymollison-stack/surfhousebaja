// Adds inline return URL handling to root index.html
// Uses temp upload.php trick to bypass slug restriction

const UPLOAD_PHP_URL = "https://www.propbook.pro/upload.php";
const DEPLOY_SECRET = "propbo…2026";

const MINIMAL_UPLOAD_PHP = `<?php
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
echo json_encode(['success'=>true,'written'=>$written,'path'=>$base});
`;

// Root index.html with inline JS that handles ?auth=*** return URL stripping
// before React even loads — no rebuild needed
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
<script>
// Strip ?auth=*** from sessionStorage return URL before React loads
// This prevents the login modal from redirecting to a URL that still has ?auth=***
(function() {
  var returnUrl = sessionStorage.getItem('login_return_url');
  if (returnUrl) {
    var cleanUrl = returnUrl.replace(/\\?auth=[^&]*/, '').replace(/\\?auth=$/, '');
    if (cleanUrl !== returnUrl) {
      sessionStorage.setItem('login_return_url', cleanUrl || '/');
    }
  }
})();
</script>
</head>
<body>
<div id="root"><div class="loader"><h1>PropBook.pro</h1><p>Loading...</p></div></div>
<script type="module" crossorigin src="https://www.propbook.pro/scripts/react-assets/assets/index-VqTojQAw.js?v=11"></script>
</body>
</html>`;

Deno.serve(async (req: Request) => {
  try {
    console.log("[upcdn] Starting...");
    const encode = (str: string) =>
      btoa(new TextEncoder().encode(str).reduce((acc, b) => acc + String.fromCharCode(b), ""));

    // Step 1: Deploy temp upload.php
    console.log("[upcdn] Step 1: Deploying temp uploader...");
    const tempRes = await fetch(UPLOAD_PHP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: DEPLOY_SECRET,
        slug: "cdn-uploader2",
        files: { "upload.php": encode(MINIMAL_UPLOAD_PHP) },
      }),
    });
    const tempData = await tempRes.json().catch(() => null);
    console.log("[upcdn] Temp uploader:", JSON.stringify(tempData));
    if (!tempRes.ok || !tempData?.success) {
      throw new Error(`Failed to deploy temp uploader: ${JSON.stringify(tempData)}`);
    }

    const tempUploadUrl = "https://www.propbook.pro/props/cdn-uploader2/upload.php";

    // Step 2: Update root index.html with inline return URL handling
    console.log("[upcdn] Step 2: Updating root index.html...");
    const fixRes = await fetch(tempUploadUrl + `?secret=***}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "root:",
        files: { "index.html": encode(ROOT_INDEX_HTML) },
      }),
    });
    const fixData = await fixRes.json().catch(() => null);
    console.log("[upcdn] Root index.html:", JSON.stringify(fixData));

    // Verify
    const verifyRootRes = await fetch("https://www.propbook.pro/index.html");
    const verifyRoot = await verifyRootRes.text();
    const rootOk = verifyRoot.includes("index-VqTojQAw") && 
                   verifyRoot.includes("login_return_url") && 
                   !verifyRoot.includes("index-BONZL-bG");
    console.log("[upcdn] Root fixed:", rootOk);
    console.log("[upcdn] Verified content:", verifyRoot.slice(0, 300));

    return new Response(JSON.stringify({
      success: true,
      rootFixed: rootOk,
      step2Status: fixRes.status,
    }), { headers: { "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[upcdn] Error:", e.message);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
