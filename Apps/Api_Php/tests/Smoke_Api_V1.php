<?php

declare(strict_types=1);

/**
 * B-21 smoke: client API keys (/me/api-keys, /admin/customers/:id/api-keys) and the
 * read-only client API /api/v1/products — key auth, scope, the owner's prices,
 * pagination up to 500, updatedSince, rate limit per key, no writes.
 */
require __DIR__ . '/Harness.php';
require __DIR__ . '/Fixtures/products_fixture.php';

t_reset();
t_products_fixture();
$skus = static fn(array $r): array => array_column($r['json']['items'] ?? [], 'sku');

$customer = t_user('customer', ['discount_percent' => 10]);
$tok = t_token($customer);
$other = t_user('customer');
$otherTok = t_token($other);
$admin = t_user('admin');
$adminTok = t_token($admin);

// --- keys: create in Moje konto -------------------------------------------
t_ok(t_call('GET', '/api/me/api-keys')['status'] === 401, 'guest GET /me/api-keys → 401');
t_ok(t_call('GET', '/api/me/api-keys', null, $adminTok)['status'] === 403, 'admin cannot use /me/api-keys (customers only) → 403');
$c = t_call('POST', '/api/me/api-keys', ['name' => 'Integracja ERP'], $tok);
$key = $c['json']['key'] ?? '';
t_ok($c['status'] === 201 && str_starts_with($key, 'cdm_live_') && strlen($key) === 49, 'POST /me/api-keys → 201 with the plain key cdm_live_ + 40 chars');
$k = $c['json']['apiKey'];
t_ok($k['scope'] === 'all' && $k['createdBy'] === 'customer' && $k['prefix'] === substr($key, 0, 13) && $k['requestCount'] === 0 && $k['revokedAt'] === null, 'created key: scope all, by customer, display prefix, unused');
$row = Db::one('SELECT * FROM api_keys WHERE id = ?', [$k['id']]);
t_ok($row['key_hash'] === hash('sha256', $key) && !str_contains(json_encode($row), $key), 'only sha256 of the key is stored');
$list = t_call('GET', '/api/me/api-keys', null, $tok);
t_ok($list['status'] === 200 && count($list['json']['items']) === 1 && !str_contains($list['body'], $key), 'GET /me/api-keys lists the key without the plain value');
t_ok(t_call('GET', '/api/me/api-keys', null, $otherTok)['json']['items'] === [], 'another customer does not see the key');
t_ok(Db::val("SELECT COUNT(*) FROM audit_log WHERE action = 'api_key_create' AND entity_id = ?", [$k['id']]) === 1, 'key creation is audited');

$bad = t_call('POST', '/api/me/api-keys', ['name' => ''], $tok);
t_ok($bad['status'] === 400, 'empty name → 400');
$empty = t_call('POST', '/api/me/api-keys', ['name' => 'Pusty', 'scope' => 'list'], $tok);
t_ok($empty['status'] === 422 && $empty['json']['error'] === 'api_key_scope_empty', 'scope list without SKUs or categories → 422 api_key_scope_empty');

// --- v1 auth ---------------------------------------------------------------
$noKey = t_call('GET', '/api/v1/products');
t_ok($noKey['status'] === 401, 'v1 without a key → 401');
t_ok(($noKey['headers']['WWW-Authenticate'] ?? null) === 'Bearer realm="catalog-api"', 'v1 401 carries WWW-Authenticate: Bearer');
t_ok(!isset(t_call('GET', '/api/me')['headers']['WWW-Authenticate']), 'site 401 (/me) has no WWW-Authenticate');
$spec = t_call('GET', '/api/v1/openapi.yaml');
t_ok($spec['status'] === 200 && str_starts_with($spec['headers']['Content-Type'] ?? '', 'application/yaml') && str_starts_with($spec['body'], 'openapi: 3.0.3') && str_contains($spec['body'], '/products/{sku}'), 'GET /v1/openapi.yaml → 200 yaml without a key');
t_ok(t_call('GET', '/api/v1/products', null, 'cdm_live_' . str_repeat('0', 40))['status'] === 401, 'v1 with an unknown key → 401');
t_ok(t_call('GET', '/api/v1/products', null, $tok)['status'] === 401, 'v1 with a session JWT → 401');
t_ok(t_call('GET', '/api/products', null, $key)['status'] === 401, 'API key on a site route (/products) → 401');
t_ok(t_call('GET', '/api/me', null, $key)['status'] === 401, 'API key on /me → 401');

