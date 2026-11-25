<?php

declare(strict_types=1);

/** T-03 smoke: /api/me — data, password change, address, account deletion (R-07, R-08, R-09, R-04, R-12). */
require __DIR__ . '/Harness.php';

t_reset();
t_seed();

$customer = t_user('customer', ['email' => 'konto@example.com']);
$uid = $customer['id'];
$access = t_login('konto@example.com', T_PASSWORD)['json']['accessToken'] ?? '';
t_ok($access !== '', 'customer logs in');

// ---------- GET /me ----------
t_ok(t_call('GET', '/me')['status'] === 401, 'GET /me without token → 401');
$r = t_call('GET', '/api/me', null, $access);
t_ok($r['status'] === 200 && array_keys($r['json']) === ['id', 'email', 'role', 'companyName', 'nip', 'contactName', 'phone', 'discountPercent']
    && $r['json']['id'] === $uid && $r['json']['role'] === 'customer', 'GET /me → public user shape');

// ---------- PATCH /me ----------
$r = t_call('PATCH', '/me', ['companyName' => 'Nowa Nazwa sp. z o.o.', 'nip' => '111 222 33 44', 'role' => 'admin', 'discountPercent' => 50], $access);
t_ok($r['status'] === 200 && $r['json']['companyName'] === 'Nowa Nazwa sp. z o.o.' && $r['json']['nip'] === '1112223344'
    && $r['json']['contactName'] === 'Anna Testowa', 'PATCH /me updates given fields, keeps the rest');
$row = Db::one('SELECT * FROM users WHERE id = ?', [$uid]);
t_ok($row['role'] === 'customer' && (float) $row['discount_percent'] === 0.0, 'PATCH /me ignores role and discountPercent');
$r = t_call('PATCH', '/me', ['nip' => '12', 'phone' => 'abc'], $access);
$paths = array_unique(array_map(static fn(array $i) => implode('.', $i['path']), $r['json']['error']['issues'] ?? []));
t_ok($r['status'] === 400 && array_values($paths) === ['nip', 'phone'] && Db::val('SELECT nip FROM users WHERE id = ?', [$uid]) === '1112223344',
    'PATCH /me with bad NIP + phone → 400, nothing saved');
t_ok((int) Db::val("SELECT COUNT(*) FROM audit_log WHERE action = 'account_update'") === 1, 'account update audited');

// ---------- POST /me/password ----------
$second = t_login('konto@example.com', T_PASSWORD)['json']['accessToken'] ?? '';
t_ok(t_call('GET', '/me', null, $second)['status'] === 200, 'second session works before the change');
$r = t_call('POST', '/me/password', ['currentPassword' => 'zle-haslo', 'newPassword' => 'NoweHaslo123!'], $access);
t_ok($r['status'] === 400 && $r['json'] === ['error' => 'wrong_password'], 'wrong current password → 400 wrong_password');
$r = t_call('POST', '/me/password', ['currentPassword' => T_PASSWORD, 'newPassword' => 'krotkie'], $access);
t_ok($r['status'] === 400 && ($r['json']['error']['issues'][0]['path'] ?? null) === ['newPassword'], 'new password < 8 → 400');
$r = t_call('POST', '/me/password', ['currentPassword' => T_PASSWORD, 'newPassword' => 'NoweHaslo123!'], $access);
t_ok($r['status'] === 204, 'password change → 204');
t_ok(t_call('GET', '/me', null, $second)['status'] === 401, 'other session revoked after password change');
t_ok(t_call('GET', '/me', null, $access)['status'] === 200, 'current session stays alive');
t_ok(t_login('konto@example.com', T_PASSWORD)['status'] === 401, 'old password rejected');
$r = t_login('konto@example.com', 'NoweHaslo123!');
t_ok($r['status'] === 200, 'login with the new password');

// ---------- address ----------
$r = t_call('GET', '/me/address', null, $access);
t_ok($r['status'] === 200 && $r['json'] === null, 'GET /me/address without an address → 200 null');
$address = ['companyName' => 'Nowa Nazwa sp. z o.o.', 'street' => 'ul. Polna 5', 'postalCode' => '00-002',
    'city' => 'Przykładowo', 'phone' => '+48 601 000 111'];
$r = t_call('PUT', '/me/address', $address, $access);
t_ok($r['status'] === 200 && $r['json']['street'] === 'ul. Polna 5' && $r['json']['country'] === 'Polska'
    && $r['json']['postalCode'] === '00-002', 'PUT /me/address → saved, country defaults to Polska');
