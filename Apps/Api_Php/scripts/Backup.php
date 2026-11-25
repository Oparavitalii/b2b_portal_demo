<?php

declare(strict_types=1);

/**
 * Online SQLite backup (safe while the API runs, WAL included):
 *   php scripts/Backup.php
 * Writes storage/backups/katalog_YYYYmmdd_His.sqlite with VACUUM INTO, keeps
 * the newest 7 copies and prints the path of the new file. Run daily by cron.
 * Also copies new admin-uploaded photos into storage/backups/product_images/.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/Bootstrap.php';

const BACKUP_KEEP = 7;

$source = Db::path();
if (!is_file($source)) {
    fwrite(STDERR, "Database not found: $source\n");
    exit(1);
}

$dir = storage_path('backups');
if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
    fwrite(STDERR, "Cannot create $dir\n");
    exit(1);
}

$target = $dir . '/katalog_' . gmdate('Ymd_His') . '.sqlite';
if (is_file($target)) {
    fwrite(STDERR, "Backup already exists: $target\n");
    exit(1);
}

try {
    Db::exec('VACUUM INTO ?', [$target]);
} catch (Throwable $e) {
    fwrite(STDERR, 'Backup failed: ' . $e->getMessage() . "\n");
    exit(1);
}

$backups = glob($dir . '/katalog_*.sqlite') ?: [];
rsort($backups, SORT_STRING);
foreach (array_slice($backups, BACKUP_KEEP) as $old) {
    if (!unlink($old)) {
        fwrite(STDERR, "Cannot delete old backup $old\n");
    }
}

// Photos uploaded in Admin -> Produkty: copied once into backups/product_images/ (names are unique
// per upload, so a copy never changes; replaced photos stay there as history).
$photos = storage_path('product_images');
$photoBackup = $dir . '/product_images';
if (is_dir($photos)) {
    if (!is_dir($photoBackup)) {
        mkdir($photoBackup, 0775, true);
    }
    foreach (glob($photos . '/*') ?: [] as $file) {
        $copy = $photoBackup . '/' . basename($file);
        if (is_file($file) && !is_file($copy) && !copy($file, $copy)) {
            fwrite(STDERR, "Cannot back up photo $file\n");
        }
    }
}

echo $target . "\n";
