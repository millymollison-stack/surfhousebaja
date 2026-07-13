<?php
// payment-success.php — captures Stripe session_id and redirects to localhost
// Stripe redirects here after payment: ?session_id=cs_xxx&redirect=http://localhost:5173/?paid

$session_id = isset($_GET['session_id']) ? $_GET['session_id'] : '';
$redirect  = isset($_GET['redirect'])   ? $_GET['redirect']   : 'http://localhost:5173/';

// Store in a short-lived cookie (1 hour)
if ($session_id) {
    setcookie('stripe_session_id', $session_id, time() + 3600, '/', '', true, true);
}

// Redirect to the original localhost URL with the session_id intact
header('Location: ' . $redirect . '&session_id=' . urlencode($session_id));
exit;
