<?php

declare(strict_types=1);

/**
 * Product import from the shop's Products_Data.json ({_meta, produkty[]}) — R-16, R-20, R-25.
 * The JSON is the source of truth: one transaction, upsert by SKU, products missing
 * from the file are deactivated (active = 0, never deleted: carts and orders keep
 * their SKU). Prices in the file are gross whole złoty strings ('588', '1869.00');
 * the database stores integer grosze.
 * Set in the admin panel and kept by every import (Pilot_Run 2026-10-10): stock and
 * lead_time_hours (written only for a new SKU: ProductsService::stockDefaults), a photo uploaded in the panel ('upload/…'),
 * a product the admin hid (admin_hidden),
 * and products added by hand (source 'manual' — never deactivated).
 */
final class ImportService
{
    /** Max raw body size accepted by POST /admin/products/import. */
    public const MAX_BYTES = 20 * 1024 * 1024;

    /** Fields mapped to their own columns (everything else goes to attributes). */
    private const MAPPED = ['sku', 'nazwa', 'kategoria', 'typ', 'producent', 'numeryOem', 'markaPojazdu', 'kodSilnika',
        'zastosowanie', 'cena', 'cenaNaZapytanie', 'kaucjaPln', 'wersje', 'obraz', 'opis', 'infoDodatkowe'];

    /** Internal bookkeeping of the catalogue data pipeline — never shown to customers. */
    private const INTERNAL = ['obrazZrodlowy', 'zrodloCeny', 'zrodloCenyKorekta', 'wyrozniony'];

    private const VARIANT_KEYS = ['oryginalne', 'zamienne'];

    /**
     * @return array{created:int,updated:int,deactivated:int,skipped:list<string>}
     */
    public static function import(array $json): array
    {
        $records = $json['produkty'] ?? null;
        if (!is_array($records) || !array_is_list($records)) {
            throw new ApiError(422, 'invalid_import_file', ['reason' => 'missing_produkty']);
        }
        if ($records === []) {
            throw new ApiError(422, 'invalid_import_file', ['reason' => 'empty_produkty']);
        }

        return Db::tx(static function () use ($records): array {
            $created = 0;
            $updated = 0;
            $skipped = [];
            /** @var array<string,true> $seen SKUs present in the file (also skipped ones: never deactivated) */
            $seen = [];
            $now = now_iso();

            foreach ($records as $i => $rec) {
                $label = 'Rekord #' . ($i + 1);
                if (!is_array($rec)) {
                    $skipped[] = $label . ': nie jest obiektem';
                    continue;
                }
                $sku = is_scalar($rec['sku'] ?? null) ? trim((string) $rec['sku']) : '';
                if ($sku === '') {
                    $skipped[] = $label . ': brak SKU';
                    continue;
                }
                $label .= ' (' . $sku . ')';
                if (isset($seen[$sku])) {
                    $skipped[] = $label . ': powtórzony SKU';
                    continue;
                }
                $seen[$sku] = true;
                $name = is_string($rec['nazwa'] ?? null) ? trim($rec['nazwa']) : '';
                if ($name === '') {
                    $skipped[] = $label . ': brak nazwy';
                    continue;
                }
                try {
                    $row = self::mapRecord($rec, $sku, $name);
                } catch (InvalidArgumentException $e) {
                    $skipped[] = $label . ': ' . $e->getMessage();
                    continue;
                }
                $row['imported_at'] = $now;

                // Shown again unless the admin hid it in the panel (admin_hidden).
                $hidden = Db::val('SELECT admin_hidden FROM products WHERE sku = ?', [$sku]);
                $row['active'] = (int) $hidden === 1 ? 0 : 1;
                if ($hidden === null) {
                    Db::insert('products', $row + ['updated_at' => $now] + ProductsService::stockDefaults($row['category']));
                    $created++;
                } else {
                    unset($row['sku']);
                    $current = Db::one('SELECT * FROM products WHERE sku = ?', [$sku]);
                    if (str_starts_with((string) $current['image'], ProductImages::PREFIX)) {
                        unset($row['image']);
                    }
                    // updated_at only on a real change: the client API's updatedSince reads it (B-21).
                    if (self::changed($current, $row)) {
                        $row['updated_at'] = $now;
                    }
                    Db::update('products', $row, ['sku' => $sku]);
                    $updated++;
                }
            }

            $deactivated = 0;
            foreach (Db::all("SELECT sku FROM products WHERE active = 1 AND source <> 'manual'") as $r) {
                if (!isset($seen[$r['sku']])) {
                    $deactivated += Db::update('products', ['active' => 0, 'updated_at' => $now], ['sku' => $r['sku']]);
                }
            }

            return ['created' => $created, 'updated' => $updated, 'deactivated' => $deactivated, 'skipped' => $skipped];
        });
    }

