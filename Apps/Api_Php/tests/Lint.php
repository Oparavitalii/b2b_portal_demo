<?php

declare(strict_types=1);

/**
 * php tests/Lint.php — `php -l` on every .php under Apps/Api_Php (storage and
 * the vendored vendor/ excluded) and a ban on debug output (var_dump / print_r / var_export used
 * as output) in src/, public/, database/ and scripts/. Exit 1 on any problem.
 */
$root = str_replace('\\', '/', dirname(__DIR__));
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
$files = [];
foreach ($it as $f) {
    $p = str_replace('\\', '/', $f->getPathname());
    if ($f->isFile() && str_ends_with($p, '.php') && !str_contains($p, '/storage/') && !str_contains($p, '/node_modules/')
        && !str_contains($p, '/vendor/')) {
        $files[] = $p;
    }
}
sort($files, SORT_STRING);

$errors = 0;
foreach ($files as $p) {
    $rel = substr($p, strlen($root) + 1);
    $out = [];
    exec(escapeshellarg(PHP_BINARY) . ' -l ' . escapeshellarg($p) . ' 2>&1', $out, $code);
    if ($code !== 0) {
        $errors++;
        echo "FAIL $rel\n  " . implode("\n  ", $out) . "\n";
        continue;
    }
    $isApp = preg_match('#^(src|public|database|scripts)/#', $rel) === 1;
    if ($isApp && preg_match('/\b(var_dump|print_r)\s*\(/', (string) file_get_contents($p)) === 1) {
        $errors++;
        echo "FAIL $rel\n  debug output (var_dump/print_r) left in application code\n";
        continue;
    }
    echo "ok   $rel\n";
}

echo "\n" . count($files) . " files checked, $errors error(s)\n";
exit($errors === 0 ? 0 : 1);
