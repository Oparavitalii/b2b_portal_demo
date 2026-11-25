<?php

declare(strict_types=1);

/**
 * Pilot_Run 2026-10-10 smoke: admin product editing — edit, add by hand, stock (default 4),
 * delivery time 24/48/72, photo upload; the import keeps all of it; the client sees it.
 */
require __DIR__ . '/Harness.php';
require __DIR__ . '/Fixtures/products_fixture.php';

/** Raw image upload (t_call only sends JSON). */
function t_upload(string $sku, string $bytes, string $token): array
{
    $req = t_request('POST', '/api/admin/products/' . rawurlencode($sku) . '/image');
    $req->headers['authorization'] = 'Bearer ' . $token;
    $req->headers['content-type'] = 'image/png';
    $req->rawBody = $bytes;
    $res = Router::dispatch($req);
    return ['status' => $res->status, 'json' => json_decode($res->body, true)];
}

t_reset();
$admin = t_user('admin');
$customer = t_user('customer');
$adminToken = t_token($admin);
$customerToken = t_token($customer);
$sample = json_decode((string) file_get_contents(__DIR__ . '/Fixtures/Products_Data_Sample.json'), true, 64, JSON_THROW_ON_ERROR);
$sku = '095000-5800';
$path = '/api/admin/products/' . rawurlencode($sku);
$png = "\x89PNG\r\n\x1A\n" . str_repeat("\0", 32);

// ---------- guards ----------
foreach ([['GET', $path, null], ['PATCH', $path, ['stock' => 1]], ['POST', '/api/admin/products', ['sku' => 'X', 'name' => 'X']],
    ['GET', '/api/admin/products/options', null], ['DELETE', $path . '/image', null]] as [$m, $p, $b]) {
    t_ok(t_call($m, $p, $b, $customerToken)['status'] === 403, "customer → 403 on $m $p");
    t_ok(t_call($m, $p, $b)['status'] === 401, "guest → 401 on $m $p");
}

// ---------- defaults by category: injectors 4 pieces / automatic, pumps and AdBlue tanks 1 piece / 72 h ----------
t_ok(t_call('POST', '/api/admin/products/import', $sample, $adminToken)['status'] === 200, 'import sample');
$rows = Db::all('SELECT category, stock, lead_time_hours, source FROM products');
$byCategory = static fn(bool $toOrder): array => array_values(array_unique(array_map(
    static fn($r) => [(int) $r['stock'], $r['lead_time_hours'] === null ? null : (int) $r['lead_time_hours']],
    array_filter($rows, static fn($r) => in_array($r['category'], ProductsService::TO_ORDER_CATEGORIES, true) === $toOrder),
), SORT_REGULAR));
t_ok($byCategory(false) === [[4, null]], 'imported injectors start with stock 4, automatic time (stanMagazynowy in the file is ignored)');
t_ok($byCategory(true) === [[1, 72]], 'imported pumps start with stock 1, 72 h');
t_ok(array_unique(array_column($rows, 'source')) === ['import'], 'source import');

// The migration moves only rows still on the old default (4 pieces, automatic).
Db::insert('products', ['sku' => 'BX-MIG-1', 'name' => 'Pompa', 'category' => 'Pompy CR', 'imported_at' => now_iso()]);
Db::insert('products', ['sku' => 'BX-MIG-2', 'name' => 'Zbiornik', 'category' => 'Zbiorniki AdBlue', 'stock' => 7, 'imported_at' => now_iso()]);
Db::insert('products', ['sku' => 'BX-MIG-3', 'name' => 'Wtryskiwacz', 'category' => 'Wtryskiwacze', 'imported_at' => now_iso()]);
Db::pdo()->exec((string) file_get_contents(dirname(__DIR__) . '/database/Schema_Product_Defaults.sql'));
$mig = array_column(Db::all("SELECT sku, stock || '/' || coalesce(lead_time_hours, 'auto') AS v FROM products WHERE sku LIKE 'BX-MIG-%'"), 'v', 'sku');
t_ok($mig === ['BX-MIG-1' => '1/72', 'BX-MIG-2' => '7/auto', 'BX-MIG-3' => '4/auto'], 'migration: untouched pump → 1 / 72 h; edited tank and injector unchanged');
Db::exec("DELETE FROM products WHERE sku LIKE 'BX-MIG-%'");

