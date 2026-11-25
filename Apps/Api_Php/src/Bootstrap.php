<?php

declare(strict_types=1);

/**
 * Loads the whole backend: src/Core/*.php, then src/Services/*.php, then
 * src/Routes/*.php (each glob sorted). Route files register with Router at
 * include time. Safe to require more than once.
 */
if (defined('API_PHP_BOOTSTRAPPED')) {
    return;
}
define('API_PHP_BOOTSTRAPPED', true);

date_default_timezone_set('UTC');
mb_internal_encoding('UTF-8');

foreach (['Core', 'Services', 'Routes'] as $dir) {
    $files = glob(__DIR__ . '/' . $dir . '/*.php') ?: [];
    sort($files, SORT_STRING);
    foreach ($files as $file) {
        require_once $file;
    }
}
