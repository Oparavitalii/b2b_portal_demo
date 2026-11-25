<?php

declare(strict_types=1);

/**
 * Per-product rabaty and szablony rabatów in the admin panel (Pilot_Run 2026-10-16).
 *
 * A rule = {type: 'category'|'product', target: category name | SKU, percent}. A szablon is a
 * named set of rules; a customer links to at most one szablon (live) and can have their own
 * rules on top. Pricing reads them through DiscountPolicy. Every change that moves a
 * customer's prices writes audit 'customer_discount' for that customer (Api_V1_Service uses it
 * for updatedSince); a szablon edit bumps discount_templates.updated_at instead.
 */
final class DiscountsService
{
    public const MAX_RULES = 1000;
    public const RULE_TYPES = ['category', 'product'];

    private const RULE = ['type' => 'object', 'schema' => [
        'type' => ['type' => 'enum', 'values' => self::RULE_TYPES, 'required' => true],
        'target' => ['type' => 'string', 'required' => true, 'min' => 1, 'max' => 100],
        'percent' => ['type' => 'number', 'required' => true],
    ]];

    public const TEMPLATE_SCHEMA = [
        'name' => ['type' => 'string', 'required' => true, 'min' => 1, 'max' => 80],
        'rules' => ['type' => 'array', 'required' => true, 'max' => self::MAX_RULES, 'items' => self::RULE],
    ];

    public const CUSTOMER_SCHEMA = [
        'templateId' => ['type' => 'uuid', 'nullable' => true, 'required' => true],
        'rules' => ['type' => 'array', 'required' => true, 'max' => self::MAX_RULES, 'items' => self::RULE],
    ];

    /** @return list<array{id:string,name:string,rules:list<array>,customersCount:int,createdAt:string,updatedAt:string}> */
    public static function listTemplates(): array
    {
        $rows = Db::all(
            'SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.discount_template_id = t.id) AS customers_count
             FROM discount_templates t ORDER BY t.name COLLATE NOCASE',
        );
        return array_map([self::class, 'presentTemplate'], $rows);
    }

    public static function createTemplate(Request $req, mixed $body): array
    {
        $in = V::parse($body, self::TEMPLATE_SCHEMA);
        $rules = self::validateRules($in['rules']);
        return Db::tx(static function () use ($req, $in, $rules): array {
            self::assertNameFree($in['name'], null);
            $id = uuid4();
            $now = now_iso();
            Db::insert('discount_templates', ['id' => $id, 'name' => $in['name'], 'created_at' => $now, 'updated_at' => $now]);
            self::replaceRules('template_id', $id, $rules);
            Audit::log($req, 'discount_template_create', 'discount_template', $id, null, ['name' => $in['name'], 'rules' => count($rules)]);
            return self::template($id);
        });
    }

    /** Replaces name and rules. Linked customers see the new prices at once (live link). */
    public static function updateTemplate(Request $req, string $id, mixed $body): array
    {
        $in = V::parse($body, self::TEMPLATE_SCHEMA);
        $rules = self::validateRules($in['rules']);
        return Db::tx(static function () use ($req, $id, $in, $rules): array {
            $before = self::template($id);
            self::assertNameFree($in['name'], $id);
            Db::update('discount_templates', ['name' => $in['name'], 'updated_at' => now_iso()], ['id' => $id]);
            self::replaceRules('template_id', $id, $rules);
            Audit::log($req, 'discount_template_update', 'discount_template', $id,
                ['name' => $before['name'], 'rules' => count($before['rules'])], ['name' => $in['name'], 'rules' => count($rules)]);
            return self::template($id);
        });
    }

    /** Deletes the szablon; its customers are unlinked and keep their own rules and global %. */
    public static function deleteTemplate(Request $req, string $id): void
    {
        Db::tx(static function () use ($req, $id): void {
            $before = self::template($id);
            $linked = Db::all('SELECT id FROM users WHERE discount_template_id = ?', [$id]);
            Db::exec('UPDATE users SET discount_template_id = NULL, updated_at = ? WHERE discount_template_id = ?', [now_iso(), $id]);
            foreach ($linked as $u) {
                Audit::log($req, 'customer_discount', 'user', (string) $u['id'], ['templateId' => $id], ['templateId' => null]);
            }
            Db::exec('DELETE FROM discount_templates WHERE id = ?', [$id]);
            Audit::log($req, 'discount_template_delete', 'discount_template', $id, ['name' => $before['name']], null);
        });
    }

    /** GET /admin/customers/:id/discounts. */
    public static function forCustomer(string $userId): array
    {
        $user = CustomersService::find($userId);
        return [
            'discountPercent' => (float) $user['discount_percent'],
            'templateId' => $user['discount_template_id'],
            'rules' => self::rules('user_id', $userId),
        ];
    }

