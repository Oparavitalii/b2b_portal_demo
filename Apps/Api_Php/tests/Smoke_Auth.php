<?php

declare(strict_types=1);

/** T-01 smoke: core (router, validator, db helpers, mail) + /api/auth/* against the seeded admin. */
require __DIR__ . '/Harness.php';

t_reset();
$seedError = static function (string $password): ?string {
    putenv('ADMIN_PASSWORD=' . $password);
    try {
        t_seed();
        return null;
    } catch (RuntimeException $e) {
        return $e->getMessage();
    } finally {
        putenv('ADMIN_PASSWORD=' . T_ADMIN_PASSWORD);
    }
};
t_ok(str_contains((string) $seedError(''), 'ADMIN_PASSWORD is not set'), 'Seed refuses to run without ADMIN_PASSWORD');
t_ok(str_contains((string) $seedError('short-pass1'), 'ADMIN_PASSWORD is too short'), 'Seed refuses an ADMIN_PASSWORD under 12 characters');
t_ok((int) Db::val('SELECT COUNT(*) FROM users') === 0, 'refused seed wrote nothing');
$seeded = t_seed();
t_ok($seeded === [T_ADMIN_EMAIL => 'created', 'demo@catalog-demo.local' => 'created'], 'Seed creates admin + demo customer');
t_ok(t_seed() === [T_ADMIN_EMAIL => 'exists', 'demo@catalog-demo.local' => 'exists'], 'Seed is idempotent');
t_ok((int) Db::val('SELECT COUNT(*) FROM users') === 2 && (int) Db::val('SELECT COUNT(*) FROM addresses') === 1, 'no duplicates after second seed');
$demo = Db::one("SELECT * FROM users WHERE email = 'demo@catalog-demo.local'");
t_ok($demo['role'] === 'customer' && $demo['status'] === 'active' && (float) $demo['discount_percent'] === 10.0
    && $demo['company_name'] !== null && $demo['nip'] !== null, 'demo customer: active, company data, discount 10');

// ---------- router ----------
$r = t_call('GET', '/definitely/not/here');
t_ok($r['status'] === 404 && $r['body'] === '{"error":"NOT_FOUND"}', 'unknown route → 404 {"error":"NOT_FOUND"}');
Router::get('/__smoke/items/:id', static fn(Request $q) => Response::json(['via' => 'param', 'id' => $q->params['id']]), ['auth' => false]);
Router::get('/__smoke/items/registry', static fn(Request $q) => Response::json(['via' => 'literal']), ['auth' => false]);
Router::get('/__smoke/private', static fn(Request $q) => Response::json(['uid' => $q->userId, 'role' => $q->role]));
Router::get('/__smoke/admin-only', static fn(Request $q) => Response::json(['ok' => true]), ['roles' => ['admin']]);
t_ok((t_call('GET', '/api/__smoke/items/registry')['json']['via'] ?? null) === 'literal', 'literal segment beats :param (via /api prefix)');
$r = t_call('GET', '/__smoke/items/not-a-uuid');
t_ok($r['status'] === 400 && ($r['json']['error']['issues'][0]['path'] ?? null) === ['id'], 'non-uuid :id → 400 zod shape');
$r = t_call('GET', '/__smoke/private');
t_ok($r['status'] === 401 && $r['json'] === ['error' => 'UNAUTHORIZED'], 'routes require auth by default → 401');
$r = t_call('GET', '/__smoke/admin-only', null, t_token($demo));
t_ok($r['status'] === 403 && $r['json'] === ['error' => 'FORBIDDEN'], 'roles guard: customer on admin route → 403');

// ---------- validator / db helpers ----------
$r = t_call('POST', '/api/auth/login', []);
$issues = $r['json']['error']['issues'] ?? [];
t_ok($r['status'] === 400 && count($issues) === 2 && $issues[0]['path'] === ['email'] && $issues[0]['message'] === 'Required', 'login {} → 400 Required issues');
Db::insert('products', ['sku' => 'BX-ŁÓDŹ-1', 'name' => 'Sprężarka ŁÓDŹ', 'price_gross' => 100]);
t_ok((int) Db::val("SELECT COUNT(*) FROM products WHERE ulower(name) LIKE :q ESCAPE '\\'", ['q' => Db::like('sprężarka łódź')]) === 1, 'ulower() + Db::like match Polish case-insensitively');
$page = paginate('FROM products', [], 'sku, name, active', 'sku', 1, 20);
t_ok($page['total'] === 1 && $page['items'][0]['active'] === true, 'paginate() shape + Row::camel bools');

// ---------- login ----------
$r = t_login('  Admin@Catalog-Demo.local ', T_ADMIN_PASSWORD);
$user = $r['json']['user'] ?? [];
t_ok($r['status'] === 200 && is_string($r['json']['accessToken'] ?? null) && !isset($r['json']['refreshToken']), 'seeded admin login → accessToken, no refreshToken in JSON');
t_ok(array_keys($user) === ['id', 'email', 'role', 'companyName', 'nip', 'contactName', 'phone', 'discountPercent'] && $user['role'] === 'admin', 'login → public user shape');
$cookie = $r['cookies']['refresh_token'] ?? '';
$setCookie = $r['setCookie']['refresh_token'] ?? '';
t_ok($cookie !== '' && str_contains($setCookie, 'Path=/api/auth') && str_contains($setCookie, 'HttpOnly')
    && str_contains($setCookie, 'SameSite=Lax') && str_contains($setCookie, 'Max-Age=604800'), 'refresh cookie: Path=/api/auth, HttpOnly, Lax, 7 d');
