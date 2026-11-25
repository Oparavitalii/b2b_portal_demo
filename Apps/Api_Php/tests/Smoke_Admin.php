<?php

declare(strict_types=1);

/** T-05 smoke: /api/admin/products (import + preview) and /api/admin/customers (discount). */
require __DIR__ . '/Harness.php';

t_reset();
$admin = t_user('admin');
$customer = t_user('customer', ['company_name' => 'Warsztat Diesel Kowalski', 'nip' => '1234567890']);
$adminToken = t_token($admin);
$customerToken = t_token($customer);
$sample = json_decode((string) file_get_contents(__DIR__ . '/Fixtures/Products_Data_Sample.json'), true, 64, JSON_THROW_ON_ERROR);
$skus = array_map(static fn(array $p) => $p['sku'], $sample['produkty']);

// ---------- guards ----------
$guarded = [
    ['POST', '/api/admin/products/import', $sample],
    ['GET', '/api/admin/products', null],
    ['GET', '/api/admin/customers', null],
    ['PATCH', '/api/admin/customers/' . $customer['id'], ['discountPercent' => 5]],
    ['POST', '/api/admin/customers/' . $customer['id'] . '/block', null],
    ['POST', '/api/admin/customers/' . $customer['id'] . '/unblock', null],
    ['DELETE', '/api/admin/customers/' . $customer['id'], null],
    ['GET', '/api/admin/orders', null],
    ['GET', '/api/admin/orders/' . uuid4(), null],
];
foreach ($guarded as [$m, $p, $b]) {
    t_ok(t_call($m, $p, $b, $customerToken)['status'] === 403, "customer → 403 on $m $p");
    t_ok(t_call($m, $p, $b)['status'] === 401, "guest → 401 on $m $p");
}
t_ok((int) Db::val('SELECT COUNT(*) FROM products') === 0, 'forbidden import wrote nothing');

// ---------- import ----------
$r = t_call('POST', '/api/admin/products/import', $sample, $adminToken);
t_ok($r['status'] === 200 && $r['json'] === ['created' => 4, 'updated' => 0, 'deactivated' => 0, 'skipped' => []], 'import sample → created 4');
$p = Db::one('SELECT * FROM products WHERE sku = ?', ['095000-5800']);
t_ok((int) $p['price_gross'] === 58800, "cena '588' → 58800 grosze");
t_ok((int) $p['deposit_gross'] === 15000, "kaucjaPln '150' → 15000 grosze");
t_ok((int) $p['price_on_request'] === 0 && (int) $p['active'] === 1, 'priced product: not on request, active');
t_ok($p['category'] === 'Wtryskiwacze' && $p['type'] === 'Wtryskiwacz CR' && $p['producer'] === 'Denso'
    && $p['image'] === 'Produkt_Denso_095000_5800.webp', 'kategoria/typ/producent/obraz mapped');
$oe = explode(' ', $p['oe_search']);
t_ok(in_array('0950005800', $oe, true) && !str_contains($p['oe_search'], '-'), 'oe_search: normalised sku, no dashes');
$expectedMakes = array_map(static fn(string $m) => mb_strtolower($m, 'UTF-8'), $sample['produkty'][0]['markaPojazdu']);
t_ok($p['make_search'] === implode('|', $expectedMakes) && json_decode($p['makes'], true) === $sample['produkty'][0]['markaPojazdu'], 'makes + make_search');
$pump = Db::one('SELECT * FROM products WHERE sku = ?', ['0445010507']);
t_ok((int) $pump['price_gross'] === 186900 && (int) $pump['deposit_gross'] === 56400, "'1869.00' → 186900, '564' → 56400");
$apps = json_decode($pump['applications'], true);
t_ok(is_array($apps) && $apps !== [] && array_keys($apps[0]) === ['marka', 'model', 'silnik', 'lata'], 'zastosowanie → applications tuples');
$delphi = Db::one('SELECT * FROM products WHERE sku = ?', ['R00002D']);
t_ok(json_decode((string) $delphi['variants'], true) === ['oryginalne' => ['price_gross' => 80800], 'zamienne' => ['price_gross' => 60500]], 'wersje stored as variants {price_gross}');
t_ok(str_contains((string) $delphi['description'], 'kodu korekcyjnego'), 'infoDodatkowe → description');
$attrs = json_decode($delphi['attributes'], true);
t_ok(($attrs['segment'] ?? null) === 'Samochody osobowe' && ($attrs['stanMagazynowy'] ?? null) === 10
    && ($attrs['wymienioneCzesci'] ?? null) === ['rozpylacz', 'zawór sterujący', 'komplet uszczelnień']
    && !isset($attrs['obrazZrodlowy']) && !isset($attrs['cena']), 'remaining fields → attributes (no internal / mapped keys)');
