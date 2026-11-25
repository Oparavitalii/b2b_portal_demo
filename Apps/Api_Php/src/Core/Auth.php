<?php

declare(strict_types=1);

/** Tokens, sessions, requireAuth / requireRole. Only users with status 'active' authenticate. */
final class Auth
{
    public const ISSUER = 'catalog-portal';
    public const ACCESS_TTL = 900;
    public const REFRESH_TTL = 604800;
    public const REFRESH_COOKIE = 'refresh_token';
    /** The API is served under /api, so the refresh cookie must be scoped to /api/auth. */
    public const REFRESH_COOKIE_PATH = '/api/auth';

    /** Bearer access JWT → live session → active user. Sets userId/role/sessionId/user (DB row). */
    public static function authenticate(Request $req): void
    {
        $header = (string) $req->header('authorization');
        if (preg_match('/^Bearer\s+(.+)$/i', $header, $m) !== 1) {
            throw ApiError::unauthorized();
        }
        $payload = self::verifyAccess(trim($m[1]));
        if ($payload === null) {
            throw ApiError::unauthorized();
        }
        $session = Db::one('SELECT user_id, expires_at FROM sessions WHERE id = ?', [$payload['sid']]);
        if ($session === null || $session['user_id'] !== $payload['sub'] || $session['expires_at'] < now_iso()) {
            throw ApiError::unauthorized();
        }
        $user = Db::one('SELECT * FROM users WHERE id = ?', [$payload['sub']]);
        if ($user === null || !self::isActive($user)) {
            throw ApiError::unauthorized();
        }
        $req->userId = $user['id'];
        $req->role = $user['role'];
        $req->sessionId = $payload['sid'];
        $req->user = $user;
    }

    public static function requireRole(Request $req, array $roles): void
    {
        if ($req->role === null || !in_array($req->role, $roles, true)) {
            throw ApiError::forbidden();
        }
    }

    /** Confirmed e-mail and not blocked by the admin. */
    public static function isActive(array $userRow): bool
    {
        return $userRow['status'] === 'active' && !self::isBlocked($userRow);
    }

    public static function isBlocked(array $userRow): bool
    {
        return ($userRow['blocked_at'] ?? null) !== null;
    }

    /** Public shape of a user (same keys as GET /me). */
    public static function publicUser(array $u): array
    {
        return [
            'id' => $u['id'],
            'email' => $u['email'],
            'role' => $u['role'],
            'companyName' => $u['company_name'],
            'nip' => $u['nip'],
            'contactName' => $u['contact_name'],
            'phone' => $u['phone'],
            'discountPercent' => (float) $u['discount_percent'],
        ];
    }

    public static function hashPassword(string $pw): string
    {
        return password_hash($pw, PASSWORD_BCRYPT, ['cost' => 10]);
    }

    /** New session row + token pair. */
    public static function issueSession(array $userRow, Request $req): array
    {
        $sid = uuid4();
        $refresh = self::signRefresh($userRow['id'], $sid);
        Db::insert('sessions', [
            'id' => $sid,
            'user_id' => $userRow['id'],
            'refresh_token_hash' => hash('sha256', $refresh),
            'expires_at' => now_iso(self::REFRESH_TTL),
            'ip' => $req->ip(),
            'user_agent' => $req->userAgent(),
            'created_at' => now_iso(),
        ]);
        return [
            'accessToken' => self::signAccess($userRow['id'], $userRow['role'], $sid),
            'refreshToken' => $refresh,
            'sessionId' => $sid,
        ];
    }

    /** Sets (token) or clears (null) the refresh cookie: Path=/api/auth, HttpOnly, SameSite=Lax (+Secure in production). */
    public static function refreshCookie(Response $res, ?string $token): Response
    {
        if ($token === null) {
            return $res->withCookie(self::REFRESH_COOKIE, '', ['path' => self::REFRESH_COOKIE_PATH, 'maxAge' => 0]);
        }
        return $res->withCookie(self::REFRESH_COOKIE, $token, [
            'path' => self::REFRESH_COOKIE_PATH,
            'maxAge' => self::REFRESH_TTL,
            'httpOnly' => true,
            'secure' => is_production(),
            'sameSite' => 'Lax',
        ]);
    }

    public static function signAccess(string $userId, string $role, string $sid): string
    {
        $now = time();
        return Jwt::encode(['sub' => $userId, 'role' => $role, 'sid' => $sid, 'iss' => self::ISSUER,
            'iat' => $now, 'exp' => $now + self::ACCESS_TTL], self::accessSecret());
    }

    public static function signRefresh(string $userId, string $sid): string
    {
        $now = time();
        return Jwt::encode(['sub' => $userId, 'sid' => $sid, 'iss' => self::ISSUER,
            'iat' => $now, 'exp' => $now + self::REFRESH_TTL], self::refreshSecret());
    }

    /** Access payload, or null (bad token / wrong issuer / purpose-restricted token). */
    public static function verifyAccess(string $token): ?array
    {
        $p = Jwt::decode($token, self::accessSecret());
        if ($p === null || ($p['iss'] ?? null) !== self::ISSUER || isset($p['purpose'])
            || !is_string($p['sub'] ?? null) || !is_string($p['sid'] ?? null)) {
            return null;
        }
        return $p;
    }

    public static function verifyRefresh(string $token): ?array
    {
        $p = Jwt::decode($token, self::refreshSecret());
        if ($p === null || ($p['iss'] ?? null) !== self::ISSUER
            || !is_string($p['sub'] ?? null) || !is_string($p['sid'] ?? null)) {
            return null;
        }
        return $p;
    }

    public static function accessSecret(): string
    {
        return self::secret('JWT_SECRET', 'dev-access-secret-not-for-production-7f3a9c1e5b2d4086');
    }

    public static function refreshSecret(): string
    {
        return self::secret('JWT_REFRESH_SECRET', 'dev-refresh-secret-not-for-production-2c8e6a0f4d1b9375');
    }

    private static function secret(string $key, string $devFallback): string
    {
        $v = env($key);
        if ($v !== null) {
            return $v;
        }
        if (is_production()) {
            throw new RuntimeException($key . ' must be set in production');
        }
        return $devFallback;
    }
}
