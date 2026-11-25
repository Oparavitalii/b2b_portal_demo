<?php

declare(strict_types=1);

/** T-06 smoke: /api/cart and /api/orders — koszyk, zamówienie + mail do firmy, historia (R-05, R-06, R-10). */
require __DIR__ . '/Harness.php';
require __DIR__ . '/Fixtures/products_fixture.php';

putenv('ORDER_EMAIL=zamowienia@catalog-demo.test');

t_reset();
t_products_fixture();

$customer = t_user('customer', ['email' => 'klient@example.com', 'nip' => '1234567890', 'discount_percent' => 10]);
$tok = t_token($customer);
$lineOf = static fn(array $cart, string $sku, ?string $variant = null): ?array => array_values(array_filter(
    $cart['lines'] ?? [],
    static fn(array $l) => $l['sku'] === $sku && $l['variant'] === $variant,
))[0] ?? null;

// ---------- access ----------
t_ok(t_call('GET', '/api/cart')['status'] === 401, 'guest GET /cart → 401');
$r = t_call('GET', '/api/cart', null, $tok);
t_ok($r['status'] === 200 && $r['json']['lines'] === [] && $r['json']['count'] === 0
    && $r['json']['totals'] === ['net' => 0, 'gross' => 0, 'deposit' => 0, 'grossWithDeposit' => 0]
    && (float) $r['json']['discountPercent'] === 10.0 && $r['json']['hasPriceOnRequest'] === false, 'empty cart shape');
$admin = t_user('admin');
$adminTok = t_token($admin);
t_ok(t_call('GET', '/cart', null, $adminTok)['status'] === 200, 'admin may use the cart');

// ---------- add / update / remove ----------
$r = t_call('PUT', '/cart/items', ['sku' => '095000-5800', 'variant' => null, 'qty' => 2], $tok);
t_ok($r['status'] === 200 && count($r['json']['lines']) === 1 && $r['json']['count'] === 2, 'PUT adds a line');
$l = $lineOf($r['json'], '095000-5800');
t_ok($l !== null && array_keys($l) === ['id', 'sku', 'name', 'image', 'imageUrl', 'variant', 'qty', 'discountPercent', 'priceOnRequest', 'unitNet', 'unitGross',
    'unitDeposit', 'lineNet', 'lineGross', 'lineDeposit', 'stock', 'leadTimeHours'] && $l['stock'] === 10 && $l['leadTimeHours'] === null && $l['imageUrl'] === '/img/products/Produkt_Denso_095000_5800.webp', 'cart line shape');
$r = t_call('PUT', '/cart/items', ['sku' => '095000-5800', 'variant' => null, 'qty' => 3], $tok);
t_ok(count($r['json']['lines']) === 1 && $lineOf($r['json'], '095000-5800')['qty'] === 3, 'PUT same sku sets qty (no duplicate line)');
t_ok((int) Db::val('SELECT COUNT(*) FROM cart_items WHERE user_id = ?', [$customer['id']]) === 1, 'one cart_items row');
t_call('PUT', '/cart/items', ['sku' => 'BX-POMPA-02', 'qty' => 1], $tok);
$r = t_call('PUT', '/cart/items', ['sku' => 'BX-POMPA-02', 'variant' => null, 'qty' => 0], $tok);
t_ok($r['status'] === 200 && $lineOf($r['json'], 'BX-POMPA-02') === null && count($r['json']['lines']) === 1, 'qty 0 removes the line');

// ---------- validation ----------
$r = t_call('PUT', '/cart/items', ['sku' => 'NIE-MA', 'variant' => null, 'qty' => 1], $tok);
t_ok($r['status'] === 404, 'unknown sku → 404');
t_ok(t_call('PUT', '/cart/items', ['sku' => 'BX-OLD-01', 'variant' => null, 'qty' => 1], $tok)['status'] === 404, 'inactive sku → 404');
$r = t_call('PUT', '/cart/items', ['sku' => 'R00002D', 'variant' => null, 'qty' => 1], $tok);
t_ok($r['status'] === 422 && $r['json']['error'] === 'variant_required', 'product with variants without variant → 422 variant_required');
$r = t_call('PUT', '/cart/items', ['sku' => '095000-5800', 'variant' => 'oryginalne', 'qty' => 1], $tok);
t_ok($r['status'] === 422 && $r['json']['error'] === 'invalid_variant', 'variant on product without variants → 422 invalid_variant');
t_ok(t_call('PUT', '/cart/items', ['sku' => '095000-5800', 'variant' => null, 'qty' => 1000], $tok)['status'] === 400, 'qty 1000 → 400');
t_ok(t_call('PUT', '/cart/items', ['sku' => '095000-5800', 'variant' => 'inne', 'qty' => 1], $tok)['status'] === 400, 'unknown variant name → 400');