    /** True when the import would change any column of the current row (imported_at aside). */
    private static function changed(array $current, array $row): bool
    {
        foreach ($row as $col => $value) {
            if ($col === 'imported_at') {
                continue;
            }
            $was = $current[$col] ?? null;
            if (is_bool($value)) {
                $value = (int) $value;
            } elseif (is_array($value)) {
                $value = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); // as Db binds it
            }
            if (($was === null) !== ($value === null) || ($value !== null && (string) $was !== (string) $value)) {
                return true;
            }
        }
        return false;
    }

    /** One JSON record → products row (snake_case). Throws InvalidArgumentException with a Polish reason. */
    private static function mapRecord(array $rec, string $sku, string $name): array
    {
        $oe = self::stringList($rec['numeryOem'] ?? []);
        $makes = self::stringList($rec['markaPojazdu'] ?? []);
        $onRequest = ($rec['cenaNaZapytanie'] ?? false) === true;
        $price = $onRequest ? null : self::grosze($rec['cena'] ?? '', 'cena');
        $deposit = self::grosze($rec['kaucjaPln'] ?? '', 'kaucjaPln') ?? 0;

        return [
            'sku' => $sku,
            'name' => $name,
            'category' => self::str($rec['kategoria'] ?? null),
            'type' => self::str($rec['typ'] ?? null),
            'producer' => self::str($rec['producent'] ?? null),
            'oe_numbers' => $oe,
            'oe_search' => self::oeSearch($sku, $oe),
            'makes' => $makes,
            'make_search' => implode('|', array_map(static fn(string $m) => mb_strtolower($m, 'UTF-8'), $makes)),
            'engine_codes' => self::stringList($rec['kodSilnika'] ?? []),
            'applications' => self::applications($rec['zastosowanie'] ?? []),
            'price_gross' => $price,
            'price_on_request' => $price === null ? 1 : 0,
            'deposit_gross' => $deposit,
            'variants' => self::variants($rec['wersje'] ?? null),
            'image' => self::str($rec['obraz'] ?? null),
            'description' => self::description($rec),
            // Pre-encoded so an empty set is stored as {} (an object), not [].
            'attributes' => json_encode(self::attributes($rec) ?: new stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];
    }

    /**
     * Admin preview (R-25): every product incl. inactive, newest import first by SKU.
     * q matches SKU, name and OE numbers (normalised like oe_search).
     *
     * @return array{items:list<array>,total:int,page:int,pageSize:int}
     */
    public static function listForAdmin(string $q, int $page, int $pageSize, string $category = ''): array
    {
        [$where, $params] = self::adminWhere($q, $category);
        $select = 'sku, name, category, producer, image, active, price_on_request, price_gross, deposit_gross, variants, imported_at,
            stock, lead_time_hours, source, updated_at';
        return paginate($where, $params, $select, 'active DESC, category, sku', $page, $pageSize, static function (array $r): array {
            $row = Row::camel($r);
            $row['imageUrl'] = ProductsService::imageUrl($row['image']);
            $row['stock'] = ProductsService::stock($r);
            $row['leadTimeHours'] = ProductsService::leadTimeHours($r);
            $row['variants'] = is_array($row['variants']) ? array_map(
                static fn(array $v): array => ['priceGross' => (int) $v['price_gross']],
                $row['variants'],
            ) : null;
            return $row;
        });
    }

    /**
     * SKUs of every product the admin search q (and category filter) matches — "select all" for the bulk edit.
     *
     * @return list<string>
     */
    public static function skusForAdmin(string $q, string $category = ''): array
    {
        [$where, $params] = self::adminWhere($q, $category);
        return array_map('strval', array_column(Db::all('SELECT sku ' . $where . ' ORDER BY sku', $params), 'sku'));
    }

    /** @return array{0:string,1:array} 'FROM products [WHERE …]' of the admin search + category filter and its params. */
    private static function adminWhere(string $q, string $category = ''): array
    {
        $q = trim($q);
        $category = trim($category);
        $conds = [];
        $params = [];
        if ($q !== '') {
            $conds[] = "(ulower(name) LIKE :q ESCAPE '\' OR ulower(sku) LIKE :q ESCAPE '\' OR oe_search LIKE :oe ESCAPE '\')";
            $params += ['q' => Db::like($q), 'oe' => Db::like(self::normalizeNumber($q))];
        }
        if ($category !== '') {
            $conds[] = 'category = :category';
            $params['category'] = $category;
        }
        return [$conds ? 'FROM products WHERE ' . implode(' AND ', $conds) : 'FROM products', $params];
    }

    /**
     * Normalised OE numbers + SKU for search: lower-case, no spaces or dashes inside
     * a number, unique, joined by single spaces (same rule as Products_Service q).
     */
    public static function oeSearch(string $sku, array $oeNumbers): string
    {
        $out = [];
        foreach (array_merge([$sku], $oeNumbers) as $n) {
            $norm = self::normalizeNumber((string) $n);
            if ($norm !== '') {
                $out[$norm] = true;
            }
        }
        return implode(' ', array_keys($out));
    }

    /** One rule for import and search: ProductsService::normalizeOe (catalogue, T-04). */
    public static function normalizeNumber(string $n): string
    {
        return ProductsService::normalizeOe($n);
    }

    /** '588' → 58800, '1869.00' / '1869,5' → 186900 / 186950, '' → null. */
    private static function grosze(mixed $value, string $field): ?int
    {
        if (is_int($value)) {
            $value = (string) $value;
        }
        if (!is_string($value)) {
            throw new InvalidArgumentException("pole $field nie jest tekstem");
        }
        $v = str_replace([' ', "\u{00A0}"], '', trim($value));
        if ($v === '') {
            return null;
        }
        if (preg_match('/^(\d+)(?:[.,](\d{1,2}))?$/', $v, $m) !== 1) {
            throw new InvalidArgumentException("nieprawidłowa kwota w polu $field: '$value'");
        }
        return (int) $m[1] * 100 + (int) str_pad($m[2] ?? '0', 2, '0');
    }

    /** {oryginalne:{cena}, zamienne:{cena}} → {oryginalne:{price_gross}, zamienne:{price_gross}} or null. */
    private static function variants(mixed $wersje): ?array
    {
        if (!is_array($wersje) || $wersje === []) {
            return null;
        }
        $out = [];
        foreach (self::VARIANT_KEYS as $key) {
            if (!isset($wersje[$key]) || !is_array($wersje[$key])) {
                throw new InvalidArgumentException("wersje bez wariantu '$key'");
            }
            $price = self::grosze($wersje[$key]['cena'] ?? '', "wersje.$key.cena");
            if ($price === null) {
                throw new InvalidArgumentException("wersje.$key bez ceny");
            }
            $out[$key] = ['price_gross' => $price];
        }
        return $out;
    }

    /** @return list<array{marka:string,model:string,silnik:string,lata:string}> */
    private static function applications(mixed $list): array
    {
        if (!is_array($list)) {
            return [];
        }
        $out = [];
        foreach ($list as $a) {
            if (!is_array($a)) {
                continue;
            }
            $out[] = [
                'marka' => trim((string) ($a['marka'] ?? '')),
                'model' => trim((string) ($a['model'] ?? '')),
                'silnik' => trim((string) ($a['silnik'] ?? '')),
                'lata' => trim((string) ($a['lata'] ?? '')),
            ];
        }
        return $out;
    }

    private static function description(array $rec): ?string
    {
        $parts = array_filter([self::str($rec['opis'] ?? null), self::str($rec['infoDodatkowe'] ?? null)]);
        return $parts === [] ? null : implode("\n\n", $parts);
    }

    /** Remaining non-empty fields (stanMagazynowy, gwarancja, segment, rodzina, waga, wymiary, ...). */
    private static function attributes(array $rec): array
    {
        $out = [];
        foreach ($rec as $key => $value) {
            $key = (string) $key;
            if (in_array($key, self::MAPPED, true) || in_array($key, self::INTERNAL, true)) {
                continue;
            }
            if ($key === 'wymiary') {
                $value = self::dimensions($value);
            }
            if (is_string($value)) {
                $value = trim($value);
                if ($value === '') {
                    continue;
                }
            } elseif (is_array($value)) {
                $value = self::stringList($value);
                if ($value === []) {
                    continue;
                }
            } elseif ($value === null || !is_scalar($value)) {
                continue;
            }
            $out[$key] = $value;
        }
        return $out;
    }

    /** {dlugosc, szerokosc, wysokosc} (cm) → '22 × 12 × 8 cm', or null when incomplete. */
    private static function dimensions(mixed $w): ?string
    {
        if (!is_array($w)) {
            return null;
        }
        $parts = [];
        foreach (['dlugosc', 'szerokosc', 'wysokosc'] as $k) {
            $v = trim((string) ($w[$k] ?? ''));
            if ($v === '') {
                return null;
            }
            $parts[] = $v;
        }
        return implode(' × ', $parts) . ' cm';
    }

    /** @return list<string> trimmed, non-empty, unique scalar values */
    private static function stringList(mixed $list): array
    {
        if (!is_array($list)) {
            return [];
        }
        $out = [];
        foreach ($list as $v) {
            if (is_scalar($v)) {
                $s = trim((string) $v);
                if ($s !== '' && !in_array($s, $out, true)) {
                    $out[] = $s;
                }
            }
        }
        return $out;
    }

    private static function str(mixed $v): ?string
    {
        if (!is_scalar($v)) {
            return null;
        }
        $s = trim((string) $v);
        return $s === '' ? null : $s;
    }
}
