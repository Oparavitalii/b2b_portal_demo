<?php

declare(strict_types=1);

/**
 * Catalogue reads (R-17, R-21, R-22). Only active products are visible.
 *
 * Search (q) matches, case-insensitively, the normalised OE numbers
 * (products.oe_search: lowercase, no spaces/dashes, space-joined, SKU included),
 * the SKU and the name. The query is normalised the same way for the OE match,
 * so '095000-5801', '095000 5801' and '0950005801' find the same product.
 * Filters: category (exact) and make (one of products.makes, via make_search
 * 'a|b|c'). Facets are counted over the q-filtered set. Prices: PricingService
 * with the current user's DiscountPolicy (per-product %, else the global %).
 * discountPercent at the top = the global %; on each card = the % of that product.
 */
final class ProductsService
{
    public const LIST_SCHEMA = [
        'q' => ['type' => 'string', 'max' => 100, 'emptyNull' => true, 'nullable' => true],
        'category' => ['type' => 'string', 'max' => 100, 'emptyNull' => true, 'nullable' => true],
        'make' => ['type' => 'string', 'max' => 100, 'emptyNull' => true, 'nullable' => true],
        'page' => ['type' => 'int', 'min' => 1, 'max' => 1000000, 'default' => 1],
        'pageSize' => ['type' => 'int', 'min' => 1, 'max' => 100, 'default' => 24],
    ];

    public const IMAGE_BASE = '/img/products/';

    /** OE / SKU normalisation shared by the importer and the search: lowercase, no whitespace or dashes. */
    public static function normalizeOe(string $value): string
    {
        return (string) preg_replace('/[\s\-‐‑‒–—]+/u', '', mb_strtolower(trim($value), 'UTF-8'));
    }

    /**
     * @param array{q?:?string,category?:?string,make?:?string,page:int,pageSize:int} $in
     * @return array{items:list<array>,total:int,page:int,pageSize:int,discountPercent:float,productDiscounts:bool,facets:array{categories:list<array>,makes:list<array>}}
     */
    public static function list(array $in, DiscountPolicy|float $discount): array
    {
        $policy = DiscountPolicy::of($discount);
        [$qSql, $qParams] = self::searchClause($in['q'] ?? null);
        $where = 'p.active = 1' . $qSql;
        $params = $qParams;
        $category = $in['category'] ?? null;
        if ($category !== null) {
            $where .= ' AND p.category = :category';
            $params['category'] = $category;
        }
        $make = $in['make'] ?? null;
        if ($make !== null) {
            $where .= " AND ('|' || p.make_search || '|') LIKE :make ESCAPE '\\'";
            $params['make'] = '%|' . addcslashes(mb_strtolower(trim($make), 'UTF-8'), '\\%_') . '|%';
        }

        $page = paginate(
            'FROM products p WHERE ' . $where,
            $params,
            'p.*',
            'p.category COLLATE NOCASE, p.name COLLATE NOCASE, p.sku',
            (int) $in['page'],
            (int) $in['pageSize'],
            static fn(array $row) => self::card($row, $policy),
        );

        $facetWhere = 'p.active = 1' . $qSql;
        $categories = Db::all(
            "SELECT p.category AS value, COUNT(*) AS count FROM products p
             WHERE $facetWhere AND p.category IS NOT NULL AND p.category <> ''
             GROUP BY p.category ORDER BY p.category COLLATE NOCASE",
            $qParams,
        );
        $makes = Db::all(
            "SELECT j.value AS value, COUNT(DISTINCT p.sku) AS count FROM products p, json_each(p.makes) j
             WHERE $facetWhere AND j.type = 'text' AND trim(j.value) <> ''
             GROUP BY j.value ORDER BY j.value COLLATE NOCASE",
            $qParams,
        );
        $facet = static fn(array $r) => ['value' => (string) $r['value'], 'count' => (int) $r['count']];

        return $page + [
            'discountPercent' => $policy->base,
            'productDiscounts' => $policy->hasRules(),
            'facets' => [
                'categories' => array_map($facet, $categories),
                'makes' => array_map($facet, $makes),
            ],
        ];
    }

    /** Active product by SKU → ProductDetail, or 404. */
    public static function detail(string $sku, DiscountPolicy|float $discount): array
    {
        $row = Db::one('SELECT * FROM products WHERE sku = ? AND active = 1', [$sku]);
        if ($row === null) {
            throw ApiError::notFound('product');
        }
        return self::detailFromRow($row, $discount);
    }

    /** products row → ProductDetail (shared by detail() and the client API, Api_V1_Service). */
    public static function detailFromRow(array $row, DiscountPolicy|float $discount): array
    {
        $policy = DiscountPolicy::of($discount);
        $attributes = self::json($row['attributes'], []);
        return self::card($row, $policy) + [
            'oeNumbers' => array_values(array_map('strval', self::json($row['oe_numbers'], []))),
            'engineCodes' => array_values(array_map('strval', self::json($row['engine_codes'], []))),
            'applications' => array_values(array_map(static fn($a) => [
                'marka' => (string) ($a['marka'] ?? ''),
                'model' => (string) ($a['model'] ?? ''),
                'silnik' => (string) ($a['silnik'] ?? ''),
                'lata' => (string) ($a['lata'] ?? ''),
            ], array_filter(self::json($row['applications'], []), 'is_array'))),
            'description' => $row['description'],
            'attributes' => $attributes === [] ? new stdClass() : $attributes,
            'productDiscounts' => $policy->hasRules(),
        ];
    }

