<?php

declare(strict_types=1);

/**
 * Imports storage/import/Products_Data.json (copied there by `npm run products:sync`)
 * into the products table. Used by scripts/Dev_Start.mjs on a fresh database.
 *
 *   php database/Import_Products.php            default file
 *   php database/Import_Products.php <path>     another Products_Data.json
 *
 * No file → message + exit 0 (nothing to import). Invalid file → exit 1.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/Bootstrap.php';

$file = $argv[1] ?? storage_path('import/Products_Data.json');
if (!is_file($file)) {
    echo "No product file at $file — run `npm run products:sync` first. Nothing imported.\n";
    exit(0);
}

try {
    Schema::apply();
    $json = json_decode((string) file_get_contents($file), true, 64, JSON_THROW_ON_ERROR);
    if (!is_array($json)) {
        throw new RuntimeException('top level is not an object');
    }
    $result = ImportService::import($json);
} catch (ApiError $e) {
    fwrite(STDERR, 'Import failed: ' . $e->errorCode . ' ' . json_encode($e->meta, JSON_UNESCAPED_UNICODE) . "\n");
    exit(1);
} catch (Throwable $e) {
    fwrite(STDERR, 'Import failed: ' . $e->getMessage() . "\n");
    exit(1);
}

echo 'Products imported from ' . $file . "\n";
echo '  created: ' . $result['created'] . "\n";
echo '  updated: ' . $result['updated'] . "\n";
echo '  deactivated: ' . $result['deactivated'] . "\n";
echo '  skipped: ' . count($result['skipped']) . "\n";
foreach ($result['skipped'] as $reason) {
    echo '    - ' . $reason . "\n";
}
