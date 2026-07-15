<?php
/**
 * upload.php — Browser-based deploy receiver
 *
 * Supports two modes:
 *  1. Property deploy: writes to /props/{slug}/  (for per-property static sites)
 *  2. Root deploy:    writes to the parent of the scripts/ directory
 *                      (for the main React app's index.html and assets)
 *
 * Called by deployService.ts in the browser.
 *
 * Security: requires valid secret token.
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'POST only']);
    exit;
}

$SECRET = 'propbook-deploy-2026';

// Read JSON body
$input = file_get_contents('php://input');
if (!$input) {
    echo json_encode(['success' => false, 'error' => 'No input']);
    exit;
}

$data = json_decode($input, true);
if (!$data) {
    echo json_encode(['success' => false, 'error' => 'Invalid JSON: ' . json_last_error_msg()]);
    exit;
}

// Verify secret
if (empty($data['secret']) || $data['secret'] !== $SECRET) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Invalid secret']);
    exit;
}

$files = isset($data['files']) ? $data['files'] : [];

// ── ROOT MODE: write to public_html/ (parent of scripts/) ──────────────────────
// Files prefixed with "root:" are written to public_html/
$scriptsDir = __DIR__;
$rootDir    = dirname($scriptsDir);           // one level up from scripts/ = public_html/
$rootDir    = realpath($rootDir) ?: $rootDir;

$slug = isset($data['slug']) ? preg_replace('/[^a-z0-9\-_]/', '', strtolower($data['slug'])) : '';

// Determine base directory for property mode
$baseDir = $slug ? $scriptsDir . '/props/' . $slug : null;

// ── Validation: require slug for property mode, but allow root-only writes ────────
$allRoot = true;
foreach (array_keys($files) as $f) {
    if (!str_starts_with($f, 'root:')) { $allRoot = false; break; }
}
if (!$slug && !$allRoot) {
    echo json_encode(['success' => false, 'error' => 'Missing slug']);
    exit;
}

$written = 0;
$errors  = [];

foreach ($files as $path => $base64Content) {
    if (empty($path) || empty($base64Content)) continue;

    // Root mode paths start with "root:" — write to public_html/
    if (str_starts_with($path, 'root:')) {
        $destPath = ltrim(substr($path, 5), '/');
        $destBase = $rootDir;
    } elseif ($baseDir) {
        $destPath = ltrim($path, '/');
        $destBase = $baseDir;
    } else {
        $errors[] = "No slug provided for non-root path: $path";
        continue;
    }

    // Block path traversal
    $destPath = str_replace('..', '', $destPath);
    $destPath = ltrim($destPath, '/');

    $fullPath = $destBase . '/' . $destPath;
    $dir      = dirname($fullPath);

    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }

    $decoded = base64_decode($base64Content, true);
    if ($decoded === false) {
        $errors[] = "Base64 decode failed: $path";
        continue;
    }

    if (@file_put_contents($fullPath, $decoded) === false) {
        $errors[] = "Write failed: $path -> $fullPath";
    } else {
        $written++;
    }
}

$siteUrl = $slug
    ? 'https://www.propbook.pro/props/' . $slug . '/'
    : 'https://www.propbook.pro/';

$result = [
    'success' => $written > 0,
    'siteUrl' => $siteUrl,
    'written' => $written,
    'slug'    => $slug ?: 'root',
    'rootDir' => $rootDir,
];

if (!empty($errors)) {
    $result['errors'] = $errors;
}

echo json_encode($result);
