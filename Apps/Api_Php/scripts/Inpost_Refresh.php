<?php

declare(strict_types=1);

/**
 * Status refresh of every non-final InPost shipment (B-22, R-07):
 *   php scripts/Inpost_Refresh.php
 * Run by cron (private hosting notes). Prints one summary line; exit 1 when
 * InPost is not configured or any shipment could not be refreshed.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/Bootstrap.php';

Schema::apply();

if (!InpostClient::configured()) {
    fwrite(STDERR, gmdate('c') . " InPost not configured (INPOST_API_TOKEN / INPOST_ORG_ID)\n");
    exit(1);
}

$r = ShipmentsService::refreshAll();
echo gmdate('c') . " checked {$r['checked']}, changed {$r['changed']}, failed {$r['failed']}\n";
exit($r['failed'] === 0 ? 0 : 1);
