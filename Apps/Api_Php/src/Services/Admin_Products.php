<?php

declare(strict_types=1);

/**
 * Product editing in the admin panel (Pilot_Run 2026-10-10): edit any product, add new
 * ones by hand, set stock and delivery time, change many at once (bulk). Money in integer grosze.
 *
 * The JSON import still upserts by SKU, but it never writes stock / lead_time_hours,
 * never hides a product added here (source = 'manual') and keeps a photo uploaded here
 * (ImportService). Orders never lower stock.
 */
final class AdminProducts
{
    public const LEAD_TIMES = [24, 48, 72];
    public const SKU_RE = '/^[A-Za-z0-9][A-Za-z0-9._ -]{0,63}$/';
    /** Path segments under /admin/products that are routes, not products. */
    public const RESERVED_SKUS = ['options', 'export', 'skus', 'bulk'];
    /** Most products one bulk edit can change. */
    public const BULK_MAX = 2000;

    private const LIST_ITEM = ['type' => 'string', 'min' => 1, 'max' => 100];

    /** Editable fields; PATCH takes any subset, POST adds sku + name (required). */
    public const FIELDS = [
        'name' => ['type' => 'string', 'min' => 1, 'max' => 200],
        'category' => ['type' => 'string', 'max' => 100, 'emptyNull' => true, 'nullable' => true],
        'producer' => ['type' => 'string', 'max' => 100, 'emptyNull' => true, 'nullable' => true],
        'priceOnRequest' => ['type' => 'bool'],
        'priceGross' => ['type' => 'int', 'min' => 0, 'max' => 100_000_000, 'nullable' => true],
        'depositGross' => ['type' => 'int', 'min' => 0, 'max' => 100_000_000],
        'makes' => ['type' => 'array', 'max' => 50, 'items' => self::LIST_ITEM],
        'oeNumbers' => ['type' => 'array', 'max' => 100, 'items' => self::LIST_ITEM],
        'description' => ['type' => 'string', 'max' => 10_000, 'emptyNull' => true, 'nullable' => true],
        'stock' => ['type' => 'int', 'min' => 0, 'max' => 99_999],
        'leadTimeHours' => ['type' => 'int', 'nullable' => true],
        'active' => ['type' => 'bool'],
    ];

    /** GET /admin/products/:sku — the full editable record (incl. hidden products). */
    public static function get(string $sku): array
    {
        $row = Db::one('SELECT * FROM products WHERE sku = ?', [$sku]);
        if ($row === null) {
            throw ApiError::notFound('product');
        }
        return self::shape($row);
    }

    /** POST /admin/products — a new product added by hand (source 'manual', stock and time by category unless given). */
    public static function create(Request $req, mixed $body): array
    {
        $in = V::parse($body, [
            'sku' => ['type' => 'string', 'required' => true, 'pattern' => self::SKU_RE],
            'name' => ['required' => true] + self::FIELDS['name'],
        ] + self::FIELDS);
        $sku = $in['sku'];
        if (in_array(strtolower($sku), self::RESERVED_SKUS, true)) {
            throw new ApiError(422, 'sku_reserved');
        }
        if (Db::val('SELECT 1 FROM products WHERE sku = ?', [$sku]) !== null) {
            throw new ApiError(409, 'sku_taken');
        }
        $in += ['priceOnRequest' => !isset($in['priceGross']), 'makes' => [], 'oeNumbers' => [], 'active' => true];
        // Neither given → the category default; one given → the other keeps the schema default.
        if (!array_key_exists('stock', $in) && !array_key_exists('leadTimeHours', $in)) {
            $default = ProductsService::stockDefaults($in['category'] ?? null);
            $in += ['stock' => $default['stock'], 'leadTimeHours' => $default['lead_time_hours']];
        }
        $now = now_iso();
        $row = ['sku' => $sku, 'source' => 'manual', 'imported_at' => $now] + self::columns($in, $sku, null);
        Db::insert('products', $row);
        Audit::log($req, 'product_create', 'product', $sku, null, self::auditable($in));
        return self::get($sku);
    }

    /** PATCH /admin/products/:sku — only the fields sent change. */
    public static function update(Request $req, string $sku, mixed $body): array
    {
        $old = Db::one('SELECT * FROM products WHERE sku = ?', [$sku]);
        if ($old === null) {
            throw ApiError::notFound('product');
        }
        $in = V::parse($body, self::FIELDS);
        if ($in === []) {
            return self::shape($old);
        }
        $set = self::columns($in, $sku, $old);
        Db::update('products', $set, ['sku' => $sku]);
        $before = array_intersect_key(self::shape($old), $in);
        Audit::log($req, 'product_update', 'product', $sku, self::auditable($before), self::auditable($in));
        return self::get($sku);
    }

