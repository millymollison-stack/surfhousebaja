<?php
/**
 * PropBook Static HTML Generator
 * Fetches property data from Supabase, replaces tokens in template.html,
 * writes generated static HTML to /props/{slug}/index.html
 * Also copies React assets for on-demand loading.
 *
 * POST params:
 *   slug        — URL-safe property slug (e.g. "casablanca-2")
 *   propertyId  — Supabase property UUID
 *   token       — Supabase auth access token (verifies user owns the property)
 */

ini_set('display_errors', '0');
error_reporting(0);

header('Content-Type: application/json');

// ── Config ──────────────────────────────────────────────────────────────────
define('SUPABASE_URL',    'https://jtzagpbdrqfifdisxipr.supabase.co');
define('ANON_KEY',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0emFncGJkcnFmaWZkaXN4aXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU0NTkxNTAsImV4cCI6MjA1MTAzNTE1MH0.dymFQpEP0xV_P8xNLz8lMy6I5P7I8ZqQvTv0_2qgrC0');
define('HOSTINGER_USER',  'u805830916');
define('HOSTINGER_HOST',  '82.29.86.252');
define('HOSTINGER_PORT',  '65002');
define('HOSTINGER_PASS',  'Clawbot12!');
define('PUBLIC_HTML',     '/home/u805830916/domains/propbook.pro/public_html');
define('SITE_URL_BASE',   'https://www.propbook.pro');

// ── Helpers ─────────────────────────────────────────────────────────────────
function api_error($msg, $code = 400) {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

function ssh_exec($cmd) {
    $full = sprintf(
        'sshpass -p %s ssh -o StrictHostKeyChecking=no -p %s %s@%s "%s" 2>&1',
        escapeshellarg(HOSTINGER_PASS),
        escapeshellarg(HOSTINGER_PORT),
        escapeshellarg(HOSTINGER_USER),
        escapeshellarg(HOSTINGER_HOST),
        $cmd
    );
    $out  = [];
    $code = 0;
    exec($full, $out, $code);
    return implode("\n", $out);
}

function supabase_get($path, $token) {
    $ch = curl_init(SUPABASE_URL . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $token,
            'apikey: ' . ANON_KEY,
        ],
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['body' => $resp, 'code' => $code];
}

function supabase_patch($path, $token, $data) {
    $ch = curl_init(SUPABASE_URL . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => 'PATCH',
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $token,
            'apikey: ' . ANON_KEY,
            'Content-Type: 'application/json',
            'Prefer: return=minimal',
        ],
        CURLOPT_POSTFIELDS => json_encode($data),
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['body' => $resp, 'code' => $code];
}

// ── Validate request ─────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    api_error('Method not allowed');
}

$slug       = isset($_POST['slug'])       ? trim($_POST['slug'])       : '';
$propertyId = isset($_POST['propertyId']) ? trim($_POST['propertyId']) : '';
$token      = isset($_POST['token'])      ? trim($_POST['token'])      : '';

if (!$slug || !$propertyId) {
    api_error('Missing required fields: slug, propertyId');
}

if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
    api_error('Invalid slug format');
}

// ── Step 1: Validate token ──────────────────────────────────────────────────
$userRes = supabase_get('/auth/v1/user', $token);
if ($userRes['code'] !== 200) {
    api_error('Invalid or expired token', 401);
}
$user = json_decode($userRes['body'], true);
$userId = $user['id'] ?? null;
if (!$userId) {
    api_error('Could not identify user from token', 401);
}

// ── Step 2: Fetch property from Supabase ───────────────────────────────────
$propRes = supabase_get('/rest/v1/properties?id=eq.' . urlencode($propertyId) . '&select=*&limit=1', $token);
if ($propRes['code'] !== 200) {
    api_error('Failed to fetch property: ' . $propRes['body'], 502);
}
$properties = json_decode($propRes['body'], true);
if (!is_array($properties) || count($properties) === 0) {
    api_error('Property not found');
}
$prop = $properties[0];

