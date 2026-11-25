<?php

declare(strict_types=1);

/**
 * Pilot_Run 2026-10-16 smoke: per-product rabaty and szablony rabatów —
 * /api/admin/discount-templates, /api/admin/customers/:id/discounts, and the prices
 * they produce in the catalogue, cart, order (snapshot) and client API v1.
 */
require __DIR__ . '/Harness.php';
require __DIR__ . '/Fixtures/products_fixture.php';

putenv('ORDER_EMAIL=zamowienia@catalog-demo.test');

t_reset();
t_products_fixture();

$admin = t_user('admin');
$adminTok = t_token($admin);
$customer = t_user('customer', ['discount_percent' => 10]);
$tok = t_token($customer);
$plain = t_user('customer', ['discount_percent' => 10]);
$plainTok = t_token($plain);
$cardOf = static fn(array $list, string $sku): ?array => array_values(array_filter(
    $list['items'] ?? [],
    static fn(array $c) => $c['sku'] === $sku,
))[0] ?? null;

// ---------- guards ----------
$guarded = [
    ['GET', '/api/admin/discount-templates', null],
    ['POST', '/api/admin/discount-templates', ['name' => 'X', 'rules' => []]],
    ['PUT', '/api/admin/discount-templates/' . uuid4(), ['name' => 'X', 'rules' => []]],
    ['DELETE', '/api/admin/discount-templates/' . uuid4(), null],
    ['GET', '/api/admin/customers/' . $customer['id'] . '/discounts', null],
    ['PUT', '/api/admin/customers/' . $customer['id'] . '/discounts', ['templateId' => null, 'rules' => []]],
];
foreach ($guarded as [$m, $p, $b]) {
    t_ok(t_call($m, $p, $b, $tok)['status'] === 403, "customer → 403 on $m $p");
    t_ok(t_call($m, $p, $b)['status'] === 401, "guest → 401 on $m $p");
}

// ---------- N-02: no rules = today's behaviour ----------
$list = t_call('GET', '/api/products', null, $plainTok)['json'];
t_ok($list['discountPercent'] === 10 || $list['discountPercent'] === 10.0, 'list: global % at the top');
t_ok($list['productDiscounts'] === false, 'no rules → productDiscounts false');
$denso = $cardOf($list, '095000-5800');
t_ok((float) $denso['discountPercent'] === 10.0 && $denso['price']['unitGross'] === 52920, 'no rules → every card gets the global 10%');

// ---------- szablony: create / validate ----------
$r = t_call('GET', '/api/admin/discount-templates', null, $adminTok);
t_ok($r['status'] === 200 && $r['json'] === [], 'no szablony yet');
$bad = [
    [['type' => 'category', 'target' => 'Wtryskiwacze', 'percent' => 101], 'invalid_discount', '% > 100'],
    [['type' => 'category', 'target' => 'Wtryskiwacze', 'percent' => 12.3], 'invalid_discount', '% not in 0.5 steps'],
    [['type' => 'category', 'target' => 'Nie ma takiej', 'percent' => 5], 'unknown_target', 'unknown category'],
    [['type' => 'product', 'target' => 'NO-SUCH-SKU', 'percent' => 5], 'unknown_target', 'unknown SKU'],
];
foreach ($bad as [$rule, $code, $label]) {
    $r = t_call('POST', '/api/admin/discount-templates', ['name' => 'Zły', 'rules' => [$rule]], $adminTok);
    t_ok($r['status'] === 422 && ($r['json']['error'] ?? null) === $code, "$label → 422 $code");
}
$r = t_call('POST', '/api/admin/discount-templates', ['name' => 'Zły', 'rules' => [
    ['type' => 'product', 'target' => 'BX-POMPA-01', 'percent' => 5],
    ['type' => 'product', 'target' => 'BX-POMPA-01', 'percent' => 6],
]], $adminTok);
t_ok($r['status'] === 422 && $r['json']['error'] === 'duplicate_rule', 'same target twice → 422 duplicate_rule');
t_ok(t_call('POST', '/api/admin/discount-templates', ['name' => '', 'rules' => []], $adminTok)['status'] === 400, 'empty name → 400');
t_ok(t_call('POST', '/api/admin/discount-templates', ['name' => 'X', 'rules' => [['type' => 'make', 'target' => 'Ford', 'percent' => 5]]], $adminTok)['status'] === 400, 'unknown rule type → 400');
t_ok((int) Db::val('SELECT COUNT(*) FROM discount_templates') === 0, 'rejected szablony wrote nothing');