// ---------- variants + price on request + discount 10% ----------
t_call('PUT', '/cart/items', ['sku' => 'R00002D', 'variant' => 'oryginalne', 'qty' => 1], $tok);
t_call('PUT', '/cart/items', ['sku' => 'R00002D', 'variant' => 'zamienne', 'qty' => 2], $tok);
$r = t_call('PUT', '/cart/items', ['sku' => 'BX-ADBLUE-01', 'variant' => null, 'qty' => 1], $tok);
$cart = $r['json'];
t_ok(count($cart['lines']) === 4 && $cart['count'] === 7, 'variant lines are separate lines (4 lines, 7 pcs)');

// Expected, computed by hand in grosze (discount 10% on the product price, never on the kaucja):
// 095000-5800: 58800 → 52920 gross, net round(52920/1.23)=43024; × 3; deposit 15000 × 3
// R00002D oryg.: 80800 → 72720 gross, net 59122; × 1; deposit 15000
// R00002D zam.: 60500 → 54450 gross, net 44268; × 2; deposit 15000 × 2
$denso = $lineOf($cart, '095000-5800');
t_ok($denso['unitGross'] === 52920 && $denso['unitNet'] === 43024 && $denso['lineGross'] === 158760 && $denso['lineNet'] === 129072, 'discounted unit/line prices exact');
t_ok($denso['unitDeposit'] === 15000 && $denso['lineDeposit'] === 45000, 'deposit not discounted');
t_ok($lineOf($cart, 'R00002D', 'oryginalne')['unitGross'] === 72720 && $lineOf($cart, 'R00002D', 'zamienne')['unitGross'] === 54450, 'variant prices from the chosen variant');
$por = $lineOf($cart, 'BX-ADBLUE-01');
t_ok($por['priceOnRequest'] === true && $por['unitNet'] === null && $por['lineGross'] === null && $cart['hasPriceOnRequest'] === true, 'price-on-request line flagged');
$net = 129072 + 59122 + 44268 * 2;
$gross = 158760 + 72720 + 54450 * 2;
$deposit = 45000 + 15000 + 30000;
t_ok($cart['totals'] === ['net' => $net, 'gross' => $gross, 'deposit' => $deposit, 'grossWithDeposit' => $gross + $deposit],
    "totals exact in grosze (net $net, gross $gross, deposit $deposit; price-on-request excluded)");

// ---------- order without address ----------
$r = t_call('POST', '/orders', [], $tok);
t_ok($r['status'] === 422 && $r['json']['error'] === 'address_required', 'order without address → 422 address_required');
$bare = t_user('customer', ['email' => 'bez.danych@example.com', 'company_name' => null, 'nip' => null, 'contact_name' => null, 'phone' => null]);
$r = t_call('POST', '/orders', [], t_token($bare));
t_ok($r['status'] === 422 && $r['json']['error'] === 'company_data_required', 'order without company data → 422 company_data_required');
t_ok(t_call('POST', '/orders', [], $adminTok)['status'] === 403, 'admin cannot order → 403');
t_ok(t_mails() === [], 'no mail before an order exists');

t_call('PUT', '/me/address', ['companyName' => 'Firma Testowa sp. z o.o.', 'street' => 'ul. Polna 5', 'postalCode' => '00-002',
    'city' => 'Kąty Wrocławskie', 'phone' => '+48 601 000 111'], $tok);
t_ok(t_call('POST', '/orders', ['note' => str_repeat('x', 1001)], $tok)['status'] === 400, 'note > 1000 chars → 400');

