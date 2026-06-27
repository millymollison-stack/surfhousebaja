<?php
/**
 * upload.php — Browser-based deploy receiver
 * 
 * Accepts JSON with base64-encoded files and writes them to props/{slug}/
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

$slug = isset($data['slug']) ? preg_replace('/[^a-z0-9\-_]/', '', strtolower($data['slug'])) : '';
if (!$slug) {
    echo json_encode(['success' => false, 'error' => 'Missing slug']);
    exit;
}

$propertyId = isset($data['propertyId']) ? preg_replace('/[^a-z0-9\-]/', '', $data['propertyId']) : '';

// Determine base directory — props is inside public_html, same level as upload.php
$baseDir = __DIR__ . '/props/' . $slug;

// Security: reject any path that tries to escape the props directory (path traversal)
$realBase = realpath($baseDir) !== false ? realpath($baseDir) : $baseDir;
$realProps = realpath(__DIR__ . '/props');
if ($realBase !== $realProps . '/' . $slug && !str_starts_with($realBase, $realProps . '/')) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Invalid slug path: ' . $slug]);
    exit;
}

// Create directory if not exists
if (!is_dir($baseDir)) {
    if (!mkdir($baseDir, 0755, true)) {
        echo json_encode(['success' => false, 'error' => 'Could not create directory: ' . $baseDir]);
        exit;
    }
}

$files = isset($data['files']) ? $data['files'] : [];
$written = 0;
$errors = [];

foreach ($files as $path => $base64Content) {
    if (empty($path) || empty($base64Content)) continue;
    
    // Sanitize path — no absolute paths, no ../
    $path = ltrim($path, '/');
    if (strpos($path, '..') !== false) {
        $errors[] = "Blocked path traversal: $path";
        continue;
    }
    
    $fullPath = $baseDir . '/' . $path;
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

$siteUrl = 'https://www.propbook.pro/props/' . $slug . '/';

$result = [
    'success' => $written > 0,
    'siteUrl' => $siteUrl,
    'written' => $written,
    'slug' => $slug,
];

if (!empty($errors)) {
    $result['errors'] = $errors;
}

echo json_encode($result);
