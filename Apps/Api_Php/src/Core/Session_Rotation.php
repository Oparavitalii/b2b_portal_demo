<?php

declare(strict_types=1);

/** Refresh-token rotation with a reuse-detection grace window, and logout. */
final class SessionRotation
{
    private const ROTATION_GRACE = 60;

    /** @return array{accessToken:string,refreshToken:?string} refreshToken null = served from the grace window */
    public static function refresh(Request $req, string $refreshToken): array
    {
        $payload = Auth::verifyRefresh($refreshToken);
        if ($payload === null) {
            throw new ApiError(401, 'INVALID_REFRESH');
        }
        $hash = hash('sha256', $refreshToken);
        $session = Db::one('SELECT * FROM sessions WHERE refresh_token_hash = ?', [$hash]);
        if ($session === null || $session['id'] !== $payload['sid'] || $session['user_id'] !== $payload['sub']) {
            throw new ApiError(401, 'INVALID_REFRESH');
        }

        if ($session['rotated_at'] !== null) {
            $age = time() - (int) strtotime($session['rotated_at']);
            if ($age <= self::ROTATION_GRACE) {
                $replacement = $session['replaced_by_id'] !== null
                    ? Db::one('SELECT * FROM sessions WHERE id = ?', [$session['replaced_by_id']]) : null;
                $user = self::user($session['user_id']);
                if ($replacement !== null && $replacement['rotated_at'] === null && $replacement['expires_at'] > now_iso()
                    && $user !== null && Auth::isActive($user)) {
                    return ['accessToken' => Auth::signAccess($user['id'], $user['role'], $replacement['id']), 'refreshToken' => null];
                }
                throw new ApiError(401, 'INVALID_REFRESH');
            }
            Db::exec('DELETE FROM sessions WHERE id = ?', [$session['id']]);
            if ($session['replaced_by_id'] !== null) {
                Db::exec('DELETE FROM sessions WHERE id = ?', [$session['replaced_by_id']]);
            }
            Audit::log($req, 'session_reuse_detected', 'user', $session['user_id'], null,
                ['sid' => $session['id'], 'tokenHashPrefix' => substr($hash, 0, 8)], $session['user_id']);
            throw new ApiError(401, 'INVALID_REFRESH');
        }

        if ($session['expires_at'] < now_iso()) {
            Db::exec('DELETE FROM sessions WHERE id = ?', [$session['id']]);
            throw new ApiError(401, 'INVALID_REFRESH');
        }
        $user = self::user($session['user_id']);
        if ($user === null || !Auth::isActive($user)) {
            Db::exec('DELETE FROM sessions WHERE id = ?', [$session['id']]);
            throw new ApiError(401, 'INVALID_REFRESH');
        }

        $newSid = uuid4();
        $newRefresh = Auth::signRefresh($user['id'], $newSid);
        Db::tx(static function () use ($session, $user, $newSid, $newRefresh, $req): void {
            Db::insert('sessions', [
                'id' => $newSid,
                'user_id' => $user['id'],
                'refresh_token_hash' => hash('sha256', $newRefresh),
                'expires_at' => now_iso(Auth::REFRESH_TTL),
                'ip' => $req->ip(),
                'user_agent' => $req->userAgent(),
                'created_at' => now_iso(),
            ]);
            Db::update('sessions', ['rotated_at' => now_iso(), 'replaced_by_id' => $newSid], ['id' => $session['id']]);
        });
        return ['accessToken' => Auth::signAccess($user['id'], $user['role'], $newSid), 'refreshToken' => $newRefresh];
    }

    public static function logout(Request $req): void
    {
        Db::exec('DELETE FROM sessions WHERE id = ?', [$req->sessionId]);
        Audit::log($req, 'logout', 'user', $req->userId);
    }

    private static function user(string $id): ?array
    {
        return Db::one('SELECT * FROM users WHERE id = ?', [$id]);
    }
}
