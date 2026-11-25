<?php

declare(strict_types=1);

/**
 * Koszyk (R-05). One cart per user, lines unique by (sku, variant). Every
 * amount comes from PricingService::line() with the user's CURRENT discount
 * (DiscountPolicy: per-product %, else the global %), so a discount change by
 * the admin shows up on the next read. Each line carries its discountPercent.
 *
 * Totals cover priced lines only: a "Cena na zapytanie" line (and its kaucja)
 * is flagged and left out of net / gross / deposit, as the order does.
 * Lines whose product was deactivated, or whose variant no longer exists after
 * a re-import, are not part of the cart (not shown, not ordered).
 */
final class CartService
{
    public const MAX_QTY = 999;

    public const PUT_ITEM_SCHEMA = [
        'sku' => ['type' => 'string', 'required' => true, 'min' => 1, 'max' => 100],
        'variant' => ['type' => 'enum', 'values' => PricingService::VARIANTS, 'nullable' => true, 'emptyNull' => true, 'default' => null],
        'qty' => ['type' => 'int', 'required' => true, 'min' => 0, 'max' => self::MAX_QTY],
    ];

    /** Cart of the user: {lines, totals, discountPercent (global %), productDiscounts, hasPriceOnRequest, count}. */
    public static function get(string $userId, DiscountPolicy|float $discount): array
    {
        $policy = DiscountPolicy::of($discount);
        return self::summary(self::lines($userId, $policy), $policy);
    }

    /**
     * Sets the quantity of one line (qty 0 removes it). Unknown or inactive SKU → 404;
     * a product with variants needs one (422 variant_required); a variant on a
     * product without variants → 422 invalid_variant.
     */
    public static function putItem(string $userId, DiscountPolicy|float $discountPercent, mixed $body): array
    {
        $in = V::parse($body, self::PUT_ITEM_SCHEMA);
        $sku = $in['sku'];
        $variant = $in['variant'] ?? null;
        $qty = (int) $in['qty'];

        if ($qty === 0) {
            Db::exec(
                "DELETE FROM cart_items WHERE user_id = ? AND sku = ? AND ifnull(variant, '') = ?",
                [$userId, $sku, $variant ?? ''],
            );
            return self::get($userId, $discountPercent);
        }

        $product = Db::one('SELECT * FROM products WHERE sku = ? AND active = 1', [$sku]);
        if ($product === null) {
            throw ApiError::notFound('product');
        }
        if ($variant === null && PricingService::hasVariants($product)) {
            throw new ApiError(422, 'variant_required', ['sku' => $sku]);
        }
        PricingService::priceFor($product, $variant); // validates the variant against the product

        Db::tx(static function () use ($userId, $sku, $variant, $qty): void {
            $id = Db::val(
                "SELECT id FROM cart_items WHERE user_id = ? AND sku = ? AND ifnull(variant, '') = ?",
                [$userId, $sku, $variant ?? ''],
            );
            if ($id !== null) {
                Db::update('cart_items', ['qty' => $qty, 'updated_at' => now_iso()], ['id' => (string) $id]);
                return;
            }
            Db::insert('cart_items', [
                'id' => uuid4(),
                'user_id' => $userId,
                'sku' => $sku,
                'variant' => $variant,
                'qty' => $qty,
                'created_at' => now_iso(),
                'updated_at' => now_iso(),
            ]);
        });
        return self::get($userId, $discountPercent);
    }

    public static function clear(string $userId): void
    {
        Db::exec('DELETE FROM cart_items WHERE user_id = ?', [$userId]);
    }

    /**
     * Priced cart lines, oldest first.
     * @return list<array{id:string,sku:string,name:string,image:?string,imageUrl:?string,variant:?string,qty:int,discountPercent:float,priceOnRequest:bool,unitNet:?int,unitGross:?int,unitDeposit:int,lineNet:?int,lineGross:?int,lineDeposit:int,stock:int,leadTimeHours:?int}>
     */
    public static function lines(string $userId, DiscountPolicy|float $discount): array
    {
        $policy = DiscountPolicy::of($discount);
        $rows = Db::all(
            'SELECT c.id AS cart_id, c.variant AS cart_variant, c.qty AS cart_qty, p.*
             FROM cart_items c JOIN products p ON p.sku = c.sku
             WHERE c.user_id = ? AND p.active = 1
             ORDER BY c.created_at, c.id',
            [$userId],
        );
        $out = [];
        foreach ($rows as $row) {
            $variant = $row['cart_variant'];
            $hasVariants = PricingService::hasVariants($row);
            if ($variant === null ? $hasVariants : !isset(PricingService::variants($row)[$variant])) {
                continue;
            }
            $qty = (int) $row['cart_qty'];
            $discountPercent = $policy->percentFor($row);
            $price = PricingService::line(PricingService::priceFor($row, $variant), (int) $row['deposit_gross'], $discountPercent, $qty);
            $image = $row['image'] !== null && $row['image'] !== '' ? (string) $row['image'] : null;
            $out[] = [
                'id' => (string) $row['cart_id'],
                'sku' => (string) $row['sku'],
                'name' => (string) $row['name'],
                'image' => $image,
                'imageUrl' => ProductsService::imageUrl($image),
                'variant' => $variant,
                'qty' => $qty,
                'discountPercent' => $discountPercent,
                'priceOnRequest' => $price['priceOnRequest'],
                'unitNet' => $price['unitNet'],
                'unitGross' => $price['unitGross'],
                'unitDeposit' => $price['unitDeposit'],
                'lineNet' => $price['lineNet'],
                'lineGross' => $price['lineGross'],
                'lineDeposit' => $price['lineDeposit'],
                'stock' => ProductsService::stock($row),
                'leadTimeHours' => ProductsService::leadTimeHours($row),
            ];
        }
        return $out;
    }

    /**
     * Sums of the priced lines (price-on-request lines excluded, kaucja included).
     * @return array{net:int,gross:int,deposit:int,grossWithDeposit:int}
     */
    public static function totals(array $lines): array
    {
        $net = 0;
        $gross = 0;
        $deposit = 0;
        foreach ($lines as $l) {
            if ($l['priceOnRequest']) {
                continue;
            }
            $net += (int) $l['lineNet'];
            $gross += (int) $l['lineGross'];
            $deposit += (int) $l['lineDeposit'];
        }
        return ['net' => $net, 'gross' => $gross, 'deposit' => $deposit, 'grossWithDeposit' => $gross + $deposit];
    }

    private static function summary(array $lines, DiscountPolicy $policy): array
    {
        $hasPor = false;
        $count = 0;
        foreach ($lines as $l) {
            $hasPor = $hasPor || $l['priceOnRequest'];
            $count += $l['qty'];
        }
        return [
            'lines' => $lines,
            'totals' => self::totals($lines),
            'discountPercent' => $policy->base,
            'productDiscounts' => $policy->hasRules(),
            'hasPriceOnRequest' => $hasPor,
            'count' => $count,
        ];
    }
}

if (!class_exists('Cart_Service', false)) {
    class_alias(CartService::class, 'Cart_Service');
}