// ---------- order ----------
$r = t_call('POST', '/api/orders', ['note' => "Proszę o kontakt <b>przed</b> wysyłką.\nDziękuję."], $tok);
$year = gmdate('Y');
$order = $r['json'];
t_ok($r['status'] === 201 && $order['number'] === "CDM-$year-0001", "order → 201, number CDM-$year-0001");
t_ok($order['totals'] === $cart['totals'] && count($order['items']) === 4 && $order['itemsCount'] === 4 && (float) $order['discountPercent'] === 10.0,
    'order totals = cart totals, 4 items, discount 10%');
t_ok($order['customer'] === ['companyName' => 'Firma Testowa sp. z o.o.', 'nip' => '1234567890', 'contactName' => 'Anna Testowa',
    'phone' => '+48 500 000 000', 'email' => 'klient@example.com'], 'customer snapshot');
t_ok($order['address']['street'] === 'ul. Polna 5' && $order['address']['country'] === 'Polska', 'address snapshot');
$row = Db::one('SELECT * FROM orders WHERE id = ?', [$order['id']]);
t_ok((int) $row['total_net'] === $net && (int) $row['total_gross'] === $gross && (int) $row['total_deposit'] === $deposit, 'totals stored in grosze');
$items = Db::all('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid', [$order['id']]);
t_ok((int) $items[0]['unit_gross'] === 52920 && (int) $items[0]['unit_net'] === 43024 && (int) $items[0]['unit_deposit'] === 15000, 'order_items keep unit prices');
$porItem = array_values(array_filter($items, static fn($i) => $i['sku'] === 'BX-ADBLUE-01'))[0];
t_ok((int) $porItem['price_on_request'] === 1 && $porItem['unit_gross'] === null, 'price-on-request item stored flagged');
t_ok(t_call('GET', '/cart', null, $tok)['json']['lines'] === [], 'cart cleared after the order');
t_ok((int) Db::val("SELECT stock FROM products WHERE sku = '095000-5800'") === 10, 'order does not lower stock (display only)');

$mails = t_mails();
t_ok(count($mails) === 1 && $mails[0]['to'] === 'zamowienia@catalog-demo.test', 'exactly one mail, to ORDER_EMAIL');
t_ok(str_contains(t_mail_log(), "CDM-$year-0001") && str_contains(t_mail_log(), '1234567890'), 'mail contains the order number and NIP');
t_ok(!str_contains(implode("\n", array_column($mails, 'to')), 'klient@example.com'), 'no mail to the customer');
t_ok($mails[0]['subject'] === "Nowe zamówienie CDM-$year-0001 — Firma Testowa sp. z o.o.", 'mail subject');
$html = $mails[0]['html'];
t_ok(str_contains($html, '529,20 zł') && str_contains($html, 'Cena na zapytanie') && str_contains($html, '150,00 zł')
    && str_contains($html, 'Kaucja (VAT 0%)') && str_contains($html, '10%'), 'mail: discounted price, price on request, kaucja, discount');
t_ok(str_contains($html, 'Proszę o kontakt &lt;b&gt;przed&lt;/b&gt; wysyłką.<br />') && !str_contains($html, '<b>przed</b>'), 'mail: note escaped');
t_ok(str_contains($mails[0]['text'], 'Razem do zapłaty (brutto + kaucja): ' . OrderMail::money($gross + $deposit)) && str_contains($mails[0]['text'], 'NIP: 1234567890'),
    'mail: plain text alternative with totals');

// ---------- empty cart / numbering ----------
$r = t_call('POST', '/orders', [], $tok);
t_ok($r['status'] === 422 && $r['json']['error'] === 'cart_empty', 'empty cart → 422 cart_empty');
t_ok(count(t_mails()) === 1, 'no mail for a refused order');
t_call('PUT', '/cart/items', ['sku' => 'BX-POMPA-02', 'variant' => null, 'qty' => 1], $tok);
$second = t_call('POST', '/orders', null, $tok)['json'];
t_ok(($second['number'] ?? '') === "CDM-$year-0002" && $second['note'] === null, 'next order → CDM-<year>-0002');
t_ok(OrdersService::nextNumber('2099') === 'CDM-2099-0001', 'numbering restarts per year');

