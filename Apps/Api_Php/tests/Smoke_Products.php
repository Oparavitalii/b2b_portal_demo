<?php

declare(strict_types=1);

/** T-04 smoke: GET /api/products (+ /:sku) — login wall, OE search, filters, facets, pricing with discount. */
require __DIR__ . '/Harness.php';
require __DIR__ . '/Fixtures/products_fixture.php';

t_reset();
$fx = t_products_fixture();
$skus = static fn(array $r): array => array_column($r['json']['items'] ?? [], 'sku');

// --- PricingService::line / priceFor --------------------------------------
$l = PricingService::line(58800, 15000, 10.0, 3);
t_ok($l['unitGross'] === (int) round(58800 * 0.9) && $l['unitNet'] === (int) round($l['unitGross'] / 1.23), 'line(): discount on gross, net = round(gross/1.23)');
t_ok($l['unitDeposit'] === 15000 && $l['lineDeposit'] === 45000, 'line(): deposit never discounted, × qty');
t_ok($l['lineGross'] === $l['unitGross'] * 3 && $l['lineNet'] === $l['unitNet'] * 3 && $l['priceOnRequest'] === false, 'line(): line totals = unit × qty');
$p = PricingService::line(null, 30000, 10.0, 2);
t_ok($p['priceOnRequest'] === true && $p['unitGross'] === null && $p['lineNet'] === null && $p['unitDeposit'] === 30000, 'line(): price on request → null prices, flagged');
t_ok(PricingService::line(199999, 0, 0.0, 1)['unitNet'] === 162601, 'line(): 1999,99 zł brutto → 1626,01 zł netto');
$delphi = Db::one("SELECT * FROM products WHERE sku = 'R00002D'");
t_ok(PricingService::priceFor($delphi, 'oryginalne') === 80800 && PricingService::priceFor($delphi, 'zamienne') === 60500 && PricingService::priceFor($delphi, null) === 60500, 'priceFor(): variant prices from variants JSON');
try {
    PricingService::priceFor(Db::one("SELECT * FROM products WHERE sku = '095000-5800'"), 'oryginalne');
    t_ok(false, 'priceFor(): variant on a product without variants → 422 invalid_variant');
} catch (ApiError $e) {
    t_ok($e->status === 422 && $e->errorCode === 'invalid_variant', 'priceFor(): variant on a product without variants → 422 invalid_variant');
}
t_ok(Pricing_Service::line(100, 0, 0.0, 1)['unitGross'] === 100 && class_exists('Products_Service'), 'Pricing_Service / Products_Service aliases resolve');

// --- login wall -----------------------------------------------------------
t_ok(t_call('GET', '/api/products')['status'] === 401, 'guest GET /products → 401');
t_ok(t_call('GET', '/api/products/R00002D')['status'] === 401, 'guest GET /products/:sku → 401');

$customer = t_user('customer');
$tok = t_token($customer);
$admin = t_user('admin');
$adminTok = t_token($admin);

// --- list: active only, shape ----------------------------------------------
$r = t_call('GET', '/api/products', null, $tok);
t_ok($r['status'] === 200 && $r['json']['total'] === 5 && count($r['json']['items']) === 5, 'customer sees the 5 active products');
t_ok(!in_array('BX-OLD-01', $skus($r), true), 'inactive product is not listed');
t_ok($r['json']['page'] === 1 && $r['json']['pageSize'] === 24 && (float) $r['json']['discountPercent'] === 0.0, 'defaults page=1 pageSize=24, discount 0');
t_ok(t_call('GET', '/api/products', null, $adminTok)['json']['total'] === 5, 'admin sees the catalogue too');
$card = array_values(array_filter($r['json']['items'], static fn($i) => $i['sku'] === '095000-5800'))[0];
t_ok($card['imageUrl'] === '/img/products/Produkt_Denso_095000_5800.webp' && $card['producer'] === 'Denso' && $card['makes'] === ['Citroën', 'Fiat', 'Ford', 'Peugeot'], 'card: imageUrl, producer, makes');
t_ok($card['price'] === ['unitNet' => (int) round(58800 / 1.23), 'unitGross' => 58800, 'unitDeposit' => 15000] && $card['hasVariants'] === false && $card['variants'] === [], 'card: price net/gross/deposit without discount');

