<?php

declare(strict_types=1);

/**
 * Fixed-window per-IP limiter stored in the rate_limits table.
 * The (max+1)-th hit inside a window → 429 {error:TOO_MANY_REQUESTS, meta:{retryAfter:windowSec}}
 * (same body as middleware/rate-limit.ts). RATE_LIMIT=off disables it.
 *
 * Buckets: login_failed 20/900, password_reset 5/3600 (Routes/Auth.php); feature
 * routes add their own (e.g. register, resend_verification).
 *
 * Login counts wrong passwords only (owner, 2026-10-12): full() refuses once the bucket
 * is full, hit() is called per failed attempt. A correct login is never counted, so
 * people sharing one office IP do not lock each other out.
 */
final class RateLimit
{
    /** Refuses with the same 429 once the bucket holds $max hits; counts nothing itself. */
    public static function full(Request $req, string $bucket, int $max, int $windowSec): void
    {
        if (strtolower((string) env('RATE_LIMIT', 'on')) === 'off') {
            return;
        }
        $count = (int) Db::val(
            'SELECT count FROM rate_limits WHERE key = :k AND :now - window_start < :win',
            ['k' => $bucket . '|' . ($req->ip() ?? 'anon'), 'now' => time(), 'win' => $windowSec],
        );
        if ($count >= $max) {
            throw new ApiError(429, 'TOO_MANY_REQUESTS', ['retryAfter' => $windowSec]);
        }
    }

    public static function hit(Request $req, string $bucket, int $max, int $windowSec): void
    {
        self::hitKey($bucket . '|' . ($req->ip() ?? 'anon'), $max, $windowSec);
    }

    /** Same as hit() for a caller-chosen key (e.g. 'api_key|<id>': one budget per API key, from any IP). */
    public static function hitKey(string $key, int $max, int $windowSec): void
    {
        if (strtolower((string) env('RATE_LIMIT', 'on')) === 'off') {
            return;
        }
        $now = time();
        $count = (int) Db::val(
            'INSERT INTO rate_limits (key, count, window_start) VALUES (:k, 1, :now)
             ON CONFLICT(key) DO UPDATE SET
               count = CASE WHEN :now - rate_limits.window_start >= :win THEN 1 ELSE rate_limits.count + 1 END,
               window_start = CASE WHEN :now - rate_limits.window_start >= :win THEN :now ELSE rate_limits.window_start END
             RETURNING count',
            ['k' => $key, 'now' => $now, 'win' => $windowSec],
        );
        if ($count > $max) {
            throw new ApiError(429, 'TOO_MANY_REQUESTS', ['retryAfter' => $windowSec]);
        }
    }
}