$access = $r['json']['accessToken'];
$payload = Auth::verifyAccess($access);
t_ok(($payload['iss'] ?? null) === 'catalog-portal', "JWT issuer 'catalog-portal'");
$r = t_call('GET', '/__smoke/private', null, $access);
t_ok($r['status'] === 200 && $r['json']['role'] === 'admin', 'access token authenticates');
t_ok((int) Db::val("SELECT COUNT(*) FROM audit_log WHERE action = 'login'") === 1, 'login audited');

$r = t_login(T_ADMIN_EMAIL, 'wrong-password');
t_ok($r['status'] === 401 && $r['json'] === ['error' => 'INVALID_CREDENTIALS'], 'wrong password → 401 INVALID_CREDENTIALS');
t_ok(t_login('ghost@example.com', T_ADMIN_PASSWORD)['json'] === ['error' => 'INVALID_CREDENTIALS'], 'unknown e-mail → 401 INVALID_CREDENTIALS');

$pending = t_user('customer', ['email' => 'pending@example.com', 'status' => 'pending', 'email_verified_at' => null]);
$r = t_login('pending@example.com', T_PASSWORD);
t_ok($r['status'] === 403 && $r['json'] === ['error' => 'email_not_verified'] && $r['cookies'] === [], 'pending user → 403 email_not_verified, no session');
t_ok(t_login('pending@example.com', 'wrong-password')['status'] === 401, 'pending user + wrong password → 401 (status not revealed)');
t_ok(t_call('GET', '/__smoke/private', null, t_token($pending))['status'] === 401, 'token of a pending user is rejected');

Db::exec('DELETE FROM rate_limits');
// Correct logins are never counted; only wrong passwords fill the bucket (20 per 15 min per IP).
$ok = ['email' => T_ADMIN_EMAIL, 'password' => T_ADMIN_PASSWORD];
for ($i = 0; $i < 25; $i++) {
    $r = t_call('POST', '/auth/login', $ok);
}
t_ok($r['status'] === 200 && (int) Db::val('SELECT COUNT(*) FROM rate_limits') === 0, '25 correct logins in a row → still 200, nothing counted');
for ($i = 0; $i < 20; $i++) {
    $r = t_call('POST', '/auth/login', ['email' => 'ghost@example.com', 'password' => 'x']);
}
t_ok($r['status'] === 401, '20th wrong password → still 401');
$r = t_call('POST', '/auth/login', ['email' => 'ghost@example.com', 'password' => 'x']);
t_ok($r['status'] === 429 && $r['json'] === ['error' => 'TOO_MANY_REQUESTS', 'meta' => ['retryAfter' => 900]], '21st attempt after 20 wrong passwords → 429');
t_ok(t_call('POST', '/auth/login', $ok)['status'] === 429, 'the IP that guessed 20 times waits, even with a correct password');
Db::exec('UPDATE rate_limits SET window_start = window_start - 900');
t_ok(t_call('POST', '/auth/login', $ok)['status'] === 200, 'after the 15 min window → login works again');
Db::exec('DELETE FROM rate_limits');

// ---------- refresh ----------
t_ok(t_call('POST', '/auth/refresh')['json'] === ['error' => 'UNAUTHORIZED'], 'refresh without cookie → 401');
t_ok(t_call('POST', '/auth/refresh', null, null, [], ['refresh_token' => 'garbage.token.value'])['json'] === ['error' => 'INVALID_REFRESH'], 'refresh with bad JWT → 401 INVALID_REFRESH');
$r = t_call('POST', '/api/auth/refresh', null, null, [], ['refresh_token' => $cookie]);
$newCookie = $r['cookies']['refresh_token'] ?? '';
t_ok($r['status'] === 200 && array_keys($r['json']) === ['accessToken'] && $newCookie !== '' && $newCookie !== $cookie
    && str_contains($r['setCookie']['refresh_token'], 'Path=/api/auth'), 'refresh → new accessToken + rotated cookie');
$refreshed = $r['json']['accessToken'];
t_ok(t_call('GET', '/__smoke/private', null, $refreshed)['status'] === 200, 'refreshed access token works');
$r = t_call('POST', '/auth/refresh', null, null, [], ['refresh_token' => $cookie]);
t_ok($r['status'] === 200 && $r['cookies'] === [], 'replay within 60 s grace → accessToken, no new cookie');
$oldSid = Db::val('SELECT id FROM sessions WHERE refresh_token_hash = ?', [hash('sha256', $cookie)]);
Db::update('sessions', ['rotated_at' => now_iso(-120)], ['id' => $oldSid]);
t_ok(t_call('POST', '/auth/refresh', null, null, [], ['refresh_token' => $cookie])['json'] === ['error' => 'INVALID_REFRESH'], 'replay after grace → 401 reuse detected');
t_ok(t_call('POST', '/auth/refresh', null, null, [], ['refresh_token' => $newCookie])['status'] === 401, 'reuse kills the replacement session too');

