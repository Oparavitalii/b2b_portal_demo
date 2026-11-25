<?php

declare(strict_types=1);

/**
 * The whole catalogue as an Excel file for the admin (GET /api/admin/products/export).
 * Every product, hidden ones too, in the admin list order. Prices are list prices
 * (before any customer discount), in złoty; the net price uses the same rounding
 * as the shop (PricingService::line).
 */
final class ProductsExport
{
    /** @return array{name:string,bytes:string,count:int} */
    public static function xlsx(): array
    {
        $rows = Db::all(
            'SELECT sku, name, category, type, producer, oe_numbers, makes, engine_codes, price_gross, price_on_request,
                deposit_gross, variants, stock, lead_time_hours, active, source, image, description, imported_at, updated_at
             FROM products ORDER BY active DESC, category, sku',
        );
        $columns = [
            ['title' => 'SKU', 'type' => Xlsx::TEXT, 'width' => 16],
            ['title' => 'Nazwa', 'type' => Xlsx::TEXT, 'width' => 48],
            ['title' => 'Kategoria', 'type' => Xlsx::TEXT, 'width' => 22],
            ['title' => 'Typ', 'type' => Xlsx::TEXT, 'width' => 16],
            ['title' => 'Producent', 'type' => Xlsx::TEXT, 'width' => 16],
            ['title' => 'Cena brutto (zł)', 'type' => Xlsx::MONEY, 'width' => 15],
            ['title' => 'Cena netto (zł)', 'type' => Xlsx::MONEY, 'width' => 15],
            ['title' => 'Cena na zapytanie', 'type' => Xlsx::TEXT, 'width' => 12],
            ['title' => 'Oryginalne brutto (zł)', 'type' => Xlsx::MONEY, 'width' => 15],
            ['title' => 'Zamienne brutto (zł)', 'type' => Xlsx::MONEY, 'width' => 15],
            ['title' => 'Kaucja (zł)', 'type' => Xlsx::MONEY, 'width' => 12],
            ['title' => 'Stan (szt.)', 'type' => Xlsx::INT, 'width' => 10],
            ['title' => 'Dostawa (h)', 'type' => Xlsx::TEXT, 'width' => 10],
            ['title' => 'Widoczny', 'type' => Xlsx::TEXT, 'width' => 10],
            ['title' => 'Źródło', 'type' => Xlsx::TEXT, 'width' => 10],
            ['title' => 'Numery OE', 'type' => Xlsx::TEXT, 'width' => 30],
            ['title' => 'Marki', 'type' => Xlsx::TEXT, 'width' => 30],
            ['title' => 'Kody silników', 'type' => Xlsx::TEXT, 'width' => 20],
            ['title' => 'Zdjęcie', 'type' => Xlsx::TEXT, 'width' => 40],
            ['title' => 'Opis', 'type' => Xlsx::TEXT, 'width' => 60],
            ['title' => 'Zmieniono', 'type' => Xlsx::TEXT, 'width' => 20],
        ];
        $data = array_map(static function (array $r): array {
            $gross = PricingService::priceFor($r, null);
            $net = $gross === null ? null : PricingService::line($gross, 0, 0.0, 1)['unitNet'];
            $variants = PricingService::variants($r);
            $variantGross = static fn(string $key): ?float => isset($variants[$key]['price_gross'])
                ? self::zl((int) $variants[$key]['price_gross']) : null;
            $image = ProductsService::imageUrl($r['image']);
            $lead = ProductsService::leadTimeHours($r);
            return [
                (string) $r['sku'],
                (string) $r['name'],
                $r['category'],
                $r['type'],
                $r['producer'],
                $gross === null ? null : self::zl($gross),
                $net === null ? null : self::zl($net),
                $gross === null ? 'tak' : 'nie',
                $variantGross('oryginalne'),
                $variantGross('zamienne'),
                self::zl((int) $r['deposit_gross']),
                ProductsService::stock($r),
                $lead === null ? 'auto' : (string) $lead,
                (int) $r['active'] === 1 ? 'tak' : 'nie',
                $r['source'] === 'manual' ? 'ręcznie' : 'import',
                self::list($r['oe_numbers']),
                self::list($r['makes']),
                self::list($r['engine_codes']),
                $image === null ? null : app_url($image),
                $r['description'],
                (string) ($r['updated_at'] ?? $r['imported_at']),
            ];
        }, $rows);

        return [
            'name' => 'Katalog_Catalog_' . gmdate('Y_m_d') . '.xlsx',
            'bytes' => Xlsx::build('Katalog', $columns, $data),
            'count' => count($rows),
        ];
    }

    private static function zl(int $grosze): float
    {
        return $grosze / 100;
    }

    /** JSON list column → 'a, b, c'. */
    private static function list(?string $json): string
    {
        $items = json_decode((string) $json, true);
        return is_array($items) ? implode(', ', array_map('strval', array_filter($items, 'is_scalar'))) : '';
    }
}
