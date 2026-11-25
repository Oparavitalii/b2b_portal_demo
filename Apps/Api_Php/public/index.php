<?php

declare(strict_types=1);

/**
 * Front controller of the API, served under /api on the same origin as the SPA
 * (no CORS). Local: php -S 127.0.0.1:8080 Apps/Api_Php/public/index.php with the
 * Vite proxy forwarding /api → 127.0.0.1:8080. On Apache public/.htaccess
 * rewrites every non-file request here. Request::normalizePath strips '/api'.
 */
if (PHP_SAPI === 'cli-server') {
    $static = __DIR__ . (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if ($static !== __FILE__ && is_file($static)) {
        return false;
    }
}

require dirname(__DIR__) . '/src/Bootstrap.php';

// New database/Schema_*.sql files apply on the first request after a deploy (no SSH on the host).
// Two first requests racing: the loser fails here, logs, and the next request sees it applied.
try {
    Schema::apply();
} catch (Throwable $e) {
    error_log('Schema::apply: ' . $e->getMessage());
}

// A product file pushed by `npm run products:push` is imported on the first request after it lands.
PendingImport::run();
// storage/Reset_Admin.flag pushed by `npm run env:push` applies ADMIN_PASSWORD from .env.
AdminPassword::applyFlag();

$req = Request::fromGlobals();
$res = Router::dispatch($req);

$security = [
    'X-Content-Type-Options' => 'nosniff',
    'X-Frame-Options' => 'DENY',
    'Referrer-Policy' => 'strict-origin-when-cross-origin',
    'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'",
    'Permissions-Policy' => 'geolocation=(), microphone=(), camera=()',
    'Cache-Control' => 'no-store',
];
if (is_production()) {
    $security['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
}
$res->headers = $res->headers + $security;
if ($req->method === 'HEAD') {
    $res->body = '';
}
$res->send();
