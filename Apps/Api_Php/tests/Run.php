<?php

declare(strict_types=1);

/**
 * php tests/Run.php [filter]
 * Runs every tests/Smoke_*.php (only those whose name contains [filter]) in
 * its own PHP process. Exit 1 when any file fails or nothing matched.
 */
$filter = $argv[1] ?? '';
$files = glob(__DIR__ . '/Smoke_*.php') ?: [];
sort($files, SORT_STRING);
if ($filter !== '') {
    $files = array_values(array_filter($files, static fn(string $f) => str_contains(basename($f, '.php'), $filter)));
}
if ($files === []) {
    fwrite(STDERR, "No smoke files match '$filter'\n");
    exit(1);
}

$failed = [];
foreach ($files as $file) {
    $name = basename($file);
    echo "## $name\n";
    passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($file), $code);
    echo ($code === 0 ? "PASS" : "FAIL (exit $code)") . " $name\n\n";
    if ($code !== 0) {
        $failed[] = $name;
    }
}

echo count($files) - count($failed) . '/' . count($files) . " smoke files passed\n";
exit($failed === [] ? 0 : 1);