    /**
     * POST /admin/products/bulk — one change for many products (owner, 2026-10-12): stock,
     * delivery time (null = automatic) and the price, either set (priceGross) or moved by a
     * percentage (pricePercent, also the 'oryginalne' / 'zamienne' prices). A price on request
     * has nothing to move, so pricePercent skips it; priceGross gives it a price.
     * All or nothing: one transaction, one audit entry.
     *
     * @return array{updated:int,notFound:int,priceSkipped:int}
     */
    public static function bulk(Request $req, mixed $body): array
    {
        $in = V::parse($body, [
            'skus' => ['type' => 'array', 'required' => true, 'min' => 1, 'max' => self::BULK_MAX, 'items' => ['type' => 'string', 'min' => 1, 'max' => 64]],
            'priceGross' => ['type' => 'int', 'min' => 0, 'max' => 100_000_000],
            'pricePercent' => ['type' => 'number', 'min' => -90, 'max' => 900],
            'stock' => self::FIELDS['stock'],
            'leadTimeHours' => self::FIELDS['leadTimeHours'],
        ]);
        $patch = array_diff_key($in, ['skus' => true]);
        if ($patch === []) {
            throw new ApiError(422, 'nothing_to_change');
        }
        if (isset($in['priceGross'], $in['pricePercent'])) {
            throw new ApiError(422, 'price_conflict');
        }
        if (isset($in['leadTimeHours']) && !in_array($in['leadTimeHours'], self::LEAD_TIMES, true)) {
            throw new ApiError(422, 'invalid_lead_time', ['allowed' => self::LEAD_TIMES]);
        }
        $skus = self::unique($in['skus']);
        $factor = isset($in['pricePercent']) ? 1 + $in['pricePercent'] / 100 : null;
        $move = static fn(int $grosze): int => (int) round($grosze * $factor);

        $result = Db::tx(static function () use ($in, $skus, $factor, $move): array {
            $result = ['updated' => 0, 'notFound' => 0, 'priceSkipped' => 0];
            $now = now_iso();
            foreach ($skus as $sku) {
                $old = Db::one('SELECT price_gross, price_on_request, variants FROM products WHERE sku = ?', [$sku]);
                if ($old === null) {
                    $result['notFound']++;
                    continue;
                }
                $set = [];
                if (array_key_exists('stock', $in)) {
                    $set['stock'] = $in['stock'];
                }
                if (array_key_exists('leadTimeHours', $in)) {
                    $set['lead_time_hours'] = $in['leadTimeHours'];
                }
                if (isset($in['priceGross'])) {
                    $set['price_gross'] = $in['priceGross'];
                    $set['price_on_request'] = 0;
                } elseif ($factor !== null) {
                    if ((int) $old['price_on_request'] === 1 || $old['price_gross'] === null) {
                        $result['priceSkipped']++;
                    } else {
                        $set['price_gross'] = $move((int) $old['price_gross']);
                        $variants = is_string($old['variants']) ? json_decode($old['variants'], true) : null;
                        if (is_array($variants) && $variants !== []) {
                            foreach ($variants as $key => $v) {
                                $variants[$key]['price_gross'] = $move((int) $v['price_gross']);
                            }
                            $set['variants'] = $variants;
                        }
                    }
                }
                if ($set !== []) {
                    $result['updated'] += Db::update('products', $set + ['updated_at' => $now], ['sku' => $sku]);
                }
            }
            return $result;
        });
        Audit::log($req, 'products_bulk_update', 'product', null, null, $patch + $result + ['skus' => $skus]);
        return $result;
    }

    /** POST /admin/products/:sku/image — raw jpg/png/webp body replaces the photo. */
    public static function setImage(Request $req, string $sku, string $bytes): array
    {
        $old = Db::one('SELECT image FROM products WHERE sku = ?', [$sku]);
        if ($old === null) {
            throw ApiError::notFound('product');
        }
        $name = ProductImages::store($sku, $bytes);
        Db::update('products', ['image' => ProductImages::PREFIX . $name, 'updated_at' => now_iso()], ['sku' => $sku]);
        ProductImages::forget($old['image']);
        Audit::log($req, 'product_image', 'product', $sku, ['image' => $old['image']], ['image' => ProductImages::PREFIX . $name]);
        return self::get($sku);
    }

    /** DELETE /admin/products/:sku/image — product without a photo. */
    public static function removeImage(Request $req, string $sku): array
    {
        $old = Db::one('SELECT image FROM products WHERE sku = ?', [$sku]);
        if ($old === null) {
            throw ApiError::notFound('product');
        }
        Db::update('products', ['image' => null, 'updated_at' => now_iso()], ['sku' => $sku]);
        ProductImages::forget($old['image']);
        Audit::log($req, 'product_image', 'product', $sku, ['image' => $old['image']], ['image' => null]);
        return self::get($sku);
    }