// --- v1 list: whole catalogue, owner prices ---------------------------------
$r = t_call('GET', '/api/v1/products', null, $key);
t_ok($r['status'] === 200 && $r['json']['total'] === 5 && $r['json']['pageSize'] === 100 && $r['json']['page'] === 1, 'v1 list: 5 active products, default pageSize 100');
t_ok(!in_array('BX-OLD-01', $skus($r), true), 'v1 list: inactive product absent');
t_ok($skus($r) === ['095000-5800', 'BX-ADBLUE-01', 'BX-POMPA-01', 'BX-POMPA-02', 'R00002D'], 'v1 list: ordered by SKU (stable pages)');
t_ok((float) $r['json']['discountPercent'] === 10.0 && $r['json']['currency'] === 'PLN' && $r['json']['amountsIn'] === 'grosze' && $r['json']['vatRate'] === 0.23 && is_string($r['json']['generatedAt']), 'v1 list meta: discount 10, PLN, grosze, VAT, generatedAt');
$items = array_column($r['json']['items'], null, 'sku');
$denso = $items['095000-5800'];
$site = t_call('GET', '/api/products/095000-5800', null, $tok)['json'];
t_ok($denso['price'] === $site['price'] && $denso['price']['unitGross'] === (int) round(58800 * 0.9) && $denso['price']['listGross'] === 58800, 'v1 price = site price for the same customer (10% off, list price kept)');
t_ok($denso['price']['unitDeposit'] === 15000, 'v1: deposit not discounted');
t_ok($denso['oeNumbers'] === $site['oeNumbers'] && $denso['applications'] === $site['applications'] && $denso['description'] === $site['description'] && $denso['makes'] === $site['makes'], 'v1 item carries the site detail fields (OE, applications, description, makes)');
t_ok($denso['imageUrl'] === app_url('/img/products/Produkt_Denso_095000_5800.webp') && str_starts_with($denso['imageUrl'], 'http'), 'v1 imageUrl is absolute');
t_ok(!array_key_exists('image', $denso) && (float) ($denso['discountPercent'] ?? -1) === 10.0 && !array_key_exists('productDiscounts', $denso), 'v1 item: no raw image name, the product % on the item (per-product rabaty)');
t_ok($denso['stock'] === 10 && $denso['leadTimeHours'] === 24 && $items['R00002D']['leadTimeHours'] === 72 && $items['BX-POMPA-01']['leadTimeHours'] === 48, 'v1 leadTimeHours effective: in stock 24, none 72, admin 48');
t_ok($denso['active'] === true && array_key_exists('updatedAt', $denso), 'v1 item: active + updatedAt');
t_ok($items['BX-ADBLUE-01']['priceOnRequest'] === true && $items['BX-ADBLUE-01']['price'] === null, 'v1: price on request → price null');
t_ok(count($items['R00002D']['variants']) === 2 && $items['R00002D']['variants'][0]['price']['unitGross'] === (int) round(80800 * 0.9), 'v1: variant prices with the discount');
$otherKey = t_call('POST', '/api/me/api-keys', ['name' => 'Bez rabatu'], $otherTok)['json']['key'];
$o = t_call('GET', '/api/v1/products/095000-5800', null, $otherKey);
t_ok($o['status'] === 200 && $o['json']['item']['price']['unitGross'] === 58800 && (float) $o['json']['discountPercent'] === 0.0, 'each key gets its own customer prices (0% → 588,00 zł)');

// --- pagination -------------------------------------------------------------
$p2 = t_call('GET', '/api/v1/products', null, $key, ['page' => 2, 'pageSize' => 2]);
t_ok($p2['json']['total'] === 5 && $skus($p2) === ['BX-POMPA-01', 'BX-POMPA-02'], 'page 2 of size 2');
t_ok(t_call('GET', '/api/v1/products', null, $key, ['pageSize' => 500])['status'] === 200, 'pageSize 500 allowed');
t_ok(t_call('GET', '/api/v1/products', null, $key, ['pageSize' => 501])['status'] === 400, 'pageSize 501 → 400');
t_ok(t_call('GET', '/api/v1/products', null, $key, ['page' => '9223372036854775807', 'pageSize' => 500])['status'] === 400, 'huge page → 400, not 500');