// ---------- list + detail ----------
$list = t_call('GET', '/api/admin/products', null, $adminToken)['json']['items'];
$item = array_values(array_filter($list, static fn($i) => $i['sku'] === $sku))[0];
t_ok($item['stock'] === 4 && $item['leadTimeHours'] === null && $item['source'] === 'import', 'admin list: stock, leadTimeHours, source');
$d = t_call('GET', $path, null, $adminToken);
t_ok($d['status'] === 200 && $d['json']['sku'] === $sku && $d['json']['priceGross'] === 58800 && $d['json']['stock'] === 4, 'GET /admin/products/:sku → editable record');
t_ok(t_call('GET', '/api/admin/products/NIE-MA', null, $adminToken)['status'] === 404, 'unknown sku → 404');
$opt = t_call('GET', '/api/admin/products/options', null, $adminToken)['json'];
t_ok(in_array('Wtryskiwacze', $opt['categories'], true) && $opt['makes'] !== [], 'options: categories and makes in use');

// ---------- edit ----------
$r = t_call('PATCH', $path, ['stock' => 12, 'leadTimeHours' => 48, 'name' => 'Wtryskiwacz Denso (edytowany)', 'priceGross' => 61000,
    'oeNumbers' => ['NOWY-OE-77'], 'makes' => ['Toyota', 'Lexus']], $adminToken);
t_ok($r['status'] === 200 && $r['json']['stock'] === 12 && $r['json']['leadTimeHours'] === 48 && $r['json']['priceGross'] === 61000
    && $r['json']['name'] === 'Wtryskiwacz Denso (edytowany)', 'PATCH: stock, delivery time, name, price');
t_ok(t_call('PATCH', $path, ['leadTimeHours' => 36], $adminToken)['status'] === 422, 'leadTimeHours outside 24/48/72 → 422');
t_ok(t_call('PATCH', $path, ['stock' => -1], $adminToken)['status'] === 400, 'negative stock → 400');
t_ok(t_call('PATCH', $path, ['priceGross' => null], $adminToken)['status'] === 422, 'priced product without a price → 422 price_required');
$audit = Db::one("SELECT * FROM audit_log WHERE action = 'product_update' AND entity_id = ?", [$sku]);
t_ok($audit !== null && json_decode((string) $audit['new_value'], true)['stock'] === 12, 'audit log: product_update with new values');

// ---------- the client sees it ----------
$c = t_call('GET', '/api/products/' . rawurlencode($sku), null, $customerToken)['json'];
t_ok($c['stock'] === 12 && $c['leadTimeHours'] === 48 && $c['name'] === 'Wtryskiwacz Denso (edytowany)', 'client product page: new stock, time, name');
$search = t_call('GET', '/api/products', null, $customerToken, ['q' => 'nowy-oe-77'])['json']['items'];
t_ok(count($search) === 1 && $search[0]['sku'] === $sku, 'client search finds the new OE number');
t_ok(t_call('GET', '/api/products', null, $customerToken, ['make' => 'Lexus'])['json']['total'] === 1, 'client make filter sees the new make');

// ---------- add by hand ----------
$new = ['sku' => 'BX-RECZNY-01', 'name' => 'Pompa dodana ręcznie', 'category' => 'Pompy CR', 'priceGross' => 125000, 'depositGross' => 20000];
$r = t_call('POST', '/api/admin/products', $new, $adminToken);
t_ok($r['status'] === 201 && $r['json']['source'] === 'manual' && $r['json']['stock'] === 1 && $r['json']['active'] === true
    && $r['json']['leadTimeHours'] === 72 && $r['json']['priceOnRequest'] === false, 'POST: manual pump, 1 piece / 72 h, active');