    /** PUT /admin/customers/:id/discounts: szablon link (or null) and the customer's own rules, replaced. */
    public static function updateCustomer(Request $req, string $userId, mixed $body): array
    {
        $in = V::parse($body, self::CUSTOMER_SCHEMA);
        $rules = self::validateRules($in['rules']);
        $templateId = $in['templateId'] ?? null;
        return Db::tx(static function () use ($req, $userId, $templateId, $rules): array {
            $before = self::forCustomer($userId);
            if ($templateId !== null) {
                self::template($templateId);
            }
            Db::update('users', ['discount_template_id' => $templateId, 'updated_at' => now_iso()], ['id' => $userId]);
            self::replaceRules('user_id', $userId, $rules);
            $after = self::forCustomer($userId);
            if ($before !== $after) {
                Audit::log($req, 'customer_discount', 'user', $userId,
                    ['templateId' => $before['templateId'], 'rules' => count($before['rules'])],
                    ['templateId' => $after['templateId'], 'rules' => count($after['rules'])]);
            }
            return $after;
        });
    }

    /** One szablon with its rules, or 404 discount_template. */
    public static function template(string $id): array
    {
        $row = Db::one(
            'SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.discount_template_id = t.id) AS customers_count
             FROM discount_templates t WHERE t.id = ?',
            [$id],
        );
        if ($row === null) {
            throw ApiError::notFound('discount_template');
        }
        return self::presentTemplate($row);
    }

    /**
     * Rules of a szablon ('template_id') or a customer ('user_id'), categories first.
     * label = the product name for a SKU rule (null when the product is gone or for a category).
     * @return list<array{type:string,target:string,percent:float,label:?string}>
     */
    public static function rules(string $owner, string $id): array
    {
        $column = $owner === 'template_id' ? 'template_id' : 'user_id';
        $rows = Db::all(
            "SELECT r.target_type, r.target, r.percent, p.name AS product_name
             FROM discount_rules r LEFT JOIN products p ON r.target_type = 'product' AND p.sku = r.target
             WHERE r.$column = ?
             ORDER BY r.target_type, r.target COLLATE NOCASE",
            [$id],
        );
        return array_map(static fn(array $r): array => [
            'type' => (string) $r['target_type'],
            'target' => (string) $r['target'],
            'percent' => (float) $r['percent'],
            'label' => $r['product_name'] === null ? null : (string) $r['product_name'],
        ], $rows);
    }

    /**
     * 0–100 step 0.5 (422 invalid_discount), no two rules on one target (422 duplicate_rule),
     * a category in use / an existing SKU (422 unknown_target).
     * @param list<array{type:string,target:string,percent:float|int}> $rules
     * @return list<array{type:string,target:string,percent:float}>
     */
    private static function validateRules(array $rules): array
    {
        $out = [];
        $seen = [];
        $wanted = ['category' => [], 'product' => []];
        foreach ($rules as $i => $r) {
            $p = (float) $r['percent'];
            if (!is_finite($p) || $p < 0 || $p > 100 || fmod($p * 2, 1.0) !== 0.0) {
                throw new ApiError(422, 'invalid_discount', ['min' => 0, 'max' => 100, 'step' => 0.5, 'index' => $i]);
            }
            $key = $r['type'] . "\0" . $r['target'];
            if (isset($seen[$key])) {
                throw new ApiError(422, 'duplicate_rule', ['type' => $r['type'], 'target' => $r['target']]);
            }
            $seen[$key] = true;
            $wanted[$r['type']][] = $r['target'];
            $out[] = ['type' => $r['type'], 'target' => $r['target'], 'percent' => $p];
        }
        $known = [
            'category' => self::existing("SELECT DISTINCT category FROM products WHERE category IN (SELECT value FROM json_each(?))", $wanted['category']),
            'product' => self::existing('SELECT sku FROM products WHERE sku IN (SELECT value FROM json_each(?))', $wanted['product']),
        ];
        foreach ($out as $r) {
            if (!isset($known[$r['type']][$r['target']])) {
                throw new ApiError(422, 'unknown_target', ['type' => $r['type'], 'target' => $r['target']]);
            }
        }
        return $out;
    }

    /** @return array<string,true> values of $sql's first column, for the given list. */
    private static function existing(string $sql, array $values): array
    {
        if ($values === []) {
            return [];
        }
        $out = [];
        foreach (Db::all($sql, [json_encode(array_values($values), JSON_UNESCAPED_UNICODE)]) as $row) {
            $out[(string) array_values($row)[0]] = true;
        }
        return $out;
    }

    private static function replaceRules(string $column, string $id, array $rules): void
    {
        Db::exec("DELETE FROM discount_rules WHERE $column = ?", [$id]);
        foreach ($rules as $r) {
            Db::insert('discount_rules', [
                'id' => uuid4(),
                $column => $id,
                'target_type' => $r['type'],
                'target' => $r['target'],
                'percent' => $r['percent'],
            ]);
        }
    }

    private static function assertNameFree(string $name, ?string $exceptId): void
    {
        $taken = Db::val(
            'SELECT id FROM discount_templates WHERE name = ? COLLATE NOCASE AND id <> ?',
            [$name, $exceptId ?? ''],
        );
        if ($taken !== null) {
            throw new ApiError(422, 'template_name_taken', ['name' => $name]);
        }
    }

    private static function presentTemplate(array $row): array
    {
        return [
            'id' => (string) $row['id'],
            'name' => (string) $row['name'],
            'rules' => self::rules('template_id', (string) $row['id']),
            'customersCount' => (int) $row['customers_count'],
            'createdAt' => (string) $row['created_at'],
            'updatedAt' => (string) $row['updated_at'],
        ];
    }
}

if (!class_exists('Discounts_Service', false)) {
    class_alias(DiscountsService::class, 'Discounts_Service');
}
