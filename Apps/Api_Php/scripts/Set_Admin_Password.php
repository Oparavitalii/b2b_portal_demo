<?php

declare(strict_types=1);

/**
 * Sets the panel admin's password from .env, for when ADMIN_PASSWORD changed
 * after database/Seed.php already created the account (Seed never updates):
 *   php scripts/Set_Admin_Password.php
 * Without SSH use the flag instead (src/Services/Admin_Password.php).
 * Never prints the password.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/Bootstrap.php';

try {
    echo gmdate('c') . ' ' . AdminPassword::apply() . "\n";
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