// Verify ownership
if (($prop['owner_id'] ?? '') !== $userId) {
    api_error('Not authorized to deploy this property', 403);
}

// ── Step 3: Fetch property images ───────────────────────────────────────────
$imgRes = supabase_get(
    '/rest/v1/property_images?property_id=eq.' . urlencode($propertyId) . '&order=position&select=url',
    $token
);
$images = [];
if ($imgRes['code'] === 200) {
    $imgData = json_decode($imgRes['body'], true);
    if (is_array($imgData)) {
        foreach ($imgData as $img) {
            $images[] = $img['url'];
        }
    }
}

// ── Step 4: Read template.html from scripts/ ────────────────────────────────
$templatePath = PUBLIC_HTML . '/scripts/template.html';
if (!file_exists($templatePath)) {
    api_error('template.html not found on server at: ' . $templatePath, 500);
}
$template = file_get_contents($templatePath);

// ── Step 5: Build token replacement map ─────────────────────────────────────
$images = array_values($images); // re-index 0-based

$tokens = [
    '{{TITLE}}'           => $prop['title'] ?? '',
    '{{ADDRESS}}'         => $prop['address'] ?? '',
    '{{PRICE_PER_NIGHT}}' => $prop['price_per_night'] ?? '',
    '{{PROPERTY_TITLE}}'  => $prop['property_title'] ?? $prop['title'] ?? '',
    '{{DESCRIPTION}}'     => $prop['description'] ?? '',
    '{{PROPERTY_INTRO}}'   => $prop['property_intro'] ?? '',
    '{{LATITUDE}}'         => $prop['latitude'] ?? '',
    '{{LONGITUDE}}'       => $prop['longitude'] ?? '',
    '{{BEDROOMS}}'         => $prop['bedrooms'] ?? '',
    '{{BATHS}}'            => ($prop['baths'] ?? $prop['bathrooms'] ?? ''),
    '{{MAX_GUESTS}}'       => $prop['max_guests'] ?? '',
    '{{RATING}}'           => $prop['rating'] ?? '4.8',
    '{{REVIEW_COUNT}}'     => $prop['reviews'] ?? '0',
    '{{BRAND_HANDLE}}'     => $slug,
    '{{CONTACT_EMAIL}}'    => $prop['contact_email'] ?? $user['email'] ?? '',
    '{{CURRENT_URL}}'      => SITE_URL_BASE . '/props/' . $slug,
    '{{GETTING_THERE}}'    => $prop['getting_there'] ?? '',
    '{{LOCAL_AREA}}'       => $prop['local_area'] ?? '',
    // Background images — use static defaults from template folder
    '{{AMENITIES_BG_IMAGE}}' => SITE_URL_BASE . '/template/surfhousebaja-main.jpg',
    '{{REVIEWS_BG_IMAGE}}'   => SITE_URL_BASE . '/template/bubble-room.jpg',
    '{{DROPDOWNS_BG_IMAGE}}' => SITE_URL_BASE . '/template/pexels-louie-alma-2154387078-33197293.jpg',
];

// Image tokens: {{IMAGE_1}} through {{IMAGE_6}}
for ($i = 1; $i <= 6; $i++) {
    $key = '{{IMAGE_' . $i . '}}';
    $tokens[$key] = $images[$i - 1] ?? $images[0] ?? '';
}

// Side images: first two after featured
$tokens['{{IMAGE_SIDE_A}}'] = $images[1] ?? $images[0] ?? '';
$tokens['{{IMAGE_SIDE_B}}'] = $images[2] ?? $images[0] ?? '';

// ── Step 6: Replace all tokens in template ─────────────────────────────────
$html = str_replace(array_keys($tokens), array_values($tokens), $template);

