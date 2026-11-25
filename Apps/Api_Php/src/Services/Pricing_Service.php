<?php

declare(strict_types=1);

/**
 * The one place prices are computed (catalogue, cart, orders).
 *
 * Money is integer grosze. Catalogue prices are gross (brutto, VAT 23%).
 * The customer's discount applies to the product price only, never to the
 * kaucja (deposit), which carries 0% VAT. Amounts are rounded to whole grosze
 * per unit; line totals are unit × qty, so a line never drifts by rounding.
 * A product without a price (price on request) yields null unit/line prices
 * and is flagged — callers exclude it from totals.
 */
final class PricingService
{
    public const VAT_RATE = 0.23;
    public const VARIANTS = ['oryginalne', 'zamienne'];

    /**
     * @return array{unitGross:?int, unitNet:?int, unitDeposit:int, lineGross:?int, lineNet:?int, lineDeposit:int, priceOnRequest:bool}
     */
    public static function line(?int $priceGross, int $depositGross, float $discountPercent, int $qty): array
    {
        $qty = max(0, $qty);
        $d = min(100.0, max(0.0, $discountPercent));
        $depositGross = max(0, $depositGross);
        if ($priceGross === null) {
            return [
                'unitGross' => null,
                'unitNet' => null,
                'unitDeposit' => $depositGross,
                'lineGross' => null,
                'lineNet' => null,
                'lineDeposit' => $depositGross * $qty,
                'priceOnRequest' => true,
            ];
        }
        $unitGross = (int) round($priceGross * (1 - $d / 100));
        $unitNet = (int) round($unitGross / (1 + self::VAT_RATE));
        return [
            'unitGross' => $unitGross,
            'unitNet' => $unitNet,
            'unitDeposit' => $depositGross,
            'lineGross' => $unitGross * $qty,
            'lineNet' => $unitNet * $qty,
            'lineDeposit' => $depositGross * $qty,
            'priceOnRequest' => false,
        ];
    }

    /**
     * Gross price (grosze) of a products row, before discount. With $variant the
     * price comes from variants JSON [variant].price_gross. Null = price on request.
     * Unknown variant, or a variant on a product without variants → 422 invalid_variant.
     */
    public static function priceFor(array $productRow, ?string $variant): ?int
    {
        if ($variant === null) {
            if ((int) ($productRow['price_on_request'] ?? 0) === 1 || $productRow['price_gross'] === null) {
                return null;
            }
            return (int) $productRow['price_gross'];
        }
        $variants = self::variants($productRow);
        if (!in_array($variant, self::VARIANTS, true) || !isset($variants[$variant]) || !is_array($variants[$variant])) {
            throw new ApiError(422, 'invalid_variant', ['variant' => $variant]);
        }
        $price = $variants[$variant]['price_gross'] ?? null;
        return $price === null ? null : (int) $price;
    }

    /** Decoded variants map ({} when the product has none). */
    public static function variants(array $productRow): array
    {
        $raw = $productRow['variants'] ?? null;
        if (is_array($raw)) {
            return $raw;
        }
        if (!is_string($raw) || $raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    public static function hasVariants(array $productRow): bool
    {
        return array_intersect(array_keys(self::variants($productRow)), self::VARIANTS) !== [];
    }
}

if (!class_exists('Pricing_Service', false)) {
    class_alias(PricingService::class, 'Pricing_Service');
}
