<?php

declare(strict_types=1);

/**
 * Test fixture: inserts catalogue rows straight into `products` (independent
 * of the JSON importer). Shapes follow Schema.sql: money in grosze,
 * oe_search = normalised OE numbers + SKU, make_search = lowercase makes '|'.
 *
 * Five active products — one per category, one with variants, one price on
 * request — plus one inactive product that must never be listed.
 *
 * @return array<string,array> rows by SKU, as inserted
 */
function t_products_fixture(): array
{
    $rows = [
        [
            'sku' => '095000-5800',
            'name' => 'Wtryskiwacz Denso 095000-5800 — regenerowany',
            'category' => 'Wtryskiwacze',
            'type' => 'Wtryskiwacz CR',
            'producer' => 'Denso',
            'oe' => ['095000-5800', '0950005801', '6C1Q 9K546 AC', '1980T7'],
            'makes' => ['Citroën', 'Fiat', 'Ford', 'Peugeot'],
            'engine_codes' => ['P8FA', 'QVFA'],
            'applications' => [
                ['marka' => 'Ford', 'model' => 'Transit Mk7', 'silnik' => '2.2 TDCi (P8FA), 63 kW', 'lata' => '2006–2014'],
                ['marka' => 'Fiat', 'model' => 'Ducato III (X250)', 'silnik' => '2.2 D Multijet, 74 kW', 'lata' => 'od 2006'],
            ],
            'price_gross' => 58800,
            'price_on_request' => 0,
            'deposit_gross' => 15000,
            'variants' => null,
            'image' => 'Produkt_Denso_095000_5800.webp',
            'description' => 'Regenerowany wtryskiwacz Common Rail.',
            'attributes' => ['typ' => 'Wtryskiwacz CR', 'stan' => 'Regenerowany', 'gwarancja' => '12 miesięcy', 'stanMagazynowy' => 10],
            'stock' => 10,
            'active' => 1,
        ],
        [
            'sku' => 'R00002D',
            'name' => 'Wtryskiwacz CR Delphi R00002D — regenerowany',
            'category' => 'Wtryskiwacze',
            'type' => 'Wtryskiwacz CR',
            'producer' => 'Delphi',
            'oe' => ['28342997', 'A6510704987', 'R00002D'],
            'makes' => ['Jeep', 'Mercedes-Benz'],
            'engine_codes' => ['OM651.911'],
            'applications' => [['marka' => 'Mercedes-Benz', 'model' => 'Sprinter', 'silnik' => '2.1 CDI', 'lata' => 'od 2009']],
            'price_gross' => 60500,
            'price_on_request' => 0,
            'deposit_gross' => 15000,
            'variants' => ['oryginalne' => ['price_gross' => 80800], 'zamienne' => ['price_gross' => 60500]],
            'image' => 'Produkt_Delphi_R00002D.webp',
            'description' => 'Wtryskiwacz Delphi w dwóch wersjach.',
            'attributes' => ['typ' => 'Wtryskiwacz CR', 'stan' => 'Regenerowany', 'stanMagazynowy' => 0],
            'stock' => 0,
            'active' => 1,
        ],
        [
            'sku' => 'BX-POMPA-01',
            'name' => 'Pompa wtryskowa CR Bosch — regenerowana',
            'category' => 'Pompy CR',
            'type' => 'Pompa CR',
            'producer' => 'Bosch',
            'oe' => ['0 445 010 507', '0445010507'],
            'makes' => ['Ford', 'Volvo'],
            'engine_codes' => [],
            'applications' => [],
            'price_gross' => 199999,
            'price_on_request' => 0,
            'deposit_gross' => 50000,
            'variants' => null,
            'image' => 'Produkt_Bosch_Pompa.webp',
            'description' => null,
            'attributes' => ['typ' => 'Pompa CR', 'stanMagazynowy' => ' 3 '],
            'stock' => 3,
            'lead_time_hours' => 48,
            'active' => 1,
        ],
        [
            'sku' => 'BX-ADBLUE-01',
            'name' => 'Zbiornik AdBlue z modułem — regenerowany',
            'category' => 'Zbiorniki AdBlue',
            'type' => 'Zbiornik AdBlue',
            'producer' => 'Continental',
            'oe' => ['A9064900120'],
            'makes' => ['Mercedes-Benz'],
            'engine_codes' => [],
            'applications' => [],
            'price_gross' => null,
            'price_on_request' => 1,
            'deposit_gross' => 30000,
            'variants' => null,
            'image' => null,
            'description' => null,
            'attributes' => [],
            'active' => 1,
        ],
        [
            'sku' => 'BX-POMPA-02',
            'name' => 'Pompa wysokiego ciśnienia Denso — regenerowana',
            'category' => 'Pompy CR',
            'type' => 'Pompa CR',
            'producer' => 'Denso',
            'oe' => ['294000-0039'],
            'makes' => ['Toyota'],
            'engine_codes' => [],
            'applications' => [],
            'price_gross' => 150000,
            'price_on_request' => 0,
            'deposit_gross' => 0,
            'variants' => null,
            'image' => 'Produkt_Denso_Pompa.webp',
            'description' => null,
            'attributes' => [],
            'active' => 1,
        ],
        [
            'sku' => 'BX-OLD-01',
            'name' => 'Wycofany wtryskiwacz Ford',
            'category' => 'Wtryskiwacze',
            'type' => 'Wtryskiwacz CR',
            'producer' => 'Denso',
            'oe' => ['0950005801-OLD'],
            'makes' => ['Ford'],
            'engine_codes' => [],
            'applications' => [],
            'price_gross' => 10000,
            'price_on_request' => 0,
            'deposit_gross' => 0,
            'variants' => null,
            'image' => null,
            'description' => null,
            'attributes' => [],
            'active' => 0,
        ],
    ];

    $out = [];
    foreach ($rows as $r) {
        $oeSearch = array_map([ProductsService::class, 'normalizeOe'], array_merge($r['oe'], [$r['sku']]));
        $row = [
            'sku' => $r['sku'],
            'name' => $r['name'],
            'category' => $r['category'],
            'type' => $r['type'],
            'producer' => $r['producer'],
            'oe_numbers' => json_encode($r['oe'], JSON_UNESCAPED_UNICODE),
            'oe_search' => implode(' ', array_unique($oeSearch)),
            'makes' => json_encode($r['makes'], JSON_UNESCAPED_UNICODE),
            'make_search' => implode('|', array_map(static fn($m) => mb_strtolower($m, 'UTF-8'), $r['makes'])),
            'engine_codes' => json_encode($r['engine_codes'], JSON_UNESCAPED_UNICODE),
            'applications' => json_encode($r['applications'], JSON_UNESCAPED_UNICODE),
            'price_gross' => $r['price_gross'],
            'price_on_request' => $r['price_on_request'],
            'deposit_gross' => $r['deposit_gross'],
            'variants' => $r['variants'] === null ? null : json_encode($r['variants'], JSON_UNESCAPED_UNICODE),
            'image' => $r['image'],
            'description' => $r['description'],
            'attributes' => json_encode($r['attributes'] === [] ? new stdClass() : $r['attributes'], JSON_UNESCAPED_UNICODE),
            'active' => $r['active'],
            // Schema default 4 pieces / automatic delivery time unless the record sets them.
            'stock' => $r['stock'] ?? 4,
            'lead_time_hours' => $r['lead_time_hours'] ?? null,
        ];
        Db::insert('products', $row);
        $out[$r['sku']] = $row;
    }
    return $out;
}
