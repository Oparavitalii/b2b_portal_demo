<?php

declare(strict_types=1);

/**
 * Client API v1 (B-21): read-only products with the key owner's prices.
 *
 * An item is the site's ProductDetail (ProductsService::detailFromRow, same prices as the
 * catalogue) with what an external system needs on top: an absolute imageUrl, the
 * effective delivery time for one piece (the admin's setting, else 24 h in stock / 72 h
 * production — Packages/Shared availability.ts), `active` and `updatedAt`.
 *
 * Scope: a 'list' key sees only its SKUs and categories; anything else is 404 / absent.
 *
 * updatedSince: products whose updated_at is at or after it, inactive ones included as
 * active:false so the client can drop them. When the owner's discount changed after it
 * (audit_log customer_discount: global %, own rules, szablon link — or an edit of the linked
 * szablon), every active product comes back — prices moved for all — and an item's
 * updatedAt is never older than the owner's last discount change.
 *
 * discountPercent: in the meta the owner's global %; on each item the % of that product
 * (per-product rabaty, Discount_Policy.php).
 */
final class ApiV1Service
{
    public const LIST_SCHEMA = [
        // max: a huge page overflows LIMIT/OFFSET into a 500 (blind check, 2026-10-14).
        'page' => ['type' => 'int', 'min' => 1, 'max' => 1000000, 'default' => 1],
        'pageSize' => ['type' => 'int', 'min' => 1, 'max' => 500, 'default' => 100],
        'updatedSince' => ['type' => 'string', 'max' => 40, 'emptyNull' => true, 'nullable' => true],
    ];

    /** @return array{items:list<array>,total:int,page:int,pageSize:int}+array */
    public static function list(Request $req, mixed $query): array
    {
        $in = V::parse($query, self::LIST_SCHEMA);
        $since = null;
        if (($in['updatedSince'] ?? null) !== null) {
            $since = to_iso($in['updatedSince']);
            if ($since === null) {
                throw ApiError::validation([['validation' => 'datetime', 'code' => 'invalid_string',
                    'message' => 'Invalid datetime', 'path' => ['updatedSince']]]);
            }
        }
        [$scopeSql, $params] = self::scopeClause($req->apiKey ?? []);
        if ($since === null) {
            $where = 'p.active = 1';
        } elseif (($discountAt = self::lastDiscountChange((string) $req->userId)) !== null && $discountAt >= $since) {
            $where = '(p.active = 1 OR p.updated_at >= :since)';
            $params['since'] = $since;
        } else {
            $where = 'p.updated_at >= :since';
            $params['since'] = $since;
        }
        $discount = self::discount($req);
        $discountAt ??= self::lastDiscountChange((string) $req->userId);
        $page = paginate(
            'FROM products p WHERE ' . $where . $scopeSql,
            $params,
            'p.*',
            'p.sku',
            (int) $in['page'],
            (int) $in['pageSize'],
            static fn(array $row) => self::item($row, $discount, $discountAt),
        );
        return $page + self::meta($discount);
    }

    public static function detail(Request $req, string $sku): array
    {
        [$scopeSql, $params] = self::scopeClause($req->apiKey ?? []);
        $row = Db::one('SELECT p.* FROM products p WHERE p.sku = :sku AND p.active = 1' . $scopeSql, $params + ['sku' => $sku]);
        if ($row === null) {
            throw ApiError::notFound('product');
        }
        $discount = self::discount($req);
        return ['item' => self::item($row, $discount, self::lastDiscountChange((string) $req->userId))] + self::meta($discount);
    }

    /** products row → v1 item. */
    public static function item(array $row, DiscountPolicy|float $discount, ?string $discountAt = null): array
    {
        $d = ProductsService::detailFromRow($row, $discount);
        unset($d['productDiscounts'], $d['image']);
        $d['imageUrl'] = $d['imageUrl'] === null ? null : app_url($d['imageUrl']);
        $d['leadTimeHours'] = self::leadTime($row);
        $d['active'] = (int) $row['active'] === 1;
        $updated = (string) ($row['updated_at'] ?? $row['imported_at']);
        $d['updatedAt'] = $discountAt !== null && $discountAt > $updated ? $discountAt : $updated;
        return $d;
    }

    /** Delivery time for one piece: the admin's 24 / 48 / 72, else in stock → 24 h, otherwise 72 h. */
    public static function leadTime(array $row): int
    {
        $set = ProductsService::leadTimeHours($row);
        if ($set !== null) {
            return $set;
        }
        return ProductsService::stock($row) > 0 ? 24 : 72;
    }

    private static function meta(DiscountPolicy $discount): array
    {
        return [
            'discountPercent' => $discount->base,
            'currency' => 'PLN',
            'amountsIn' => 'grosze',
            'vatRate' => PricingService::VAT_RATE,
            'generatedAt' => now_iso(),
        ];
    }

    private static function discount(Request $req): DiscountPolicy
    {
        return DiscountPolicy::forUser($req->user);
    }

    /** @return array{0:string,1:array} ' AND (...)' for a 'list' key, '' for 'all'. */
    private static function scopeClause(array $key): array
    {
        if (($key['scope'] ?? 'all') !== 'list') {
            return ['', []];
        }
        return [
            ' AND (p.sku IN (SELECT value FROM json_each(:scope_skus))'
            . ' OR p.category IN (SELECT value FROM json_each(:scope_categories)))',
            ['scope_skus' => (string) $key['skus'], 'scope_categories' => (string) $key['categories']],
        ];
    }

    /** When the admin last changed this customer's discount (audit_log) or the szablon linked to them, or null. */
    private static function lastDiscountChange(string $userId): ?string
    {
        $at = Db::val(
            "SELECT MAX(created_at) FROM audit_log WHERE action = 'customer_discount' AND entity_type = 'user' AND entity_id = ?",
            [$userId],
        );
        $templateAt = Db::val(
            'SELECT t.updated_at FROM users u JOIN discount_templates t ON t.id = u.discount_template_id WHERE u.id = ?',
            [$userId],
        );
        $times = array_filter([$at, $templateAt], static fn($v): bool => $v !== null);
        return $times === [] ? null : (string) max($times);
    }
}