// --- stock + delivery time: products.stock / lead_time_hours set in the admin panel (default 4, auto) ---
$stock = [];
foreach ($r['json']['items'] as $i) {
    $stock[$i['sku']] = $i['stock'];
}
t_ok($stock['095000-5800'] === 10 && $stock['R00002D'] === 0 && $stock['BX-POMPA-01'] === 3, 'card: stock 10 / 0 / 3 from products.stock');
t_ok(array_key_exists('BX-ADBLUE-01', $stock) && $stock['BX-ADBLUE-01'] === 4, 'card: stock not set → schema default 4');
$lead = array_column($r['json']['items'], 'leadTimeHours', 'sku');
t_ok($lead['BX-POMPA-01'] === 48 && array_key_exists('095000-5800', $lead) && $lead['095000-5800'] === null, 'card: leadTimeHours 48 set by admin / null = automatic');

// --- OE search, normalised -------------------------------------------------
foreach (['0950005801', '095000-5801', '095000 5801', '0950-0058-01', ' 0950005801 '] as $q) {
    $r = t_call('GET', '/api/products', null, $tok, ['q' => $q]);
    t_ok($skus($r) === ['095000-5800'], "q '$q' finds 095000-5800 by OE (inactive match ignored)");
}
t_ok($skus(t_call('GET', '/api/products', null, $tok, ['q' => '6c1q9k546ac'])) === ['095000-5800'], 'OE with spaces in the source matches compact lowercase q');
t_ok($skus(t_call('GET', '/api/products', null, $tok, ['q' => '0445-010-507'])) === ['BX-POMPA-01'], 'q with dashes matches OE stored with spaces');
t_ok($skus(t_call('GET', '/api/products', null, $tok, ['q' => 'r00002d'])) === ['R00002D'], 'q matches SKU case-insensitively');
t_ok($skus(t_call('GET', '/api/products', null, $tok, ['q' => 'ADBLUE z modułem'])) === ['BX-ADBLUE-01'], 'q matches the name (unicode, case-insensitive)');
t_ok(t_call('GET', '/api/products', null, $tok, ['q' => 'nie-ma-takiego'])['json']['total'] === 0, 'unknown q → empty list');
t_ok(t_call('GET', '/api/products', null, $tok, ['q' => '%'])['json']['total'] === 0, "LIKE wildcard in q is escaped");

// --- filters + facets -----------------------------------------------------
$r = t_call('GET', '/api/products', null, $tok, ['category' => 'Pompy CR']);
t_ok($skus($r) === ['BX-POMPA-02', 'BX-POMPA-01'] || $skus($r) === ['BX-POMPA-01', 'BX-POMPA-02'], 'category filter');
$r = t_call('GET', '/api/products', null, $tok, ['make' => 'Ford']);
$got = $skus($r);
sort($got);
t_ok($got === ['095000-5800', 'BX-POMPA-01'], 'make filter (inactive Ford product excluded)');
t_ok($skus(t_call('GET', '/api/products', null, $tok, ['make' => 'mercedes-benz', 'category' => 'Zbiorniki AdBlue'])) === ['BX-ADBLUE-01'], 'make (case-insensitive) + category combined');
t_ok(t_call('GET', '/api/products', null, $tok, ['make' => 'Merc'])['json']['total'] === 0, 'make matches whole names only');
$r = t_call('GET', '/api/products', null, $tok);
t_ok($r['json']['facets']['categories'] === [
    ['value' => 'Pompy CR', 'count' => 2], ['value' => 'Wtryskiwacze', 'count' => 2], ['value' => 'Zbiorniki AdBlue', 'count' => 1],
], 'category facets with counts (active only)');
$makes = array_column($r['json']['facets']['makes'], 'count', 'value');
t_ok($makes['Ford'] === 2 && $makes['Mercedes-Benz'] === 2 && $makes['Toyota'] === 1 && count($makes) === 8, 'make facets with counts');
$r = t_call('GET', '/api/products', null, $tok, ['q' => 'pompa', 'category' => 'Pompy CR', 'make' => 'Toyota']);
t_ok($skus($r) === ['BX-POMPA-02'] && $r['json']['facets']['categories'] === [['value' => 'Pompy CR', 'count' => 2]], 'facets are computed over the q-filtered set');
t_ok(array_column($r['json']['facets']['makes'], 'value') === ['Ford', 'Toyota', 'Volvo'], 'make facets follow q');

