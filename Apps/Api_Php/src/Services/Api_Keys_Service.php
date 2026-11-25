<?php

declare(strict_types=1);

/**
 * Client API keys (B-21): created by the customer (Moje konto) or by the admin for a
 * customer; both paths share this service. The plain key leaves the server once, in the
 * create response — only sha256 + a display prefix are stored. At most MAX_ACTIVE
 * unrevoked keys per customer. Create and revoke are audited.
 */
final class ApiKeysService
{
    public const MAX_ACTIVE = 5;

    public const CREATE_SCHEMA = [
        'name' => ['type' => 'string', 'required' => true, 'min' => 1, 'max' => 60],
        'scope' => ['type' => 'enum', 'values' => ['all', 'list'], 'default' => 'all'],
        'skus' => ['type' => 'array', 'max' => 2000, 'default' => [], 'items' => ['type' => 'string', 'min' => 1, 'max' => 100]],
        'categories' => ['type' => 'array', 'max' => 100, 'default' => [], 'items' => ['type' => 'string', 'min' => 1, 'max' => 100]],
    ];

    /** @return array{items:list<array>} newest first, revoked ones included (marked). */
    public static function list(string $userId): array
    {
        $rows = Db::all('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC', [$userId]);
        return ['items' => array_map([self::class, 'present'], $rows)];
    }

    /** @return array{key:string, apiKey:array} the only response that carries the plain key. */
    public static function create(Request $req, string $userId, mixed $body, string $createdBy): array
    {
        $in = V::parse($body, self::CREATE_SCHEMA);
        $skus = self::unique($in['skus']);
        $categories = self::unique($in['categories']);
        if ($in['scope'] === 'all') {
            $skus = [];
            $categories = [];
        } elseif ($skus === [] && $categories === []) {
            throw new ApiError(422, 'api_key_scope_empty');
        }
        $skus = self::catalogueSkus($skus);
        return Db::tx(static function () use ($req, $userId, $in, $skus, $categories, $createdBy): array {
            $active = (int) Db::val('SELECT COUNT(*) FROM api_keys WHERE user_id = ? AND revoked_at IS NULL', [$userId]);
            if ($active >= self::MAX_ACTIVE) {
                throw new ApiError(409, 'api_key_limit', ['max' => self::MAX_ACTIVE]);
            }
            $plain = ApiKeyAuth::generate();
            $id = uuid4();
            Db::insert('api_keys', [
                'id' => $id,
                'user_id' => $userId,
                'name' => $in['name'],
                'prefix' => ApiKeyAuth::displayPrefix($plain),
                'key_hash' => ApiKeyAuth::hash($plain),
                'scope' => $in['scope'],
                'skus' => json_encode($skus, JSON_UNESCAPED_UNICODE),
                'categories' => json_encode($categories, JSON_UNESCAPED_UNICODE),
                'created_by' => $createdBy,
                'created_at' => now_iso(),
            ]);
            $row = self::find($userId, $id);
            Audit::log($req, 'api_key_create', 'api_key', $id, null, [
                'userId' => $userId, 'name' => $in['name'], 'scope' => $in['scope'],
                'skus' => count($skus), 'categories' => count($categories), 'createdBy' => $createdBy,
            ]);
            return ['key' => $plain, 'apiKey' => self::present($row)];
        });
    }

    /** Revokes a key of this customer (404 for anyone else's). Idempotent. */
    public static function revoke(Request $req, string $userId, string $keyId): array
    {
        $row = self::find($userId, $keyId);
        if ($row['revoked_at'] === null) {
            Db::update('api_keys', ['revoked_at' => now_iso()], ['id' => $keyId]);
            Audit::log($req, 'api_key_revoke', 'api_key', $keyId, null, ['userId' => $userId]);
            $row = self::find($userId, $keyId);
        }
        return ['apiKey' => self::present($row)];
    }

    public static function present(array $row): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'prefix' => $row['prefix'],
            'scope' => $row['scope'],
            'skus' => array_values(json_decode((string) $row['skus'], true) ?: []),
            'categories' => array_values(json_decode((string) $row['categories'], true) ?: []),
            'createdBy' => $row['created_by'],
            'createdAt' => $row['created_at'],
            'lastUsedAt' => $row['last_used_at'],
            'requestCount' => (int) $row['request_count'],
            'revokedAt' => $row['revoked_at'],
        ];
    }

    private static function find(string $userId, string $keyId): array
    {
        $row = Db::one('SELECT * FROM api_keys WHERE id = ? AND user_id = ?', [$keyId, $userId]);
        if ($row === null) {
            throw ApiError::notFound('api_key');
        }
        return $row;
    }

    /**
     * SKUs as the catalogue spells them (case-insensitive match), so 'r00002d' stores 'R00002D'.
     * Any SKU not in the catalogue → 422 api_key_unknown_skus {skus} (blind check, 2026-10-14).
     *
     * @param list<string> $skus
     * @return list<string>
     */
    private static function catalogueSkus(array $skus): array
    {
        $out = [];
        $unknown = [];
        foreach ($skus as $sku) {
            $real = Db::val('SELECT sku FROM products WHERE sku = ? COLLATE NOCASE', [$sku]);
            if ($real === null) {
                $unknown[] = $sku;
            } elseif (!in_array((string) $real, $out, true)) {
                $out[] = (string) $real;
            }
        }
        if ($unknown !== []) {
            throw new ApiError(422, 'api_key_unknown_skus', ['skus' => array_slice($unknown, 0, 50)]);
        }
        return $out;
    }

    /** @param list<string> $values trimmed, empty dropped, duplicates removed, order kept. */
    private static function unique(array $values): array
    {
        $out = [];
        foreach ($values as $v) {
            $v = trim((string) $v);
            if ($v !== '' && !in_array($v, $out, true)) {
                $out[] = $v;
            }
        }
        return $out;
    }
}
