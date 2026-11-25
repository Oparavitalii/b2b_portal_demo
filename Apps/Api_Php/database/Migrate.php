<?php

declare(strict_types=1);

/**
 * Builds the SQLite database at DB_PATH (default storage/katalog.sqlite).
 *   php database/Migrate.php           apply Schema.sql + new Schema_*.sql files
 *   php database/Migrate.php --fresh   delete the database first, then build it
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/Bootstrap.php';

$fresh = in_array('--fresh', array_slice($argv, 1), true);
$path = Db::path();

if ($fresh) {
    Db::reset();
    foreach ([$path, $path . '-wal', $path . '-shm'] as $f) {
        if (is_file($f) && !unlink($f)) {
            fwrite(STDERR, "Cannot delete $f (is the dev server still running?)\n");
            exit(1);
        }
    }
}

try {
    $applied = Schema::apply();
} catch (Throwable $e) {
    fwrite(STDERR, 'Migration failed: ' . $e->getMessage() . "\n");
    exit(1);
}

echo 'Database: ' . $path . "\n";
echo $applied === [] ? "Nothing to apply.\n" : 'Applied: ' . implode(', ', $applied) . "\n";