$r = t_call('POST', '/api/admin/products', ['sku' => 'BX-RECZNY-02', 'name' => 'Wtryskiwacz dodany ręcznie', 'category' => 'Wtryskiwacze', 'priceGross' => 50000], $adminToken);
t_ok($r['status'] === 201 && $r['json']['stock'] === 4 && $r['json']['leadTimeHours'] === null, 'POST: manual injector, 4 pieces, automatic time');
t_ok(t_call('POST', '/api/admin/products', $new, $adminToken)['status'] === 409, 'same SKU again → 409 sku_taken');
t_ok(t_call('POST', '/api/admin/products', ['sku' => 'A/B', 'name' => 'x'], $adminToken)['status'] === 400, 'SKU with a slash → 400');
t_ok(t_call('POST', '/api/admin/products', ['sku' => 'BX-BEZ-NAZWY'], $adminToken)['status'] === 400, 'no name → 400');
$r = t_call('POST', '/api/admin/products', ['sku' => 'BX-ZAPYTANIE', 'name' => 'Na zapytanie', 'stock' => 0, 'leadTimeHours' => 72], $adminToken);
t_ok($r['status'] === 201 && $r['json']['priceOnRequest'] === true && $r['json']['priceGross'] === null && $r['json']['stock'] === 0, 'POST without price → price on request');
$c = t_call('GET', '/api/products', null, $customerToken, ['q' => 'BX-RECZNY-01'])['json']['items'];
t_ok(count($c) === 1 && $c[0]['price']['unitGross'] === 125000, 'client sees the manual product with its price');
$cart = t_call('PUT', '/api/cart/items', ['sku' => 'BX-RECZNY-01', 'variant' => null, 'qty' => 2], $customerToken);
t_ok($cart['status'] === 200, 'manual product goes into the cart');

// ---------- photo ----------
$r = t_upload($sku, $png, $adminToken);
$image = $r['json']['image'] ?? '';
t_ok($r['status'] === 200 && str_starts_with($image, 'upload/') && str_starts_with((string) $r['json']['imageUrl'], '/api/media/products/'), 'upload png → upload/<file>');
$file = substr($image, strlen('upload/'));
$m = t_call('GET', '/api/media/products/' . $file);
t_ok($m['status'] === 200 && $m['body'] === $png && $m['headers']['Content-Type'] === 'image/png', 'GET /api/media/products/:file serves it without login');
t_ok(t_upload($sku, 'GIF89a not allowed', $adminToken)['status'] === 422, 'not jpg/png/webp → 422 invalid_image');
t_ok(t_call('GET', '/api/media/products/..%2F..%2Fkatalog.sqlite')['status'] === 404, 'media path traversal → 404');
$second = t_upload($sku, $png, $adminToken)['json']['image'];
t_ok(t_call('GET', '/api/media/products/' . $file)['status'] === 404 && $second !== $image, 'new photo replaces and deletes the old file');

// ---------- the import keeps the admin's work ----------
$r = t_call('POST', '/api/admin/products/import', $sample, $adminToken);
t_ok($r['status'] === 200 && $r['json']['deactivated'] === 0, 'import again: manual products are not hidden');
$p = Db::one('SELECT * FROM products WHERE sku = ?', [$sku]);
t_ok((int) $p['stock'] === 12 && (int) $p['lead_time_hours'] === 48, 'import keeps stock and delivery time');
t_ok($p['image'] === $second, 'import keeps the photo uploaded in the panel');
t_ok($p['name'] !== 'Wtryskiwacz Denso (edytowany)', 'import still updates the other fields from the file');
t_ok((int) Db::val("SELECT active FROM products WHERE sku = 'BX-RECZNY-01'") === 1, 'manual product still active after import');