$onReq = Db::one('SELECT * FROM products WHERE sku = ?', ['0445117010']);
t_ok($onReq['price_gross'] === null && (int) $onReq['price_on_request'] === 1 && (int) $onReq['deposit_gross'] === 15000, 'cenaNaZapytanie → price NULL, flag 1');
$pumpAttrs = json_decode($pump['attributes'], true);
t_ok(str_ends_with((string) ($pumpAttrs['wymiary'] ?? ''), ' cm') || !isset($pumpAttrs['wymiary']), 'wymiary flattened to text');

// ---------- re-import ----------
$r = t_call('POST', '/api/admin/products/import', $sample, $adminToken);
t_ok($r['json'] === ['created' => 0, 'updated' => 4, 'deactivated' => 0, 'skipped' => []], 're-import → updated 4, created 0');
t_ok((int) Db::val('SELECT COUNT(*) FROM products') === 4, 'no duplicate rows');

// ---------- deactivation ----------
$less = $sample;
array_pop($less['produkty']);
$r = t_call('POST', '/api/admin/products/import', $less, $adminToken);
t_ok($r['json'] === ['created' => 0, 'updated' => 3, 'deactivated' => 1, 'skipped' => []], 'import without one record → deactivated 1');
t_ok((int) Db::val('SELECT active FROM products WHERE sku = ?', ['0445117010']) === 0, 'missing product active = 0 (kept, not deleted)');
$r = t_call('POST', '/api/admin/products/import', $sample, $adminToken);
t_ok($r['json']['deactivated'] === 0 && (int) Db::val('SELECT active FROM products WHERE sku = ?', ['0445117010']) === 1, 'back in the file → active again');

// ---------- invalid records ----------
$bad = $sample;
$bad['produkty'][] = ['nazwa' => 'Bez SKU'];
$bad['produkty'][] = ['sku' => 'BX-NONAME'];
$bad['produkty'][] = $sample['produkty'][0];
$bad['produkty'][] = ['sku' => 'BX-BADPRICE', 'nazwa' => 'Zła cena', 'cena' => 'abc'];
$r = t_call('POST', '/api/admin/products/import', $bad, $adminToken);
$sk = $r['json']['skipped'] ?? [];
t_ok($r['status'] === 200 && $r['json']['updated'] === 4 && $r['json']['created'] === 0 && count($sk) === 4, 'invalid records skipped, valid ones imported');
t_ok(str_contains($sk[0], 'brak SKU') && str_contains($sk[1], 'brak nazwy') && str_contains($sk[2], 'powtórzony SKU')
    && str_contains($sk[3], 'nieprawidłowa kwota'), 'skipped reasons in Polish');
t_ok(Db::val('SELECT 1 FROM products WHERE sku = ?', ['BX-BADPRICE']) === null, 'skipped record not written');
t_ok(t_call('POST', '/api/admin/products/import', ['_meta' => []], $adminToken)['json']['error'] === 'invalid_import_file', 'no produkty → 422 invalid_import_file');
t_ok(t_call('POST', '/api/admin/products/import', ['produkty' => []], $adminToken)['status'] === 422, 'empty produkty → 422 (never deactivates everything)');
t_ok((int) Db::val('SELECT COUNT(*) FROM products WHERE active = 1') === 4, 'rejected files changed nothing');
$big = t_request('POST', '/admin/products/import');
$big->headers['authorization'] = 'Bearer ' . $adminToken;
$big->headers['content-length'] = (string) (ImportService::MAX_BYTES + 1);
t_ok(Router::dispatch($big)->status === 413, 'body over 20 MB → 413');
t_ok((int) Db::val("SELECT COUNT(*) FROM audit_log WHERE action = 'products_import'") >= 4, 'imports audited');