// ---------- history ----------
$r = t_call('GET', '/orders', null, $tok);
t_ok($r['status'] === 200 && array_column($r['json']['items'], 'number') === ["CDM-$year-0002", "CDM-$year-0001"], 'GET /orders newest first');
$first = $r['json']['items'][1];
t_ok(array_keys($first) === ['id', 'number', 'createdAt', 'totals', 'itemsCount', 'hasPriceOnRequest'] && $first['itemsCount'] === 4
    && $first['totals']['gross'] === $gross, 'list item shape');
$r = t_call('GET', '/orders/' . $order['id'], null, $tok);
t_ok($r['status'] === 200 && $r['json'] === array_diff_key($order, ['mailSent' => true]), 'GET /orders/:id = the created order');

$other = t_user('customer', ['email' => 'inny@example.com']);
$otherTok = t_token($other);
t_ok(t_call('GET', '/orders/' . $order['id'], null, $otherTok)['status'] === 404, 'other customer → 404 on /orders/:id');
t_ok(t_call('GET', '/orders', null, $otherTok)['json']['items'] === [], 'other customer sees no orders');
t_ok(t_call('GET', '/orders/not-a-uuid', null, $tok)['status'] === 400, 'non-uuid id → 400');

// ---------- discount change applies to the cart, not to sent orders ----------
Db::update('users', ['discount_percent' => 0], ['id' => $customer['id']]);
$r = t_call('PUT', '/cart/items', ['sku' => '095000-5800', 'variant' => null, 'qty' => 1], $tok);
t_ok($lineOf($r['json'], '095000-5800')['unitGross'] === 58800, 'cart uses the current discount');
t_ok(t_call('GET', '/orders/' . $order['id'], null, $tok)['json']['totals'] === $order['totals'], 'sent order keeps its prices');

// ---------- DELETE /cart ----------
$r = t_call('DELETE', '/cart', null, $tok);
t_ok($r['status'] === 204 && t_call('GET', '/cart', null, $tok)['json']['count'] === 0, 'DELETE /cart → 204, cart empty');

t_ok($order['mailSent'] === true, 'created order reports mailSent=true');

// ---------- no ORDER_EMAIL with the log driver: local dev recipient ----------
putenv('ORDER_EMAIL=');
$mailsBefore = count(t_mails());
t_call('PUT', '/cart/items', ['sku' => 'BX-POMPA-02', 'variant' => null, 'qty' => 1], $tok);
$r = t_call('POST', '/orders', [], $tok);
$mails = t_mails();
t_ok($r['status'] === 201 && $r['json']['mailSent'] === true && count($mails) === $mailsBefore + 1
    && end($mails)['to'] === OrderMail::DEV_RECIPIENT, 'log driver without ORDER_EMAIL → mail to the local dev recipient');

// ---------- no ORDER_EMAIL with SMTP: fail before saving, cart kept ----------
putenv('MAIL_DRIVER=smtp');
$ordersBefore = (int) Db::val('SELECT COUNT(*) FROM orders');
t_call('PUT', '/cart/items', ['sku' => 'BX-POMPA-02', 'variant' => null, 'qty' => 1], $tok);
$r = t_call('POST', '/orders', [], $tok);
t_ok($r['status'] === 503 && ($r['json']['error'] ?? '') === 'order_email_not_configured', 'smtp without ORDER_EMAIL → 503 order_email_not_configured');
t_ok((int) Db::val('SELECT COUNT(*) FROM orders') === $ordersBefore && t_call('GET', '/cart', null, $tok)['json']['count'] === 1,
    'no order saved, cart kept');
$h = t_call('GET', '/health');
t_ok($h['json']['mail']['orderEmailConfigured'] === false, 'health reports orderEmailConfigured=false');

// ---------- SMTP down after commit: order saved, mailSent=false, failure logged ----------
putenv('ORDER_EMAIL=zamowienia@catalog-demo.test');
putenv('MAIL_HOST=127.0.0.1');
putenv('MAIL_PORT=1');
$r = t_call('POST', '/orders', [], $tok);
$log = is_file(storage_path('error.log')) ? (string) file_get_contents(storage_path('error.log')) : '';
t_ok($r['status'] === 201 && $r['json']['mailSent'] === false && str_contains($log, 'order mail NOT sent for ' . $r['json']['number']),
    'SMTP failure → order saved, mailSent=false, failure logged');
putenv('MAIL_DRIVER=log');