// --- pagination + validation ----------------------------------------------
$r = t_call('GET', '/api/products', null, $tok, ['page' => '2', 'pageSize' => '2']);
t_ok($r['json']['total'] === 5 && count($r['json']['items']) === 2 && $r['json']['page'] === 2, 'pagination page 2 of size 2');
t_ok(t_call('GET', '/api/products', null, $tok, ['pageSize' => '500'])['status'] === 400, 'pageSize > 100 → 400');
t_ok(t_call('GET', '/api/products', null, $tok, ['page' => '9223372036854775807'])['status'] === 400, 'D-04: huge page → 400, not 500');
t_ok(t_call('GET', '/api/products', null, $tok, ['page' => '1000001'])['status'] === 400, 'D-04: page > 1000000 → 400');

// --- discount 10% ---------------------------------------------------------
Db::update('users', ['discount_percent' => 10], ['id' => $customer['id']]);
$r = t_call('GET', '/api/products', null, $tok, ['q' => '0950005801']);
$c = $r['json']['items'][0];
$g = (int) round(58800 * 0.9);
t_ok((float) $r['json']['discountPercent'] === 10.0 && $c['price']['unitGross'] === $g && $c['price']['unitNet'] === (int) round($g / 1.23), 'discount 10%: unitGross = round(gross×0.9), unitNet = round(unitGross/1.23)');
t_ok($c['price']['unitDeposit'] === 15000, 'discount 10%: deposit unchanged');
t_ok($c['price']['listGross'] === 58800 && $c['price']['listNet'] === (int) round(58800 / 1.23), 'discount 10%: list price before the discount');

// --- variants + price on request -----------------------------------------
$d = t_call('GET', '/api/products/R00002D', null, $tok);
t_ok($d['status'] === 200 && $d['json']['hasVariants'] === true, 'detail: product with variants');
$v = array_column($d['json']['variants'], 'price', 'key');
t_ok($v['oryginalne']['unitGross'] === (int) round(80800 * 0.9) && $v['zamienne']['unitGross'] === (int) round(60500 * 0.9), 'variant prices with discount');
t_ok($v['oryginalne']['unitNet'] === (int) round(round(80800 * 0.9) / 1.23), 'variant net price');
t_ok($v['oryginalne']['listGross'] === 80800 && $v['zamienne']['listGross'] === 60500, 'variant list prices before the discount');
t_ok((float) $d['json']['discountPercent'] === 10.0 && $d['json']['oeNumbers'] === ['28342997', 'A6510704987', 'R00002D'], 'detail: discountPercent + oeNumbers');
t_ok($d['json']['applications'][0] === ['marka' => 'Mercedes-Benz', 'model' => 'Sprinter', 'silnik' => '2.1 CDI', 'lata' => 'od 2009'], 'detail: applications');
t_ok($d['json']['engineCodes'] === ['OM651.911'] && $d['json']['attributes']['stan'] === 'Regenerowany', 'detail: engine codes + attributes');
$d = t_call('GET', '/api/products/BX-ADBLUE-01', null, $tok);
t_ok($d['status'] === 200 && $d['json']['priceOnRequest'] === true && $d['json']['price'] === null && $d['json']['imageUrl'] === null, 'price on request → price null');
t_ok(str_contains($d['body'], '"attributes":{}'), 'detail: empty attributes is {} in JSON');
t_ok(t_call('GET', '/api/products/' . rawurlencode('095000-5800'), null, $tok)['json']['sku'] === '095000-5800', 'detail by SKU with a dash');
t_ok(t_call('GET', '/api/products/BX-OLD-01', null, $tok)['status'] === 404, 'inactive product detail → 404');
t_ok(t_call('GET', '/api/products/NOPE', null, $tok)['status'] === 404, 'unknown SKU → 404');