$r = t_call('PUT', '/me/address', ['street' => 'ul. Leśna 7', 'city' => 'Wrocław', 'phone' => ''] + $address, $access);
$r = t_call('GET', '/me/address', null, $access);
t_ok($r['status'] === 200 && $r['json']['street'] === 'ul. Leśna 7' && $r['json']['city'] === 'Wrocław' && $r['json']['phone'] === null,
    'PUT again updates the one address (empty phone → null)');
t_ok((int) Db::val('SELECT COUNT(*) FROM addresses WHERE user_id = ?', [$uid]) === 1, 'still one address row');
$r = t_call('PUT', '/me/address', ['postalCode' => '55080'] + $address, $access);
t_ok($r['status'] === 400 && ($r['json']['error']['issues'][0]['path'] ?? null) === ['postalCode'], 'postal code not NN-NNN → 400');
$r = t_call('PUT', '/me/address', ['postalCode' => '00-002'], $access);
t_ok($r['status'] === 400, 'PUT /me/address with missing fields → 400');

// ---------- DELETE /me ----------
$admin = Db::one('SELECT * FROM users WHERE email = ?', [T_ADMIN_EMAIL]);
$r = t_call('DELETE', '/me', ['password' => T_ADMIN_PASSWORD], t_token($admin));
t_ok($r['status'] === 403 && Db::val('SELECT 1 FROM users WHERE id = ?', [$admin['id']]) !== null, 'admin cannot DELETE /me → 403, admin kept');

Db::insert('products', ['sku' => 'BX-TEST-1', 'name' => 'Wtryskiwacz testowy', 'price_gross' => 12300]);
Db::insert('cart_items', ['id' => uuid4(), 'user_id' => $uid, 'sku' => 'BX-TEST-1', 'variant' => null, 'qty' => 2]);
$orderId = uuid4();
Db::insert('orders', [
    'id' => $orderId,
    'number' => 'CDM-2026-0001',
    'user_id' => $uid,
    'customer_snapshot' => ['email' => 'konto@example.com', 'companyName' => 'Nowa Nazwa sp. z o.o.'],
    'address_snapshot' => $address,
    'discount_percent' => 0,
    'total_net' => 10000,
    'total_gross' => 12300,
    'total_deposit' => 0,
    'created_at' => now_iso(),
]);
Db::insert('order_items', ['id' => uuid4(), 'order_id' => $orderId, 'sku' => 'BX-TEST-1', 'name' => 'Wtryskiwacz testowy',
    'variant' => null, 'qty' => 1, 'unit_net' => 10000, 'unit_gross' => 12300, 'unit_deposit' => 0]);
Db::exec('DELETE FROM rate_limits');
t_call('POST', '/auth/password-reset/request', ['email' => 'konto@example.com']);

$r = t_call('DELETE', '/me', ['password' => 'zle-haslo'], $access);
t_ok($r['status'] === 400 && $r['json'] === ['error' => 'wrong_password'], 'DELETE /me with wrong password → 400 wrong_password');
t_ok(Db::val('SELECT 1 FROM users WHERE id = ?', [$uid]) !== null, 'account kept after wrong password');
$r = t_call('DELETE', '/me', [], $access);
t_ok($r['status'] === 400, 'DELETE /me without password → 400');

$r = t_call('DELETE', '/api/me', ['password' => 'NoweHaslo123!'], $access);
t_ok($r['status'] === 204 && str_contains($r['setCookie']['refresh_token'] ?? '', 'Max-Age=0'), 'DELETE /me → 204 + refresh cookie cleared');
t_ok(Db::val('SELECT 1 FROM users WHERE id = ?', [$uid]) === null, 'user row deleted');
foreach (['cart_items', 'addresses', 'sessions', 'password_reset_tokens', 'email_verification_tokens'] as $table) {
    t_ok((int) Db::val("SELECT COUNT(*) FROM $table WHERE user_id = ?", [$uid]) === 0, "$table of the user removed");
}
$order = Db::one('SELECT * FROM orders WHERE id = ?', [$orderId]);
t_ok($order !== null && $order['user_id'] === null && json_decode($order['customer_snapshot'], true)['email'] === 'konto@example.com',
    'order kept with user_id NULL and its snapshot');
t_ok((int) Db::val('SELECT COUNT(*) FROM order_items WHERE order_id = ?', [$orderId]) === 1, 'order items kept');
t_ok(t_call('GET', '/me', null, $access)['status'] === 401, 'token of the deleted account rejected');
t_ok(t_login('konto@example.com', 'NoweHaslo123!')['status'] === 401, 'deleted account cannot log in');
t_ok((int) Db::val("SELECT COUNT(*) FROM audit_log WHERE action = 'account_delete' AND entity_id = ?", [$uid]) === 1, 'deletion audited');