// ---------- hide / remove photo ----------
t_ok(t_call('PATCH', '/api/admin/products/BX-RECZNY-01', ['active' => false], $adminToken)['json']['active'] === false, 'PATCH active false hides');
t_ok(t_call('GET', '/api/products/BX-RECZNY-01', null, $customerToken)['status'] === 404, 'hidden product → 404 for the client');
t_ok(t_call('PATCH', $path, ['active' => false], $adminToken)['status'] === 200, 'admin hides an imported product');
t_call('POST', '/api/admin/products/import', $sample, $adminToken);
t_ok((int) Db::val('SELECT active FROM products WHERE sku = ?', [$sku]) === 0, 'import keeps a product the admin hid hidden');
t_call('PATCH', $path, ['active' => true], $adminToken);
t_call('POST', '/api/admin/products/import', $sample, $adminToken);
t_ok((int) Db::val('SELECT active FROM products WHERE sku = ?', [$sku]) === 1, 'shown again by the admin → import keeps it shown');
t_ok(t_call('POST', '/api/admin/products', ['sku' => 'options', 'name' => 'x'], $adminToken)['status'] === 422, "SKU 'options' is reserved → 422");
$r = t_call('DELETE', $path . '/image', null, $adminToken);
t_ok($r['status'] === 200 && $r['json']['image'] === null && $r['json']['imageUrl'] === null, 'DELETE image → no photo');

// ---------- bulk edit: one change for many products ----------
$bulk = '/api/admin/products/bulk';
t_ok(t_call('POST', $bulk, ['skus' => [$sku], 'stock' => 1], $customerToken)['status'] === 403 && t_call('GET', '/api/admin/products/skus')['status'] === 401, 'bulk and skus are admin only');
$all = t_call('GET', '/api/admin/products/skus', null, $adminToken)['json']['skus'];
t_ok(count($all) === (int) Db::val('SELECT COUNT(*) FROM products') && in_array('BX-RECZNY-01', $all, true), 'skus without q → every product, hidden ones too');
t_ok(t_call('GET', '/api/admin/products/skus', null, $adminToken, ['q' => 'ręcznie'])['json']['skus'] === ['BX-RECZNY-01', 'BX-RECZNY-02'], 'skus with q → the same matches as the list');
t_ok(t_call('GET', '/api/admin/products/skus', null, $adminToken, ['q' => 'ręcznie', 'category' => 'Wtryskiwacze'])['json']['skus'] === ['BX-RECZNY-02'], 'skus with q + category → only that category');
$list = t_call('GET', '/api/admin/products', null, $adminToken, ['category' => 'Pompy CR', 'pageSize' => 100])['json'];
t_ok($list['total'] === (int) Db::val("SELECT COUNT(*) FROM products WHERE category = 'Pompy CR'") && array_unique(array_column($list['items'], 'category')) === ['Pompy CR'], 'list with category → only that category');

$r = t_call('POST', $bulk, ['skus' => [$sku, 'BX-RECZNY-01', 'NIE-MA'], 'stock' => 9, 'leadTimeHours' => 24], $adminToken);
t_ok($r['status'] === 200 && $r['json'] === ['updated' => 2, 'notFound' => 1, 'priceSkipped' => 0], 'bulk stock + time: 2 updated, unknown SKU counted');
$rows = Db::all("SELECT stock || '/' || lead_time_hours AS v FROM products WHERE sku IN (?, 'BX-RECZNY-01')", [$sku]);
t_ok(array_column($rows, 'v') === ['9/24', '9/24'] && (int) Db::val("SELECT stock FROM products WHERE sku = 'BX-RECZNY-02'") === 4, 'bulk changed the chosen products only');
t_call('POST', $bulk, ['skus' => [$sku], 'leadTimeHours' => null], $adminToken);
t_ok(Db::val('SELECT lead_time_hours FROM products WHERE sku = ?', [$sku]) === null && (int) Db::val('SELECT stock FROM products WHERE sku = ?', [$sku]) === 9, 'bulk leadTimeHours null → automatic, stock untouched');