// ---------- admin preview ----------
$r = t_call('GET', '/api/admin/products', null, $adminToken);
t_ok($r['status'] === 200 && $r['json']['total'] === 4 && count($r['json']['items']) === 4, 'GET /admin/products → all products');
$item = array_values(array_filter($r['json']['items'], static fn(array $i) => $i['sku'] === 'R00002D'))[0] ?? [];
t_ok(($item['active'] ?? null) === true && $item['priceGross'] === 60500 && $item['depositGross'] === 15000
    && $item['imageUrl'] === '/img/products/Produkt_Delphi_R00002D.webp'
    && $item['variants'] === ['oryginalne' => ['priceGross' => 80800], 'zamienne' => ['priceGross' => 60500]], 'preview item shape');
Db::update('products', ['active' => 0], ['sku' => '0445117010']);
$r = t_call('GET', '/api/admin/products?q=0445117010', null, $adminToken);
t_ok($r['json']['total'] === 1 && $r['json']['items'][0]['active'] === false, 'preview includes inactive products');
$r = t_call('GET', '/api/admin/products?q=095000-5800', null, $adminToken);
t_ok($r['json']['total'] === 1 && $r['json']['items'][0]['sku'] === '095000-5800', 'q with dash matches SKU');
$oeNumber = $sample['produkty'][1]['numeryOem'][1];
$r = t_call('GET', '/api/admin/products', null, $adminToken, ['q' => $oeNumber]);
t_ok(in_array('0445010507', array_column($r['json']['items'], 'sku'), true), 'q matches an OE number');
t_ok(t_call('GET', '/api/admin/products?q=POMPA%20wysokiego', null, $adminToken)['json']['total'] >= 1, 'q matches name case-insensitively');

// ---------- customers ----------
$r = t_call('GET', '/api/admin/customers', null, $adminToken);
t_ok($r['status'] === 200 && count($r['json']) === 1 && $r['json'][0]['id'] === $customer['id'], 'customer list excludes admins');
t_ok(array_keys($r['json'][0]) === ['id', 'email', 'companyName', 'nip', 'contactName', 'phone', 'status', 'discountPercent', 'discountTemplateId', 'discountTemplateName', 'customRulesCount', 'blockedAt', 'createdAt'], 'customer item shape');
t_ok(count(t_call('GET', '/api/admin/customers?q=diesel', null, $adminToken)['json']) === 1, 'search by company name');
t_ok(count(t_call('GET', '/api/admin/customers?q=nikt-taki', null, $adminToken)['json']) === 0, 'search without match → []');

$r = t_call('PATCH', '/api/admin/customers/' . $customer['id'], ['discountPercent' => 15], $adminToken);
t_ok($r['status'] === 200 && (float) $r['json']['discountPercent'] === 15.0, 'PATCH discount 15 → customer');
$list = t_call('GET', '/api/admin/customers', null, $adminToken)['json'];
t_ok((float) $list[0]['discountPercent'] === 15.0, 'GET shows discount 15');
t_ok((float) Db::val('SELECT discount_percent FROM users WHERE id = ?', [$customer['id']]) === 15.0, 'discount stored on the user');
t_ok(t_call('PATCH', '/api/admin/customers/' . $customer['id'], ['discountPercent' => 12.5], $adminToken)['json']['discountPercent'] === 12.5, 'step 0.5 accepted');
$r = t_call('PATCH', '/api/admin/customers/' . $customer['id'], ['discountPercent' => 101], $adminToken);
t_ok($r['status'] === 422 && $r['json']['error'] === 'invalid_discount', 'discount 101 → 422');
t_ok(t_call('PATCH', '/api/admin/customers/' . $customer['id'], ['discountPercent' => -1], $adminToken)['status'] === 422, 'discount -1 → 422');
t_ok(t_call('PATCH', '/api/admin/customers/' . $customer['id'], ['discountPercent' => 10.3], $adminToken)['status'] === 422, 'discount 10.3 (not a 0.5 step) → 422');
t_ok(t_call('PATCH', '/api/admin/customers/' . $customer['id'], [], $adminToken)['status'] === 400, 'missing discountPercent → 400');
t_ok((float) Db::val('SELECT discount_percent FROM users WHERE id = ?', [$customer['id']]) === 12.5, 'rejected PATCH changed nothing');
$r = t_call('PATCH', '/api/admin/customers/' . $admin['id'], ['discountPercent' => 10], $adminToken);
t_ok($r['status'] === 404 && (float) Db::val('SELECT discount_percent FROM users WHERE id = ?', [$admin['id']]) === 0.0, 'admin cannot get a discount → 404');
t_ok(t_call('PATCH', '/api/admin/customers/' . uuid4(), ['discountPercent' => 10], $adminToken)['status'] === 404, 'unknown customer → 404');
t_ok((int) Db::val("SELECT COUNT(*) FROM audit_log WHERE action = 'customer_discount' AND entity_id = ?", [$customer['id']]) === 2, 'discount changes audited');