    /**
     * products row → ProductCard (prices for the given discount). With a discount each
     * price also carries listNet/listGross, the price before it, so the page can show both.
     * discountPercent = the % this product gets (DiscountPolicy).
     */
    public static function card(array $row, DiscountPolicy|float $discount): array
    {
        $discountPercent = DiscountPolicy::of($discount)->percentFor($row);
        $deposit = (int) $row['deposit_gross'];
        $gross = PricingService::priceFor($row, null);
        $base = PricingService::line($gross, $deposit, $discountPercent, 1);
        $variants = [];
        if (PricingService::hasVariants($row)) {
            foreach (PricingService::VARIANTS as $key) {
                if (!isset(PricingService::variants($row)[$key])) {
                    continue;
                }
                $variantGross = PricingService::priceFor($row, $key);
                $v = PricingService::line($variantGross, $deposit, $discountPercent, 1);
                $variants[] = [
                    'key' => $key,
                    'price' => $v['priceOnRequest'] ? null
                        : ['unitNet' => $v['unitNet'], 'unitGross' => $v['unitGross']] + self::listPrice($variantGross, $discountPercent),
                ];
            }
        }
        $image = $row['image'] !== null && $row['image'] !== '' ? (string) $row['image'] : null;
        return [
            'sku' => (string) $row['sku'],
            'name' => (string) $row['name'],
            'category' => $row['category'],
            'producer' => $row['producer'],
            'image' => $image,
            'imageUrl' => self::imageUrl($image),
            'makes' => array_values(array_map('strval', self::json($row['makes'], []))),
            'priceOnRequest' => $base['priceOnRequest'],
            'price' => $base['priceOnRequest'] ? null : [
                'unitNet' => $base['unitNet'],
                'unitGross' => $base['unitGross'],
                'unitDeposit' => $base['unitDeposit'],
            ] + self::listPrice($gross, $discountPercent),
            'hasVariants' => $variants !== [],
            'variants' => $variants,
            'stock' => self::stock($row),
            'leadTimeHours' => self::leadTimeHours($row),
            'discountPercent' => $discountPercent,
        ];
    }

    /** {listNet, listGross} before the discount; [] without a discount or a price. */
    private static function listPrice(?int $gross, float $discountPercent): array
    {
        if ($gross === null || $discountPercent <= 0) {
            return [];
        }
        $list = PricingService::line($gross, 0, 0.0, 1);
        return ['listNet' => $list['unitNet'], 'listGross' => $list['unitGross']];
    }

    /**
     * Pieces in stock (products.stock, set in the admin panel; default by category: stockDefaults). Display only:
     * orders never lower it and the JSON import never overwrites it (Pilot_Run 2026-10-10).
     */
    public static function stock(array $row): int
    {
        return max(0, (int) ($row['stock'] ?? 0));
    }

    /** Categories regenerated to order: 1 piece, 72 h by default (owner, 2026-10-12). */
    public const TO_ORDER_CATEGORIES = ['Pompy CR', 'Zbiorniki AdBlue'];

    /**
     * Stock and delivery time a new product starts with: pumps and AdBlue tanks 1 piece / 72 h,
     * everything else 4 pieces / automatic (in stock → 24 h). Same rule: Packages/Shared availability.ts.
     *
     * @return array{stock:int,lead_time_hours:?int}
     */
    public static function stockDefaults(?string $category): array
    {
        return in_array($category, self::TO_ORDER_CATEGORIES, true)
            ? ['stock' => 1, 'lead_time_hours' => 72]
            : ['stock' => 4, 'lead_time_hours' => null];
    }

    /** Delivery time the admin set (24 | 48 | 72), or null = automatic from stock. */
    public static function leadTimeHours(array $row): ?int
    {
        $v = $row['lead_time_hours'] ?? null;
        return $v === null ? null : (int) $v;
    }

    /** 'X.webp' → '/img/products/X.webp' (synced with the SPA); 'upload/Y.jpg' → '/api/media/products/Y.jpg' (uploaded in the panel). */
    public static function imageUrl(?string $image): ?string
    {
        if ($image === null || $image === '') {
            return null;
        }
        if (str_starts_with($image, ProductImages::PREFIX)) {
            return ProductImages::URL_BASE . rawurlencode(substr($image, strlen(ProductImages::PREFIX)));
        }
        return self::IMAGE_BASE . rawurlencode($image);
    }

    /** @return array{0:string,1:array} SQL fragment (' AND (...)' or '') and its params. */
    private static function searchClause(?string $q): array
    {
        if ($q === null || trim($q) === '') {
            return ['', []];
        }
        $parts = ["ulower(p.sku) LIKE :q ESCAPE '\\'", "ulower(p.name) LIKE :q ESCAPE '\\'"];
        $params = ['q' => Db::like($q)];
        $normalized = self::normalizeOe($q);
        if ($normalized !== '') {
            $parts[] = "p.oe_search LIKE :qn ESCAPE '\\'";
            $parts[] = "replace(replace(ulower(p.sku), '-', ''), ' ', '') LIKE :qn ESCAPE '\\'";
            $params['qn'] = '%' . addcslashes($normalized, '\\%_') . '%';
        }
        return [' AND (' . implode(' OR ', $parts) . ')', $params];
    }

    private static function json(mixed $raw, array $fallback): array
    {
        if (!is_string($raw) || $raw === '') {
            return $fallback;
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : $fallback;
    }
}

if (!class_exists('Products_Service', false)) {
    class_alias(ProductsService::class, 'Products_Service');
}
