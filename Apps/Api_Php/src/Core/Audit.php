<?php

declare(strict_types=1);

/**
 * audit_log writer. Actor = $req->userId unless $actorId is given (auth flows
 * log before a session exists). Never pass raw PII for anonymize flows — use
 * boolean flags (hadEmail, hadPhone). For deletes call this BEFORE removing.
 */
final class Audit
{
    public static function log(Request $req, string $action, string $entityType, ?string $entityId, mixed $old = null, mixed $new = null, ?string $actorId = null): void
    {
        Db::insert('audit_log', [
            'id' => uuid4(),
            'actor_id' => $actorId ?? $req->userId,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'old_value' => self::encode($old),
            'new_value' => self::encode($new),
            'ip' => $req->ip(),
            'user_agent' => $req->userAgent(),
            'created_at' => now_iso(),
        ]);
    }

    private static function encode(mixed $v): ?string
    {
        if ($v === null) {
            return null;
        }
        return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }
}