// ---------- admin orders (blind test: the admin saw orders only in the e-mail) ----------
$mkOrder = static function (?string $userId, string $number, string $company, string $nip, string $email, string $at): string {
    $id = uuid4();
    Db::insert('orders', [
        'id' => $id, 'number' => $number, 'user_id' => $userId,
        'customer_snapshot' => ['companyName' => $company, 'nip' => $nip, 'contactName' => 'Jan', 'phone' => '500600700', 'email' => $email],
        'address_snapshot' => ['companyName' => $company, 'street' => 'Prosta 1', 'postalCode' => '00-001', 'city' => 'Warszawa', 'country' => 'Polska', 'phone' => null],
        'discount_percent' => 0, 'total_net' => 10000, 'total_gross' => 12300, 'total_deposit' => 15000, 'note' => 'Pilne', 'created_at' => $at,
    ]);
    Db::insert('order_items', [
        'id' => uuid4(), 'order_id' => $id, 'sku' => '095000-5800', 'name' => 'Wtryskiwacz', 'variant' => null, 'qty' => 1,
        'unit_net' => 10000, 'unit_gross' => 12300, 'unit_deposit' => 15000, 'price_on_request' => 0,
    ]);
    return $id;
};
$o1 = $mkOrder($customer['id'], 'CDM-2026-0001', 'Warsztat Diesel Kowalski', '1234567890', $customer['email'], '2026-10-01T10:00:00.000Z');
$o2 = $mkOrder(null, 'CDM-2026-0002', 'Auto Serwis Nowak', '5555555555', 'nowak@example.com', '2026-10-02T10:00:00.000Z');
$r = t_call('GET', '/api/admin/orders', null, $adminToken);
t_ok($r['status'] === 200 && $r['json']['total'] === 2 && array_column($r['json']['items'], 'number') === ['CDM-2026-0002', 'CDM-2026-0001'], 'GET /admin/orders → all orders, newest first');
$first = $r['json']['items'][0];
t_ok(array_keys($first) === ['id', 'number', 'createdAt', 'customer', 'accountDeleted', 'totals', 'itemsCount', 'hasPriceOnRequest'], 'admin order row shape');
t_ok($first['accountDeleted'] === true && $r['json']['items'][1]['accountDeleted'] === false, 'accountDeleted flags orders of deleted accounts');
t_ok($first['customer']['companyName'] === 'Auto Serwis Nowak' && $first['totals']['grossWithDeposit'] === 27300 && $first['itemsCount'] === 1, 'row carries company, totals, positions');
t_ok(array_column(t_call('GET', '/api/admin/orders?q=kowalski', null, $adminToken)['json']['items'], 'number') === ['CDM-2026-0001'], 'q matches the company');
t_ok(t_call('GET', '/api/admin/orders?q=cdm-2026-0002', null, $adminToken)['json']['total'] === 1, 'q matches the number');
t_ok(t_call('GET', '/api/admin/orders?q=555-555-55-55', null, $adminToken)['json']['total'] === 1, 'q matches the NIP with dashes');
t_ok(t_call('GET', '/api/admin/orders?q=nowak@example', null, $adminToken)['json']['total'] === 1, 'q matches the e-mail');
t_ok(t_call('GET', '/api/admin/orders?pageSize=1&page=2', null, $adminToken)['json']['items'][0]['number'] === 'CDM-2026-0001', 'pagination');
$r = t_call('GET', '/api/admin/orders/' . $o2, null, $adminToken);
t_ok($r['status'] === 200 && $r['json']['number'] === 'CDM-2026-0002' && count($r['json']['items']) === 1 && $r['json']['address']['city'] === 'Warszawa' && $r['json']['note'] === 'Pilne', 'GET /admin/orders/:id → full order, also of a deleted account');
t_ok(t_call('GET', '/api/admin/orders/' . uuid4(), null, $adminToken)['status'] === 404, 'unknown order → 404');
t_ok(t_call('GET', '/api/orders/' . $o2, null, $customerToken)['status'] === 404, 'customer still cannot read an order that is not theirs');

