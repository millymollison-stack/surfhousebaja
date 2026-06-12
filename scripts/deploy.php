<?php
/**
 * PropBook Deploy Script
 * Copies the pre-built React SPA from root public_html/ to /props/{slug}/
 * and updates site_url in Supabase.
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

// Slug safety check
if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
    api_error('Invalid slug format');
}

$destDir   = PUBLIC_HTML . "/props/{$slug}";
$destIndex = "{$destDir}/index.html";
$siteUrl   = SITE_URL_BASE . "/props/{$slug}";

// ── Step 1: Create destination directory ────────────────────────────────────
$mkdirOut = ssh_exec('mkdir -p ' . escapeshellarg($destDir));
if (!is_dir($destDir)) {
    api_error('Failed to create destination directory', 500);
}

// ── Step 2: Copy React app files from root public_html into /props/{slug}/ ──
// We copy index.html and the entire assets/ directory
// Using PHP's copy() for files, and exec for directories
$rootHtml = PUBLIC_HTML . '/index.html';
$rootAssets = PUBLIC_HTML . '/assets';

// Copy index.html
if (!copy($rootHtml, $destDir . '/index.html')) {
    api_error('Failed to copy index.html', 500);
}

// Copy assets/ directory recursively
$assetsDest = $destDir . '/assets';
ssh_exec('mkdir -p ' . escapeshellarg($assetsDest));
ssh_exec('cp -r ' . escapeshellarg(rtrim(PUBLIC_HTML, '/') . '/assets/* ') . ' ' . escapeshellarg($assetsDest . '/'));

// ── Step 3: Fix permissions ─────────────────────────────────────────────────
ssh_exec('chmod 644 ' . escapeshellarg($destIndex));
ssh_exec('chmod 755 ' . escapeshellarg($destDir));
ssh_exec('chmod -R 755 ' . escapeshellarg($assetsDest));

// ── Step 4: Verify deploy ───────────────────────────────────────────────────
$verify = ssh_exec('test -f ' . escapeshellarg($destIndex) . ' && echo DEPLOYED');
if (trim($verify) !== 'DEPLOYED') {
    api_error('Deploy verification failed: index.html not found', 500);
}

// ── Step 5: Update site_url in Supabase via REST API ────────────────────────
// Use the user's token — RLS checks that the user owns this property
if ($token) {
    $ch = curl_init(SUPABASE_URL . '/rest/v1/properties?id=eq.' . urlencode($propertyId));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => 'PATCH',
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $token,
            'apikey: ' . ANON_KEY,
            'Content-Type: application/json',
            'Prefer: return=minimal',
        ],
        CURLOPT_POSTFIELDS => json_encode(['site_url' => $siteUrl]),
    ]);
    $resp   = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Log if update failed (non-fatal — site is still deployed)
    if ($httpCode >= 300) {
        error_log("PropBook deploy: site_url update failed for {$propertyId} (HTTP {$httpCode}): {$resp}");
    }
}

// ── Done ─────────────────────────────────────────────────────────────────────
echo json_encode([
    'success'    => true,
    'siteUrl'    => $siteUrl,
    'slug'       => $slug,
    'propertyId' => $propertyId,
]);