// --- detail -----------------------------------------------------------------
$d = t_call('GET', '/api/v1/products/R00002D', null, $key);
t_ok($d['status'] === 200 && $d['json']['item']['sku'] === 'R00002D' && (float) $d['json']['discountPercent'] === 10.0, 'v1 detail');
t_ok(t_call('GET', '/api/v1/products/BX-OLD-01', null, $key)['status'] === 404, 'v1 detail of an inactive product → 404');
t_ok(t_call('GET', '/api/v1/products/NOPE', null, $key)['status'] === 404, 'v1 detail of an unknown SKU → 404');

// --- scope list -------------------------------------------------------------
$scoped = t_call('POST', '/api/me/api-keys', ['name' => 'Tylko pompy', 'scope' => 'list', 'skus' => ['095000-5800', ' 095000-5800 '], 'categories' => ['Pompy CR']], $tok);
$sk = $scoped['json']['key'];
t_ok($scoped['status'] === 201 && $scoped['json']['apiKey']['skus'] === ['095000-5800'] && $scoped['json']['apiKey']['categories'] === ['Pompy CR'], 'scope list stored (SKUs trimmed, de-duplicated)');
$s = t_call('GET', '/api/v1/products', null, $sk);
t_ok($s['json']['total'] === 3 && $skus($s) === ['095000-5800', 'BX-POMPA-01', 'BX-POMPA-02'], 'scope list key sees its SKU + its category only');
t_ok(t_call('GET', '/api/v1/products/R00002D', null, $sk)['status'] === 404, 'scope list key: product outside scope → 404');
t_ok(t_call('GET', '/api/v1/products/BX-POMPA-02', null, $sk)['status'] === 200, 'scope list key: product of an allowed category → 200');
$cased = t_call('POST', '/api/me/api-keys', ['name' => 'Małe litery', 'scope' => 'list', 'skus' => ['r00002d']], $tok);
t_ok($cased['status'] === 201 && $cased['json']['apiKey']['skus'] === ['R00002D'], 'SKU typed in another case is stored as the catalogue spells it');
$unknownSku = t_call('POST', '/api/me/api-keys', ['name' => 'Zły SKU', 'scope' => 'list', 'skus' => ['R00002D', 'NOPE']], $tok);
t_ok($unknownSku['status'] === 422 && $unknownSku['json']['error'] === 'api_key_unknown_skus' && $unknownSku['json']['meta']['skus'] === ['NOPE'], 'unknown SKU on a key → 422 api_key_unknown_skus naming it');
Db::exec("DELETE FROM api_keys WHERE name = 'Małe litery'");
$all = t_call('POST', '/api/me/api-keys', ['name' => 'Wszystko', 'scope' => 'all', 'skus' => ['X']], $tok)['json']['apiKey'];
t_ok($all['skus'] === [] && $all['categories'] === [], 'scope all ignores a SKU list');

// --- usage counter ------------------------------------------------------------
$used = Db::one('SELECT * FROM api_keys WHERE id = ?', [$k['id']]);
t_ok((int) $used['request_count'] === 8 && $used['last_used_at'] !== null, 'request_count and last_used_at updated per call');
t_ok((int) Db::val("SELECT COUNT(*) FROM audit_log WHERE action LIKE 'api%' AND action NOT IN ('api_key_create', 'api_key_revoke')") === 0, 'no audit_log row per GET');