// Price: +10 % moves the price and both versions; a price on request is skipped.
$before = Db::one("SELECT price_gross, variants FROM products WHERE sku = 'R00002D'");
$r = t_call('POST', $bulk, ['skus' => ['R00002D', 'BX-RECZNY-01', 'BX-ZAPYTANIE'], 'pricePercent' => 10], $adminToken);
$after = Db::one("SELECT price_gross, variants FROM products WHERE sku = 'R00002D'");
$v0 = json_decode((string) $before['variants'], true);
$v1 = json_decode((string) $after['variants'], true);
t_ok($r['json'] === ['updated' => 2, 'notFound' => 0, 'priceSkipped' => 1] && (int) Db::val("SELECT price_gross FROM products WHERE sku = 'BX-RECZNY-01'") === 137500, 'bulk +10 %: 1250,00 → 1375,00; price on request skipped');
t_ok((int) $after['price_gross'] === (int) round($before['price_gross'] * 1.1)
    && $v1['oryginalne']['price_gross'] === (int) round($v0['oryginalne']['price_gross'] * 1.1)
    && $v1['zamienne']['price_gross'] === (int) round($v0['zamienne']['price_gross'] * 1.1), 'bulk +10 % also moves the oryginalne / zamienne prices');
$r = t_call('POST', $bulk, ['skus' => ['BX-ZAPYTANIE', 'BX-RECZNY-02'], 'priceGross' => 99900], $adminToken);
t_ok($r['json']['updated'] === 2 && Db::all("SELECT price_gross, price_on_request FROM products WHERE sku IN ('BX-ZAPYTANIE', 'BX-RECZNY-02')")
    === [['price_gross' => 99900, 'price_on_request' => 0], ['price_gross' => 99900, 'price_on_request' => 0]], 'bulk priceGross sets the price, also on a product that was on request');
$c = t_call('GET', '/api/products/BX-RECZNY-02', null, $customerToken)['json'];
t_ok($c['price']['unitGross'] === 99900 && $c['stock'] === 4, 'the client sees the bulk price');

t_ok(t_call('POST', $bulk, ['skus' => [$sku]], $adminToken)['json']['error'] === 'nothing_to_change', 'bulk without a change → 422 nothing_to_change');
t_ok(t_call('POST', $bulk, ['skus' => [$sku], 'priceGross' => 100, 'pricePercent' => 5], $adminToken)['json']['error'] === 'price_conflict', 'priceGross + pricePercent → 422 price_conflict');
t_ok(t_call('POST', $bulk, ['skus' => [$sku], 'leadTimeHours' => 36], $adminToken)['status'] === 422, 'bulk leadTimeHours 36 → 422');
t_ok(t_call('POST', $bulk, ['skus' => [], 'stock' => 1], $adminToken)['status'] === 400 && t_call('POST', $bulk, ['skus' => [$sku], 'stock' => -1], $adminToken)['status'] === 400, 'no SKUs / negative stock → 400');
t_ok((int) Db::val('SELECT stock FROM products WHERE sku = ?', [$sku]) === 9, 'a refused bulk edit changes nothing');
$audit = Db::one("SELECT new_value FROM audit_log WHERE action = 'products_bulk_update' ORDER BY created_at LIMIT 1");
$log = json_decode((string) $audit['new_value'], true);
t_ok($log['stock'] === 9 && $log['updated'] === 2 && $log['skus'] === [$sku, 'BX-RECZNY-01', 'NIE-MA'], 'audit log: products_bulk_update with the change and the SKUs');
t_ok(t_call('POST', '/api/admin/products', ['sku' => 'bulk', 'name' => 'x'], $adminToken)['status'] === 422, "SKU 'bulk' is reserved → 422");