$r = t_call('POST', '/api/admin/discount-templates', ['name' => 'Warsztaty A', 'rules' => [
    ['type' => 'category', 'target' => 'Wtryskiwacze', 'percent' => 20],
    ['type' => 'product', 'target' => 'BX-POMPA-01', 'percent' => 30],
]], $adminTok);
$tpl = $r['json'];
t_ok($r['status'] === 201 && $tpl['name'] === 'Warsztaty A' && count($tpl['rules']) === 2 && $tpl['customersCount'] === 0, 'POST szablon → 201 with 2 rules');
$pumpRule = array_values(array_filter($tpl['rules'], static fn($x) => $x['type'] === 'product'))[0];
t_ok($pumpRule['target'] === 'BX-POMPA-01' && is_string($pumpRule['label']) && $pumpRule['label'] !== '', 'SKU rule carries the product name as label');
$r = t_call('POST', '/api/admin/discount-templates', ['name' => 'warsztaty a', 'rules' => []], $adminTok);
t_ok($r['status'] === 422 && $r['json']['error'] === 'template_name_taken', 'name taken (case-insensitive) → 422 template_name_taken');

// ---------- customer: szablon + own rules ----------
$path = '/api/admin/customers/' . $customer['id'] . '/discounts';
$r = t_call('GET', $path, null, $adminTok);
t_ok($r['status'] === 200 && $r['json']['templateId'] === null && $r['json']['rules'] === [] && (float) $r['json']['discountPercent'] === 10.0, 'GET customer discounts: nothing set yet');
t_ok(t_call('PUT', $path, ['templateId' => uuid4(), 'rules' => []], $adminTok)['status'] === 404, 'unknown szablon → 404');
t_ok(t_call('PUT', '/api/admin/customers/' . $admin['id'] . '/discounts', ['templateId' => null, 'rules' => []], $adminTok)['status'] === 404, 'admin account is not a customer → 404');
$r = t_call('PUT', $path, ['templateId' => $tpl['id'], 'rules' => [
    ['type' => 'product', 'target' => '095000-5800', 'percent' => 25],
    ['type' => 'category', 'target' => 'Pompy CR', 'percent' => 5],
]], $adminTok);
t_ok($r['status'] === 200 && $r['json']['templateId'] === $tpl['id'] && count($r['json']['rules']) === 2, 'PUT customer discounts: szablon + 2 own rules');
$row = t_call('GET', '/api/admin/customers', null, $adminTok)['json'];
$c = array_values(array_filter($row, static fn($x) => $x['id'] === $customer['id']))[0];
t_ok($c['discountTemplateName'] === 'Warsztaty A' && $c['customRulesCount'] === 2, 'customer list shows the szablon name and own rule count');
t_ok(t_call('GET', '/api/admin/discount-templates', null, $adminTok)['json'][0]['customersCount'] === 1, 'szablon counts 1 customer');
t_ok((int) Db::val("SELECT COUNT(*) FROM audit_log WHERE action = 'customer_discount' AND entity_id = ?", [$customer['id']]) === 1, 'customer change audited as customer_discount');

// ---------- resolution in the catalogue ----------
// own product 25 → own category 5 → szablon product 30 → szablon category 20 → global 10
$list = t_call('GET', '/api/products', null, $tok)['json'];
t_ok($list['productDiscounts'] === true && (float) $list['discountPercent'] === 10.0, 'list: productDiscounts true, global % still at the top');
$d = $cardOf($list, '095000-5800');
t_ok((float) $d['discountPercent'] === 25.0 && $d['price']['unitGross'] === 44100 && $d['price']['listGross'] === 58800, 'own product rule 25% wins (58800 → 44100)');
$v = $cardOf($list, 'R00002D');
t_ok((float) $v['discountPercent'] === 20.0 && $v['variants'][0]['price']['unitGross'] === 64640 && $v['variants'][1]['price']['unitGross'] === 48400, 'szablon category 20% on both versions (80800 → 64640, 60500 → 48400)');
$p1 = $cardOf($list, 'BX-POMPA-01');
t_ok((float) $p1['discountPercent'] === 5.0 && $p1['price']['unitGross'] === 189999, 'own category rule 5% beats the szablon product rule 30% (199999 → 189999)');
$p2 = $cardOf($list, 'BX-POMPA-02');
t_ok((float) $p2['discountPercent'] === 5.0 && $p2['price']['unitGross'] === 142500, 'own category rule 5% (150000 → 142500)');
$a = $cardOf($list, 'BX-ADBLUE-01');
t_ok((float) $a['discountPercent'] === 10.0, 'no rule → global 10%');
$det = t_call('GET', '/api/products/095000-5800', null, $tok)['json'];
t_ok((float) $det['discountPercent'] === 25.0 && $det['productDiscounts'] === true && $det['price']['unitGross'] === 44100, 'detail: the product % and productDiscounts');
t_ok($cardOf(t_call('GET', '/api/products', null, $plainTok)['json'], '095000-5800')['price']['unitGross'] === 52920, 'another customer is not affected (per customer)');