// --- updatedSince -------------------------------------------------------------
Db::exec("UPDATE products SET updated_at = '2026-01-01T00:00:00.000Z'");
Db::exec("UPDATE products SET updated_at = '2026-06-01T00:00:00.000Z' WHERE sku IN ('BX-POMPA-01', 'BX-OLD-01')");
$u = t_call('GET', '/api/v1/products', null, $key, ['updatedSince' => '2026-05-01T00:00:00Z']);
t_ok($u['status'] === 200 && $skus($u) === ['BX-OLD-01', 'BX-POMPA-01'], 'updatedSince: only products changed after it, inactive included');
$old = array_column($u['json']['items'], null, 'sku')['BX-OLD-01'];
t_ok($old['active'] === false, 'updatedSince: a hidden product comes back as active:false');
t_ok(t_call('GET', '/api/v1/products', null, $key, ['updatedSince' => '2026-05-01'])['json']['total'] === 2, 'updatedSince accepts a plain date');
t_ok(t_call('GET', '/api/v1/products', null, $key, ['updatedSince' => 'wczoraj'])['status'] === 400, 'updatedSince garbage → 400');
t_ok(t_call('GET', '/api/v1/products', null, $key, ['updatedSince' => '2027-01-01T00:00:00Z'])['json']['total'] === 0, 'updatedSince in the future → nothing');
$patch = t_call('PATCH', '/api/admin/customers/' . $customer['id'], ['discountPercent' => 15], $adminTok);
t_ok($patch['status'] === 200, 'admin changes the discount to 15%');
$u2 = t_call('GET', '/api/v1/products', null, $key, ['updatedSince' => '2026-05-01T00:00:00Z']);
t_ok($u2['json']['total'] === 6 && (float) $u2['json']['discountPercent'] === 15.0, 'discount changed after updatedSince → every active product (+ the changed inactive one) with new prices');
t_ok(array_column($u2['json']['items'], null, 'sku')['095000-5800']['price']['unitGross'] === (int) round(58800 * 0.85), 'new discount applied at once, no new key needed');
t_ok(min(array_column($u2['json']['items'], 'updatedAt')) >= '2026-05-01T00:00:00.000Z', 'after a discount change every item updatedAt is at least the change time');

// --- import keeps updated_at unless something changed ----------------------
t_reset();
$sample = json_decode((string) file_get_contents(__DIR__ . '/Fixtures/Products_Data_Sample.json'), true);
ImportService::import($sample);
Db::exec("UPDATE products SET updated_at = '2026-01-01T00:00:00.000Z'");
ImportService::import($sample);
t_ok((int) Db::val("SELECT COUNT(*) FROM products WHERE updated_at <> '2026-01-01T00:00:00.000Z'") === 0, 'import of an unchanged file leaves updated_at alone');
$sample['produkty'][0]['nazwa'] .= ' (nowa nazwa)';
$firstSku = (string) $sample['produkty'][0]['sku'];
$dropped = (string) $sample['produkty'][1]['sku'];
array_splice($sample['produkty'], 1, 1);
ImportService::import($sample);
$changed = array_column(Db::all("SELECT sku FROM products WHERE updated_at <> '2026-01-01T00:00:00.000Z' ORDER BY sku"), 'sku');
$expect = [$firstSku, $dropped];
sort($expect);
t_ok($changed === $expect, 'import: renamed product and product dropped from the file get a new updated_at');
t_ok(Db::val('SELECT updated_at FROM products WHERE sku = ?', [$firstSku]) !== null, 'import sets updated_at');

// --- revoke, blocked owner, limits -------------------------------------------
t_reset();
t_products_fixture();
$cust = t_user('customer');
$ct = t_token($cust);
$created = t_call('POST', '/api/admin/customers/' . $cust['id'] . '/api-keys', ['name' => 'Od admina'], $adminTok = t_token(t_user('admin')));
$ak = $created['json']['key'];
t_ok($created['status'] === 201 && $created['json']['apiKey']['createdBy'] === 'admin', 'admin creates a key for a customer → 201, createdBy admin');
t_ok(count(t_call('GET', '/api/me/api-keys', null, $ct)['json']['items']) === 1, 'the customer sees the key the admin made');
t_ok(t_call('GET', '/api/admin/customers/' . $cust['id'] . '/api-keys', null, $adminTok)['json']['items'][0]['name'] === 'Od admina', 'admin lists the customer keys');
t_ok(t_call('GET', '/api/admin/customers/' . $cust['id'] . '/api-keys', null, $ct)['status'] === 403, 'customer cannot use the admin key routes → 403');
t_ok(t_call('GET', '/api/admin/customers/' . uuid4() . '/api-keys', null, $adminTok)['status'] === 404, 'admin: unknown customer → 404');
t_ok(t_call('GET', '/api/v1/products', null, $ak)['status'] === 200, 'admin-made key works');