// ---------- block / unblock ----------
$custToken2 = t_token($customer);
$r = t_call('POST', '/api/admin/customers/' . $customer['id'] . '/block', null, $adminToken);
t_ok($r['status'] === 200 && is_string($r['json']['blockedAt']), 'block → blockedAt set');
t_ok((int) Db::val('SELECT COUNT(*) FROM sessions WHERE user_id = ?', [$customer['id']]) === 0, 'block ends every session');
t_ok(t_call('GET', '/api/me', null, $custToken2)['status'] === 401, 'old access token of a blocked customer → 401');
$r = t_login($customer['email'], T_PASSWORD);
t_ok($r['status'] === 403 && $r['json']['error'] === 'account_blocked', 'blocked customer login → 403 account_blocked');
t_ok(t_call('POST', '/api/admin/customers/' . $customer['id'] . '/block', null, $adminToken)['status'] === 200, 'block twice is idempotent');
t_ok(t_call('POST', '/api/admin/customers/' . $admin['id'] . '/block', null, $adminToken)['status'] === 404, 'admin cannot block an admin → 404');
$r = t_call('POST', '/api/admin/customers/' . $customer['id'] . '/unblock', null, $adminToken);
t_ok($r['status'] === 200 && $r['json']['blockedAt'] === null, 'unblock → blockedAt null');
t_ok(t_login($customer['email'], T_PASSWORD)['status'] === 200, 'unblocked customer logs in again');
t_ok((int) Db::val("SELECT COUNT(*) FROM audit_log WHERE action IN ('customer_block','customer_unblock') AND entity_id = ?", [$customer['id']]) === 2, 'block/unblock audited once each');

// ---------- delete ----------
t_ok(t_call('DELETE', '/api/admin/customers/' . $admin['id'], null, $adminToken)['status'] === 404, 'admin cannot delete an admin → 404');
$r = t_call('DELETE', '/api/admin/customers/' . $customer['id'], null, $adminToken);
t_ok($r['status'] === 204, 'DELETE customer → 204');
t_ok(Db::val('SELECT 1 FROM users WHERE id = ?', [$customer['id']]) === null, 'customer row gone');
t_ok(Db::val('SELECT user_id FROM orders WHERE id = ?', [$o1]) === null && Db::val('SELECT 1 FROM orders WHERE id = ?', [$o1]) !== null, 'their order stays, user_id NULL');
t_ok(t_call('GET', '/api/admin/orders/' . $o1, null, $adminToken)['json']['customer']['companyName'] === 'Warsztat Diesel Kowalski', 'order snapshot readable after deletion');
t_ok(t_call('DELETE', '/api/admin/customers/' . $customer['id'], null, $adminToken)['status'] === 404, 'delete twice → 404');
t_ok((int) Db::val("SELECT COUNT(*) FROM audit_log WHERE action = 'customer_delete' AND entity_id = ?", [$customer['id']]) === 1, 'delete audited');
t_ok(t_login($customer['email'], T_PASSWORD)['status'] === 401, 'deleted customer cannot log in');

// ---------- full source file (when synced) ----------
$synced = dirname(__DIR__) . '/storage/import/Products_Data.json';
if (is_file($synced)) {
    $data = json_decode((string) file_get_contents($synced), true, 64, JSON_THROW_ON_ERROR);
    t_reset();
    $res = ImportService::import($data);
    t_ok($res['created'] === count($data['produkty']) && $res['skipped'] === [], 'full Products_Data.json imports every record (' . $res['created'] . ')');
}