    /** GET /admin/products/options — values already used, for the form's pickers. */
    public static function options(): array
    {
        $col = static fn(string $sql): array => array_values(array_map('strval', array_column(Db::all($sql), 'v')));
        return [
            'categories' => $col("SELECT DISTINCT category AS v FROM products WHERE category IS NOT NULL AND category <> '' ORDER BY category COLLATE NOCASE"),
            'producers' => $col("SELECT DISTINCT producer AS v FROM products WHERE producer IS NOT NULL AND producer <> '' ORDER BY producer COLLATE NOCASE"),
            'makes' => $col("SELECT DISTINCT j.value AS v FROM products p, json_each(p.makes) j WHERE j.type = 'text' AND trim(j.value) <> '' ORDER BY j.value COLLATE NOCASE"),
        ];
    }

    /** Validated input → products columns. $old = current row on update, null on create. */
    private static function columns(array $in, string $sku, ?array $old): array
    {
        if (array_key_exists('leadTimeHours', $in) && $in['leadTimeHours'] !== null
            && !in_array($in['leadTimeHours'], self::LEAD_TIMES, true)) {
            throw new ApiError(422, 'invalid_lead_time', ['allowed' => self::LEAD_TIMES]);
        }
        $onRequest = $in['priceOnRequest'] ?? ($old === null ? false : (bool) $old['price_on_request']);
        $price = array_key_exists('priceGross', $in) ? $in['priceGross'] : ($old['price_gross'] ?? null);
        if (!$onRequest && $price === null) {
            throw new ApiError(422, 'price_required');
        }

        $set = ['updated_at' => now_iso()];
        $map = ['name' => 'name', 'category' => 'category', 'producer' => 'producer', 'depositGross' => 'deposit_gross',
            'description' => 'description', 'stock' => 'stock', 'leadTimeHours' => 'lead_time_hours'];
        foreach ($map as $key => $column) {
            if (array_key_exists($key, $in)) {
                $set[$column] = $in[$key];
            }
        }
        if (isset($in['priceOnRequest']) || array_key_exists('priceGross', $in)) {
            $set['price_on_request'] = $onRequest ? 1 : 0;
            $set['price_gross'] = $onRequest ? null : $price;
        }
        if (isset($in['active'])) {
            $set['active'] = $in['active'] ? 1 : 0;
            $set['admin_hidden'] = $in['active'] ? 0 : 1;
        }
        if (isset($in['makes'])) {
            $makes = self::unique($in['makes']);
            $set['makes'] = $makes;
            $set['make_search'] = implode('|', array_map(static fn(string $m) => mb_strtolower($m, 'UTF-8'), $makes));
        }
        if (isset($in['oeNumbers'])) {
            $oe = self::unique($in['oeNumbers']);
            $set['oe_numbers'] = $oe;
            $set['oe_search'] = ImportService::oeSearch($sku, $oe);
        } elseif ($old === null) {
            $set['oe_search'] = ImportService::oeSearch($sku, []);
        }
        return $set;
    }

    /** products row → AdminProductDetail. */
    private static function shape(array $row): array
    {
        $image = $row['image'] !== null && $row['image'] !== '' ? (string) $row['image'] : null;
        $json = static fn(mixed $raw): array => is_string($raw) && is_array($d = json_decode($raw, true)) ? $d : [];
        return [
            'sku' => (string) $row['sku'],
            'name' => (string) $row['name'],
            'category' => $row['category'],
            'producer' => $row['producer'],
            'priceOnRequest' => (bool) $row['price_on_request'],
            'priceGross' => $row['price_gross'] === null ? null : (int) $row['price_gross'],
            'depositGross' => (int) $row['deposit_gross'],
            'hasVariants' => PricingService::hasVariants($row),
            'makes' => array_values(array_map('strval', $json($row['makes']))),
            'oeNumbers' => array_values(array_map('strval', $json($row['oe_numbers']))),
            'description' => $row['description'],
            'stock' => ProductsService::stock($row),
            'leadTimeHours' => ProductsService::leadTimeHours($row),
            'active' => (bool) $row['active'],
            'image' => $image,
            'imageUrl' => ProductsService::imageUrl($image),
            'source' => (string) $row['source'],
            'importedAt' => (string) $row['imported_at'],
            'updatedAt' => $row['updated_at'],
        ];
    }

    /** @return list<string> */
    private static function unique(array $list): array
    {
        return array_values(array_unique(array_map(static fn($v) => trim((string) $v), $list)));
    }

    /** Audit payload without the long description text. */
    private static function auditable(array $in): array
    {
        if (array_key_exists('description', $in)) {
            $in['description'] = $in['description'] === null ? null : mb_strlen((string) $in['description']) . ' chars';
        }
        return $in;
    }
}