Db::exec('DELETE FROM rate_limits');
$blocked = t_call('POST', '/api/admin/customers/' . $cust['id'] . '/block', null, $adminTok);
t_ok($blocked['status'] === 200 && t_call('GET', '/api/v1/products', null, $ak)['status'] === 401, 'blocked customer → their key gets 401');
t_call('POST', '/api/admin/customers/' . $cust['id'] . '/unblock', null, $adminTok);
$ct = t_token($cust); // blocking ended the customer's sessions
t_ok(t_call('GET', '/api/v1/products', null, $ak)['status'] === 200, 'unblocked → the key works again');

$keyId = $created['json']['apiKey']['id'];
$stranger = t_user('customer');
t_ok(t_call('DELETE', '/api/me/api-keys/' . $keyId, null, t_token($stranger))['status'] === 404, "another customer cannot revoke someone's key → 404");
$rv = t_call('DELETE', '/api/me/api-keys/' . $keyId, null, $ct);
t_ok($rv['status'] === 200 && $rv['json']['apiKey']['revokedAt'] !== null, 'customer revokes the key');
t_ok(t_call('GET', '/api/v1/products', null, $ak)['status'] === 401, 'revoked key → 401');
t_ok(t_call('DELETE', '/api/me/api-keys/' . $keyId, null, $ct)['status'] === 200, 'revoking twice is harmless');
t_ok(Db::val("SELECT COUNT(*) FROM audit_log WHERE action = 'api_key_revoke' AND entity_id = ?", [$keyId]) === 1, 'revocation audited once');

for ($i = 1; $i <= 5; $i++) {
    t_call('POST', '/api/me/api-keys', ['name' => 'Klucz ' . $i], $ct);
}
$sixth = t_call('POST', '/api/me/api-keys', ['name' => 'Szósty'], $ct);
t_ok($sixth['status'] === 409 && $sixth['json']['error'] === 'api_key_limit' && $sixth['json']['meta']['max'] === 5, '6th active key → 409 api_key_limit (revoked keys do not count)');

// --- rate limit per key ------------------------------------------------------
Db::exec('DELETE FROM rate_limits');
$rk = Db::one("SELECT id FROM api_keys WHERE user_id = ? AND revoked_at IS NULL LIMIT 1", [$cust['id']]);
$plain = ApiKeyAuth::generate();
Db::update('api_keys', ['key_hash' => ApiKeyAuth::hash($plain)], ['id' => $rk['id']]);
Db::insert('rate_limits', ['key' => 'api_key|' . $rk['id'], 'count' => ApiKeyAuth::LIMIT, 'window_start' => time()]);
$limited = t_call('GET', '/api/v1/products', null, $plain);
t_ok($limited['status'] === 429 && $limited['json']['error'] === 'TOO_MANY_REQUESTS' && $limited['json']['meta']['retryAfter'] === 60, 'over 120 calls a minute → 429, retryAfter 60');
t_ok(($limited['headers']['Retry-After'] ?? null) === '60', '429 carries Retry-After: 60');
Db::exec('UPDATE rate_limits SET window_start = window_start - 60');
t_ok(t_call('GET', '/api/v1/products', null, $plain)['status'] === 200, 'next minute → allowed again');

// --- read only, deletion -----------------------------------------------------
foreach (['POST', 'PUT', 'PATCH', 'DELETE'] as $m) {
    $r = t_call($m, '/api/v1/products', [], $plain);
    t_ok($r['status'] === 405 && ($r['headers']['Allow'] ?? null) === 'GET, HEAD' && ($r['json']['error'] ?? null) === 'METHOD_NOT_ALLOWED', "v1 $m /products → 405, Allow: GET, HEAD");
    t_ok(t_call($m, '/api/v1/products/ANY-SKU', [], $plain)['status'] === 405, "v1 $m /products/:sku → 405");
}
Db::exec('DELETE FROM rate_limits');
$del = t_call('DELETE', '/api/admin/customers/' . $cust['id'], null, $adminTok);
t_ok($del['status'] === 204 && (int) Db::val('SELECT COUNT(*) FROM api_keys WHERE user_id = ?', [$cust['id']]) === 0, 'deleting the customer deletes their keys');
t_ok(t_call('GET', '/api/v1/products', null, $plain)['status'] === 401, "deleted customer's key → 401");