// ---------- cart + order snapshot ----------
t_call('PUT', '/api/cart/items', ['sku' => '095000-5800', 'variant' => null, 'qty' => 2], $tok);
$cart = t_call('PUT', '/api/cart/items', ['sku' => 'R00002D', 'variant' => 'oryginalne', 'qty' => 1], $tok)['json'];
$lines = [];
foreach ($cart['lines'] as $l) {
    $lines[$l['sku']] = $l;
}
t_ok((float) $lines['095000-5800']['discountPercent'] === 25.0 && $lines['095000-5800']['lineGross'] === 88200, 'cart line: 25%, 2 × 44100');
t_ok((float) $lines['R00002D']['discountPercent'] === 20.0 && $lines['R00002D']['unitGross'] === 64640, 'cart line: 20% on the version');
t_ok($cart['productDiscounts'] === true && $cart['totals']['gross'] === 88200 + 64640, 'cart totals use per-product prices');

t_call('PUT', '/me/address', ['companyName' => 'Firma Testowa sp. z o.o.', 'street' => 'ul. Polna 5', 'postalCode' => '00-002',
    'city' => 'Kąty Wrocławskie', 'phone' => '+48 601 000 111'], $tok);
$r = t_call('POST', '/api/orders', [], $tok);
$order = $r['json'];
t_ok($r['status'] === 201 && $order['productDiscounts'] === true && $order['totals']['gross'] === 88200 + 64640, 'order: per-product totals, productDiscounts true');
$items = [];
foreach ($order['items'] as $i) {
    $items[$i['sku']] = $i;
}
t_ok((float) $items['095000-5800']['discountPercent'] === 25.0 && (float) $items['R00002D']['discountPercent'] === 20.0, 'order items keep their %');
$mail = t_mail_log();
t_ok(str_contains($mail, 'wg pozycji') && str_contains($mail, 'Rabat: 25%'), 'company mail shows the per-line %');

// ---------- live link: editing the szablon ----------
$keyRes = t_call('POST', '/api/me/api-keys', ['name' => 'ERP'], $tok);
$key = $keyRes['json']['key'];
$since = now_iso();
usleep(5000);
$r = t_call('PUT', '/api/admin/discount-templates/' . $tpl['id'], ['name' => 'Warsztaty A', 'rules' => [
    ['type' => 'category', 'target' => 'Wtryskiwacze', 'percent' => 50],
]], $adminTok);
t_ok($r['status'] === 200 && count($r['json']['rules']) === 1, 'PUT szablon replaces its rules');
$v = $cardOf(t_call('GET', '/api/products', null, $tok)['json'], 'R00002D');
t_ok((float) $v['discountPercent'] === 50.0 && $v['variants'][0]['price']['unitGross'] === 40400, 'szablon edit moves the linked customer\'s prices at once');
$again = t_call('GET', '/api/orders/' . $order['id'], null, $tok)['json'];
t_ok($again['totals'] === $order['totals'] && (float) $again['items'][1]['discountPercent'] === (float) $order['items'][1]['discountPercent'], 'R-06: the placed order keeps its prices and %');
$v1 = t_call('GET', '/api/v1/products', null, $key, ['updatedSince' => $since])['json'];
t_ok(($v1['total'] ?? 0) === 5, 'v1 updatedSince: a szablon edit re-sends every active product');
$v1r = array_values(array_filter($v1['items'] ?? [], static fn($x) => $x['sku'] === 'R00002D'))[0] ?? [];
t_ok((float) ($v1r['discountPercent'] ?? -1) === 50.0 && (float) $v1['discountPercent'] === 10.0, 'v1: product % on the item, global % in the meta');

// ---------- delete szablon ----------
t_ok(t_call('DELETE', '/api/admin/discount-templates/' . $tpl['id'], null, $adminTok)['status'] === 204, 'DELETE szablon → 204');
$r = t_call('GET', $path, null, $adminTok)['json'];
t_ok($r['templateId'] === null && count($r['rules']) === 2, 'customer unlinked, own rules kept');
$v = $cardOf(t_call('GET', '/api/products', null, $tok)['json'], 'R00002D');
t_ok((float) $v['discountPercent'] === 10.0, 'after delete the product falls back to the global %');
t_ok((int) Db::val('SELECT COUNT(*) FROM discount_rules WHERE template_id IS NOT NULL') === 0, 'szablon rules deleted with it');
t_ok(t_call('DELETE', '/api/admin/discount-templates/' . $tpl['id'], null, $adminTok)['status'] === 404, 'deleted szablon → 404');

// ---------- clearing own rules ----------
$r = t_call('PUT', $path, ['templateId' => null, 'rules' => []], $adminTok);
t_ok($r['status'] === 200 && $r['json']['rules'] === [], 'own rules cleared');
t_ok(t_call('GET', '/api/products', null, $tok)['json']['productDiscounts'] === false, 'no rules left → productDiscounts false');
