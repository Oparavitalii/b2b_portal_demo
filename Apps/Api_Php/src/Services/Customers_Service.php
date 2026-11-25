<?php

declare(strict_types=1);

/**
 * Admin view of customer accounts and their discount (R-02: one global % on the
 * catalogue, applied by Pricing_Service to the product price, never to the kaucja;
 * per-product rules and szablony on top: Discounts_Service.php).
 * Admin accounts are not customers: they are never listed and cannot get a discount.
 */
final class CustomersService
{
    public const LIST_SCHEMA = [
        'q' => ['type' => 'string', 'max' => 200, 'default' => ''],
    ];

    /** Type only; range and 0.5 step are checked in updateDiscount (→ 422 invalid_discount). */
    public const DISCOUNT_SCHEMA = [
        'discountPercent' => ['type' => 'number', 'required' => true],
    ];

    private const COLUMNS = 'id, email, company_name, nip, contact_name, phone, status, discount_percent, blocked_at, created_at, discount_template_id,'
        . ' (SELECT t.name FROM discount_templates t WHERE t.id = users.discount_template_id) AS discount_template_name,'
        . ' (SELECT COUNT(*) FROM discount_rules r WHERE r.user_id = users.id) AS custom_rules_count';

    /** @return list<array{id:string,email:string,companyName:?string,nip:?string,contactName:?string,phone:?string,status:string,discountPercent:float,discountTemplateId:?string,discountTemplateName:?string,customRulesCount:int,blockedAt:?string,createdAt:string}> */
    public static function list(string $q): array
    {
        $sql = 'SELECT ' . self::COLUMNS . " FROM users WHERE role = 'customer'";
        $params = [];
        $q = trim($q);
        if ($q !== '') {
            $sql .= " AND (ulower(email) LIKE :q ESCAPE '\\' OR ulower(ifnull(company_name, '')) LIKE :q ESCAPE '\\'"
                . " OR ulower(ifnull(contact_name, '')) LIKE :q ESCAPE '\\' OR ifnull(nip, '') LIKE :nip ESCAPE '\\')";
            $params = ['q' => Db::like($q), 'nip' => Db::like((string) preg_replace('/\D+/', '', $q) ?: $q)];
        }
        $sql .= ' ORDER BY created_at DESC, email';
        return array_map([self::class, 'present'], Db::all($sql, $params));
    }

    public static function find(string $id): array
    {
        $row = Db::one('SELECT ' . self::COLUMNS . " FROM users WHERE id = ? AND role = 'customer'", [$id]);
        if ($row === null) {
            throw ApiError::notFound('customer');
        }
        return $row;
    }

    /** 0–100 in steps of 0.5; anything else → 422 invalid_discount. Admins / unknown ids → 404. */
    public static function updateDiscount(Request $req, string $id, float|int $discount): array
    {
        $d = (float) $discount;
        if (!is_finite($d) || $d < 0 || $d > 100 || fmod($d * 2, 1.0) !== 0.0) {
            throw new ApiError(422, 'invalid_discount', ['min' => 0, 'max' => 100, 'step' => 0.5]);
        }
        return Db::tx(static function () use ($req, $id, $d): array {
            $before = self::find($id);
            Db::update('users', ['discount_percent' => $d, 'updated_at' => now_iso()], ['id' => $id]);
            Audit::log($req, 'customer_discount', 'user', $id,
                ['discountPercent' => (float) $before['discount_percent']], ['discountPercent' => $d]);
            return self::present(self::find($id));
        });
    }

    /**
     * Blocks (true) or unblocks (false) a customer. A blocked customer cannot log in,
     * and every open session ends at once (Auth::isActive). Idempotent.
     */
    public static function setBlocked(Request $req, string $id, bool $blocked): array
    {
        return Db::tx(static function () use ($req, $id, $blocked): array {
            $before = self::find($id);
            if (($before['blocked_at'] !== null) !== $blocked) {
                Db::update('users', ['blocked_at' => $blocked ? now_iso() : null, 'updated_at' => now_iso()], ['id' => $id]);
                if ($blocked) {
                    Db::exec('DELETE FROM sessions WHERE user_id = ?', [$id]);
                }
                Audit::log($req, $blocked ? 'customer_block' : 'customer_unblock', 'user', $id);
            }
            return self::present(self::find($id));
        });
    }

    /** Deletes a customer account like self-deletion does; orders stay as snapshots. */
    public static function delete(Request $req, string $id): void
    {
        self::find($id);
        AccountService::purge($req, $id, 'customer_delete');
    }

    public static function present(array $row): array
    {
        return [
            'id' => $row['id'],
            'email' => $row['email'],
            'companyName' => $row['company_name'],
            'nip' => $row['nip'],
            'contactName' => $row['contact_name'],
            'phone' => $row['phone'],
            'status' => $row['status'],
            'discountPercent' => (float) $row['discount_percent'],
            // Per-product rabaty (Discounts_Service.php): linked szablon and the number of own rules.
            'discountTemplateId' => $row['discount_template_id'],
            'discountTemplateName' => $row['discount_template_name'],
            'customRulesCount' => (int) $row['custom_rules_count'],
            'blockedAt' => $row['blocked_at'],
            'createdAt' => $row['created_at'],
        ];
    }
}
