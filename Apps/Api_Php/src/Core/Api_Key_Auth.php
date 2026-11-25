<?php

declare(strict_types=1);

/**
 * Client API keys for /api/v1 (B-21). `Authorization: Bearer cdm_live_…` → api_keys row
 * (by sha256, not revoked) → active customer. Sets userId/role/user like Auth::authenticate
 * plus Request::$apiKey, so prices use the owner's discount and audit records the actor.
 *
 * Keys and session JWTs share the header, so each side refuses the other: a JWT never
 * starts with the key prefix, and Auth::authenticate cannot decode a key.
 *
 * Every call counts against the key's own budget (LIMIT per WINDOW, any IP) and bumps
 * request_count + last_used_at — no audit_log row per GET (Pilot_Run R-09-a).
 */
final class ApiKeyAuth
{
    public const PREFIX = 'cdm_live_';
    public const LIMIT = 120;
    public const WINDOW = 60;

    public static function authenticate(Request $req): void
    {
        $header = (string) $req->header('authorization');
        if (preg_match('/^Bearer\s+(\S+)$/i', $header, $m) !== 1 || !str_starts_with($m[1], self::PREFIX)) {
            throw self::denied();
        }
        $key = Db::one('SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL', [self::hash($m[1])]);
        if ($key === null) {
            throw self::denied();
        }
        $user = Db::one('SELECT * FROM users WHERE id = ?', [$key['user_id']]);
        if ($user === null || $user['role'] !== 'customer' || !Auth::isActive($user)) {
            throw self::denied();
        }
        RateLimit::hitKey('api_key|' . $key['id'], self::LIMIT, self::WINDOW);
        Db::exec('UPDATE api_keys SET last_used_at = ?, request_count = request_count + 1 WHERE id = ?', [now_iso(), $key['id']]);

        $req->userId = $user['id'];
        $req->role = $user['role'];
        $req->user = $user;
        $req->apiKey = $key;
    }

    /** 401 for the client API, with the standard challenge (site 401s stay without it). */
    private static function denied(): ApiError
    {
        $e = ApiError::unauthorized();
        $e->headers['WWW-Authenticate'] = 'Bearer realm="catalog-api"';
        return $e;
    }

    /** New plain key: prefix + 40 hex chars (160 random bits). */
    public static function generate(): string
    {
        return self::PREFIX . bin2hex(random_bytes(20));
    }

    public static function hash(string $plain): string
    {
        return hash('sha256', $plain);
    }

    /** What the panel shows to recognise a key: 'cdm_live_a1b2…' (prefix + 4 chars). */
    public static function displayPrefix(string $plain): string
    {
        return substr($plain, 0, strlen(self::PREFIX) + 4);
    }
}
