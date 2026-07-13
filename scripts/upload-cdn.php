<?php
/**
 * upload-cdn.php — Uploads React build assets to the CDN directory
 *
 * GET mode: returns list of current assets (for debugging)
 * POST mode: writes base64-encoded files to /scripts/react-assets/assets/
 *
 * Security: requires valid secret token.
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$SECRET = 'propbook-deploy-2026';
$CDN_DIR = __DIR__ . '/scripts/react-assets/assets';

// GET — list current assets
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $manifest = @file_get_contents($CDN_DIR . '/assets-manifest.json');
    $files = @scandir($CDN_DIR) ?: [];
    $files = array_filter($files, fn($f) => $f !== '.' && $f !== '..');
    echo json_encode([
        'cdnDir' => $CDN_DIR,
        'manifest' => $manifest ? json_decode($manifest, true) : null,
        'files' => array_values($files),
    ]);
    exit;
}

// POST — upload files
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'POST only']);
    exit;
}

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

if (empty($data['secret']) || $data['secret'] !== $SECRET) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Invalid secret']);
    exit;
}

if (!is_dir($CDN_DIR)) {
    mkdir($CDN_DIR, 0755, true);
}

$files = isset($data['files']) ? $data['files'] : [];
$written = 0;
$errors = [];

foreach ($files as $path => $base64Content) {
    if (empty($path) || empty($base64Content)) continue;

    // Sanitize — only allow relative paths, no ..
    $path = ltrim($path, '/');
    if (strpos($path, '..') !== false) {
        $errors[] = "Blocked path traversal: $path";
        continue;
    }

    $fullPath = $CDN_DIR . '/' . $path;
    $dir = dirname($fullPath);

    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $decoded = base64_decode($base64Content, true);
    if ($decoded === false) {
        $errors[] = "Base64 decode failed: $path";
        continue;
    }

    if (@file_put_contents($fullPath, $decoded) === false) {
        $errors[] = "Write failed: $path";
    } else {
        $written++;
    }
}

$result = [
    'success' => $written > 0,
    'written' => $written,
    'cdnDir' => $CDN_DIR,
];

if (!empty($errors)) {
    $result['errors'] = $errors;
}

echo json_encode($result);
