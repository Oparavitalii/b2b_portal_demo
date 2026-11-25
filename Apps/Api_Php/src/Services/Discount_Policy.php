<?php

declare(strict_types=1);

/**
 * The discount % a customer gets on one product (Pilot_Run 2026-10-16).
 *
 * Order: the customer's own product rule → own category rule → szablon product rule →
 * szablon category rule → the customer's global % (users.discount_percent). Inside a
 * layer the product (SKU) beats the category; the customer's own rules beat the szablon.
 * Rules live in discount_rules (Schema_Discounts.sql). Variants share the product's %.
 */
final class DiscountPolicy
{
    /**
     * @param array{product:array<string,float>,category:array<string,float>} $custom
     * @param array{product:array<string,float>,category:array<string,float>} $template
     */
    private function __construct(
        public readonly float $base,
        private readonly array $custom,
        private readonly array $template,
    ) {
    }

    /** One % on everything (no rules): what a bare float meant before. */
    public static function flat(float $percent): self
    {
        return new self($percent, ['product' => [], 'category' => []], ['product' => [], 'category' => []]);
    }

    public static function of(self|float $policy): self
    {
        return $policy instanceof self ? $policy : self::flat($policy);
    }

    /** Policy of a users row (null / admin → no discount rules, global % only). */
    public static function forUser(?array $user): self
    {
        if ($user === null) {
            return self::flat(0.0);
        }
        $base = (float) ($user['discount_percent'] ?? 0);
        $templateId = $user['discount_template_id'] ?? null;
        $rows = Db::all(
            'SELECT template_id, target_type, target, percent FROM discount_rules
             WHERE user_id = ? OR (template_id IS NOT NULL AND template_id = ?)',
            [(string) $user['id'], $templateId],
        );
        $custom = ['product' => [], 'category' => []];
        $template = ['product' => [], 'category' => []];
        foreach ($rows as $r) {
            if ($r['template_id'] === null) {
                $custom[$r['target_type']][(string) $r['target']] = (float) $r['percent'];
            } else {
                $template[$r['target_type']][(string) $r['target']] = (float) $r['percent'];
            }
        }
        return new self($base, $custom, $template);
    }

    /** True when any product / category rule applies to this customer. */
    public function hasRules(): bool
    {
        return $this->custom['product'] !== [] || $this->custom['category'] !== []
            || $this->template['product'] !== [] || $this->template['category'] !== [];
    }

    /** % for a products row (needs sku and category). */
    public function percentFor(array $productRow): float
    {
        $sku = (string) ($productRow['sku'] ?? '');
        $category = $productRow['category'] ?? null;
        $category = $category === null ? null : (string) $category;
        foreach ([$this->custom, $this->template] as $layer) {
            if (isset($layer['product'][$sku])) {
                return $layer['product'][$sku];
            }
            if ($category !== null && isset($layer['category'][$category])) {
                return $layer['category'][$category];
            }
        }
        return $this->base;
    }
}

if (!class_exists('Discount_Policy', false)) {
    class_alias(DiscountPolicy::class, 'Discount_Policy');
}
