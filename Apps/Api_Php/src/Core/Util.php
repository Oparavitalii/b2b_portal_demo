<?php

declare(strict_types=1);

function uuid4(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    $h = bin2hex($b);
    return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-'
        . substr($h, 16, 4) . '-' . substr($h, 20, 12);
}

/** UTC timestamp 'Y-m-d\TH:i:s.v\Z' (the storage + JSON format), optionally shifted. */
function now_iso(?int $offsetSeconds = 0): string
{
    $now = microtime(true) + (float) ($offsetSeconds ?? 0);
    $sec = (int) floor($now);
    $ms = (int) floor(($now - $sec) * 1000);
    return gmdate('Y-m-d\TH:i:s', $sec) . sprintf('.%03dZ', min($ms, 999));
}

function today_iso(): string
{
    return gmdate('Y-m-d');
}

/** Any parseable date/time string → storage ISO format (UTC), or null. */
function to_iso(?string $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    try {
        $d = new DateTimeImmutable($value, new DateTimeZone('UTC'));
    } catch (Exception) {
        return null;
    }
    return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
}

/** Absolute path inside the storage dir (STORAGE_PATH env, default Apps/Api_Php/storage). */
function storage_path(string $relative = ''): string
{
    $base = env('STORAGE_PATH') ?? dirname(__DIR__, 2) . '/storage';
    $base = rtrim(str_replace('\\', '/', $base), '/');
    if (!is_dir($base)) {
        mkdir($base, 0775, true);
    }
    return $relative === '' ? $base : $base . '/' . ltrim($relative, '/');
}

/** Absolute SPA URL: APP_URL (default http://localhost:5173) + $path ('/reset-hasla/potwierdz?token=...'). */
function app_url(string $path = ''): string
{
    return rtrim((string) env('APP_URL', 'http://localhost:5173'), '/') . $path;
}

final class Row
{
    public const BOOL_COLS = ['active', 'price_on_request'];
    public const JSON_COLS = ['old_value', 'new_value', 'oe_numbers', 'makes', 'engine_codes', 'applications',
        'variants', 'attributes', 'customer_snapshot', 'address_snapshot'];

    public static function camelKey(string $key): string
    {
        return lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $key))));
    }

    /** snake_case row → camelCase; 0/1 → bool for boolean columns; JSON text → decoded. */
    public static function camel(?array $row, array $extraBools = [], array $extraJson = []): ?array
    {
        if ($row === null) {
            return null;
        }
        $bools = array_merge(self::BOOL_COLS, $extraBools);
        $json = array_merge(self::JSON_COLS, $extraJson);
        $out = [];
        foreach ($row as $k => $v) {
            $k = (string) $k;
            if ($v !== null && in_array($k, $bools, true)) {
                $v = (bool) $v;
            } elseif (is_string($v) && in_array($k, $json, true)) {
                $v = json_decode($v, true);
            }
            $out[self::camelKey($k)] = $v;
        }
        return $out;
    }

    public static function camelAll(array $rows, array $extraBools = [], array $extraJson = []): array
    {
        return array_map(static fn(array $r) => self::camel($r, $extraBools, $extraJson), array_values($rows));
    }
}
