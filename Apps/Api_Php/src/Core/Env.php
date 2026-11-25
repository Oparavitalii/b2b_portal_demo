<?php

declare(strict_types=1);

/**
 * Configuration lookup.
 *
 * Order: real process environment (getenv, so tests and hosting panels can
 * override), then Apps/Api_Php/.env (or the file named by ENV_FILE), then
 * $default. Empty strings count as "not set" so `JWT_SECRET=` in .env falls
 * through to the default.
 */
function env(string $key, ?string $default = null): ?string
{
    static $file = null;
    $fromProcess = getenv($key);
    if ($fromProcess !== false && $fromProcess !== '') {
        return $fromProcess;
    }
    if ($file === null) {
        $file = env_load_file(getenv('ENV_FILE') ?: dirname(__DIR__, 2) . '/.env');
    }
    $value = $file[$key] ?? null;
    return ($value === null || $value === '') ? $default : $value;
}

/** Parses KEY=VALUE lines; strips matching surrounding quotes; ignores # comments. */
function env_load_file(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $out = [];
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }
        [$k, $v] = explode('=', $line, 2);
        $v = trim($v);
        $len = strlen($v);
        if ($len >= 2 && ($v[0] === '"' || $v[0] === "'") && $v[$len - 1] === $v[0]) {
            $v = substr($v, 1, -1);
        }
        $out[trim($k)] = $v;
    }
    return $out;
}

function is_production(): bool
{
    return env('APP_ENV', 'development') === 'production';
}