// ---------- logout ----------
$r = t_login(T_ADMIN_EMAIL, T_ADMIN_PASSWORD);
$access = $r['json']['accessToken'];
$cookie = $r['cookies']['refresh_token'];
$r = t_call('POST', '/api/auth/logout', null, $access);
t_ok($r['status'] === 204 && $r['body'] === '' && str_contains($r['setCookie']['refresh_token'] ?? '', 'Max-Age=0')
    && str_contains($r['setCookie']['refresh_token'] ?? '', 'Path=/api/auth'), 'logout → 204 + cookie cleared on /api/auth');
t_ok(t_call('GET', '/__smoke/private', null, $access)['status'] === 401, 'access token of logged-out session rejected');
t_ok(t_call('POST', '/auth/refresh', null, null, [], ['refresh_token' => $cookie])['status'] === 401, 'refresh after logout → 401');
t_ok(t_call('POST', '/auth/logout')['status'] === 401, 'logout requires auth');

// ---------- password reset ----------
Db::exec('DELETE FROM rate_limits');
$before = t_mail_log();
$r = t_call('POST', '/api/auth/password-reset/request', ['email' => 'nobody@example.com']);
t_ok($r['status'] === 204 && t_mail_log() === $before, 'reset request for unknown e-mail → 204, no mail');
t_ok(t_call('POST', '/auth/password-reset/request', ['email' => 'pending@example.com'])['status'] === 204 && t_mail_log() === $before, 'reset request for pending user → 204, no mail');
$r = t_call('POST', '/auth/password-reset/request', ['email' => 'Admin@Catalog-Demo.local']);
$mails = t_mails();
$mail = end($mails) ?: [];
t_ok($r['status'] === 204 && count($mails) === 1 && array_keys($mail) === ['to', 'subject', 'html', 'text', 'at'], 'reset request → 204 + one JSON line {to,subject,html,text,at} in mail.log');
$found = preg_match('#' . preg_quote(T_APP_URL, '#') . '/reset-hasla/potwierdz\?token=([0-9a-f]{64})#', (string) ($mail['html'] ?? ''), $m);
t_ok($mail['to'] === T_ADMIN_EMAIL && $found === 1 && str_contains((string) $mail['text'], $m[1] ?? '-'), 'mail links to APP_URL/reset-hasla/potwierdz?token= (html + text)');
$resetToken = $m[1] ?? '';
t_ok(Db::val('SELECT token_hash FROM password_reset_tokens') === hash('sha256', $resetToken), 'only the sha256 of the token is stored');
$r = t_call('POST', '/auth/password-reset/confirm', ['token' => $resetToken, 'password' => 'short']);
t_ok($r['status'] === 400 && ($r['json']['error']['issues'][0]['path'] ?? null) === ['password'], 'confirm with short password → 400 validation');
$r = t_call('POST', '/auth/password-reset/confirm', ['token' => str_repeat('a', 64), 'password' => 'NoweHaslo123!']);
t_ok($r['status'] === 400 && $r['json'] === ['error' => 'invalid_token'], 'confirm with unknown token → 400 invalid_token');
$live = t_login(T_ADMIN_EMAIL, T_ADMIN_PASSWORD)['json']['accessToken'];
Db::exec('DELETE FROM rate_limits');
$r = t_call('POST', '/auth/password-reset/confirm', ['token' => $resetToken, 'password' => 'NoweHaslo123!']);
t_ok($r['status'] === 204, 'confirm → 204');
t_ok(t_call('GET', '/__smoke/private', null, $live)['status'] === 401, 'confirm deletes all sessions');
t_ok(t_login(T_ADMIN_EMAIL, 'NoweHaslo123!')['status'] === 200, 'login with the new password');
t_ok(t_login(T_ADMIN_EMAIL, T_ADMIN_PASSWORD)['status'] === 401, 'old password rejected');
Db::exec('DELETE FROM rate_limits');
t_ok(t_call('POST', '/auth/password-reset/confirm', ['token' => $resetToken, 'password' => 'Inne12345!'])['json'] === ['error' => 'invalid_token'], 'reset token is single-use');

// ---------- mail helpers ----------
t_ok(!Mail::hasTemplate('definitely_missing_template'), 'Mail::hasTemplate false for a missing template');
try {
    Mail::render('definitely_missing_template', []);
    t_ok(false, 'Mail::render throws for a missing template');
} catch (RuntimeException) {
    t_ok(true, 'Mail::render throws for a missing template');
}
try {
    Mail::hasTemplate('../etc/passwd');
    t_ok(false, 'Mail template names cannot escape templates/mail');
} catch (InvalidArgumentException) {
    t_ok(true, 'Mail template names cannot escape templates/mail');
}
t_ok(Mail::toText('<p>A</p><p><a href="https://x.pl/a">Link</a></p>') === "A\nLink (https://x.pl/a)", 'Mail::toText keeps link targets');