// ── Step 7: Add React bootstrap script (loads React on demand) ──────────────
// Inject a tiny bootstrap that checks URL params and loads React app.js if needed
$reactBootstrap = <<<'SCRIPT'
<script>
(function() {
    var params = new URLSearchParams(window.location.search);
    var mode = params.get('book') === 'true' ? 'booking'
        : params.get('edit') === 'true' ? 'edit'
        : params.get('gallery') === 'true' ? 'gallery'
        : params.get('auth') === 'login' ? 'login'
        : params.get('auth') === 'signup' ? 'signup'
        : null;

    window.__LOAD_REACT__ = function(mode) {
        mode = mode || 'edit';
        sessionStorage.setItem('__REACT_MODE__', mode);
        var script = document.createElement('script');
        script.type = 'module';
        script.src = 'assets/app.js';
        document.head.appendChild(script);
    };

    // Auto-load React if URL has booking/edit/gallery param
    if (mode) {
        window.__LOAD_REACT__(mode);
    }
})();
</script>
SCRIPT;

// Insert before </body>
$html = str_replace('</body>', $reactBootstrap . "\n</body>", $html);

// ── Step 8: Create destination directory ────────────────────────────────────
$destDir   = PUBLIC_HTML . "/props/{$slug}";
$destIndex = "{$destDir}/index.html";
$siteUrl   = SITE_URL_BASE . "/props/{$slug}";

$mkdirOut = ssh_exec('mkdir -p ' . escapeshellarg($destDir));
if (!is_dir($destDir)) {
    api_error('Failed to create destination directory', 500);
}

// ── Step 9: Write generated HTML via SSH ────────────────────────────────────
// Use PHP's copy to a temp file, then sftp, then cleanup
$tmpFile = '/tmp/propbook_' . uniqid() . '.html';
file_put_contents($tmpFile, $html);

$sftpPutCmd = sprintf(
    'sshpass -p %s sftp -o StrictHostKeyChecking=no -P %s %s@%s <<EOF
put %s %s
bye
EOF',
    escapeshellarg(HOSTINGER_PASS),
    escapeshellarg(HOSTINGER_PORT),
    escapeshellarg(HOSTINGER_USER),
    escapeshellarg(HOSTINGER_HOST),
    escapeshellarg($tmpFile),
    escapeshellarg($destIndex)
);
$putOut = [];
exec($sftpPutCmd, $putOut, $putCode);
@unlink($tmpFile);

if ($putCode !== 0) {
    api_error('Failed to write index.html to server', 500);
}

// ── Step 10: Copy React assets from scripts/react-assets/ ─────────────────
$assetsDest = $destDir . '/assets';
ssh_exec('mkdir -p ' . escapeshellarg($assetsDest));
ssh_exec('cp -r ' . escapeshellarg(PUBLIC_HTML . '/scripts/react-assets/') . '/* ' . escapeshellarg($assetsDest . '/') . ' 2>/dev/null; true');

// ── Step 11: Fix permissions ─────────────────────────────────────────────────
ssh_exec('chmod 644 ' . escapeshellarg($destIndex));
ssh_exec('chmod 755 ' . escapeshellarg($destDir));
ssh_exec('chmod -R 755 ' . escapeshellarg($assetsDest));

// ── Step 12: Verify deploy ───────────────────────────────────────────────────
$verify = ssh_exec('test -f ' . escapeshellarg($destIndex) . ' && echo DEPLOYED');
if (trim($verify) !== 'DEPLOYED') {
    api_error('Deploy verification failed: index.html not found', 500);
}

// ── Step 13: Update site_version in Supabase ─────────────────────────────────
$patchRes = supabase_patch(
    '/rest/v1/properties?id=eq.' . urlencode($propertyId),
    $token,
    [
        'site_url'     => $siteUrl,
        'site_version' => date('c'),
        'status'       => 'active',
    ]
);
if ($patchRes['code'] >= 300) {
    error_log("PropBook: site_version update failed for {$propertyId} (HTTP {$patchRes['code']}): {$patchRes['body']}");
}

// ── Done ─────────────────────────────────────────────────────────────────────
echo json_encode([
    'success'    => true,
    'siteUrl'    => $siteUrl,
    'slug'       => $slug,
    'propertyId' => $propertyId,
    'deployed_via' => 'static-html-generator',
]);
