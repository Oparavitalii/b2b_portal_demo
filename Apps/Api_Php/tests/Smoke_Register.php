<?php

declare(strict_types=1);

/** T-03 smoke: registration → e-mail confirmation → login (R-03, R-18). */
require __DIR__ . '/Harness.php';

t_reset();
t_seed();

/** Last verification token found in mail.log for $email ('' when none). */
function verify_token_for(string $email): string
{
    $token = '';
    foreach (t_mails() as $mail) {
        if ($mail['to'] === $email
            && preg_match('#' . preg_quote(T_APP_URL, '#') . '/potwierdz-email\?token=([0-9a-f]{64})#', (string) $mail['html'], $m) === 1) {
            $token = $m[1];
        }
    }
    return $token;
}

$payload = [
    'email' => '  Nowy.Klient@Example.com ',
    'password' => 'Haslo1234!',
    'acceptTerms' => true,
];
$email = 'nowy.klient@example.com';

// ---------- validation ----------
$r = t_call('POST', '/api/auth/register', []);
t_ok($r['status'] === 400 && count($r['json']['error']['issues'] ?? []) === 3, 'register {} → 400 with 3 issues (email, password, acceptTerms)');
$r = t_call('POST', '/auth/register', ['acceptTerms' => false] + $payload);
t_ok($r['status'] === 400 && ($r['json']['error']['issues'][0]['path'] ?? null) === ['acceptTerms'], 'acceptTerms false → 400 on acceptTerms');
$r = t_call('POST', '/auth/register', ['password' => 'krotkie'] + $payload);
t_ok($r['status'] === 400 && ($r['json']['error']['issues'][0]['path'] ?? null) === ['password'], 'password < 8 → 400 on password');
t_ok((int) Db::val('SELECT COUNT(*) FROM users') === 2 && t_mail_log() === '', 'invalid registrations create nothing, send nothing');

// ---------- register ----------
$r = t_call('POST', '/auth/register', $payload);
t_ok($r['status'] === 201 && $r['json'] === ['email' => $email, 'status' => 'pending'], 'register → 201 {email,status:pending}');
$user = Db::one('SELECT * FROM users WHERE email = ?', [$email]);
t_ok($user !== null && $user['role'] === 'customer' && $user['status'] === 'pending' && $user['email_verified_at'] === null
    && (float) $user['discount_percent'] === 0.0, 'users row: customer, pending, not verified, no discount');
t_ok($user['nip'] === null && $user['company_name'] === null && $user['contact_name'] === null && $user['phone'] === null,
    'registration stores no company data (filled later in Moje konto)');
t_ok(password_verify('Haslo1234!', $user['password_hash']), 'password stored as a hash');
$token = verify_token_for($email);
$mails = t_mails();
t_ok(count($mails) === 1 && $token !== '' && str_contains((string) $mails[0]['text'], $token)
    && str_contains((string) $mails[0]['subject'], 'potwierdź'), 'one verify_email mail with APP_URL/potwierdz-email?token= link');
t_ok(str_contains((string) $mails[0]['html'], '#e30613') && str_contains((string) $mails[0]['html'], 'Dzień dobry!'), 'mail is the HTML template (red button, generic greeting)');
$row = Db::one('SELECT * FROM email_verification_tokens WHERE user_id = ?', [$user['id']]);
t_ok($row['token_hash'] === hash('sha256', $token), 'only the sha256 of the token is stored');
$ttl = strtotime($row['expires_at']) - strtotime($row['created_at']);
t_ok(abs($ttl - 86400) <= 2, 'token valid 24 h');

// ---------- duplicate ----------
$r = t_call('POST', '/auth/register', ['email' => 'NOWY.KLIENT@example.com'] + $payload);
t_ok($r['status'] === 409 && $r['json'] === ['error' => 'email_taken'], 'duplicate e-mail (other case) → 409 email_taken');
$r = t_call('POST', '/auth/register', ['email' => T_ADMIN_EMAIL] + $payload);
t_ok($r['status'] === 409, 'admin e-mail → 409');

// ---------- login before confirmation ----------
$r = t_login($email, 'Haslo1234!');
t_ok($r['status'] === 403 && $r['json'] === ['error' => 'email_not_verified'] && $r['cookies'] === [], 'login while pending → 403 email_not_verified');

// ---------- resend ----------
Db::exec('DELETE FROM rate_limits');
$r = t_call('POST', '/auth/resend-verification', ['email' => 'ghost@example.com']);
t_ok($r['status'] === 204 && count(t_mails()) === 1, 'resend for unknown e-mail → 204, no mail');
$r = t_call('POST', '/auth/resend-verification', ['email' => T_ADMIN_EMAIL]);
t_ok($r['status'] === 204 && count(t_mails()) === 1, 'resend for active account → 204, no mail');
$r = t_call('POST', '/auth/resend-verification', ['email' => 'Nowy.Klient@example.com']);
$newToken = verify_token_for($email);
t_ok($r['status'] === 204 && count(t_mails()) === 2 && $newToken !== '' && $newToken !== $token, 'resend for pending account → 204 + new link');
t_ok(t_call('POST', '/auth/verify-email', ['token' => $token])['json'] === ['error' => 'invalid_token'], 'old link stops working after resend');
Db::exec('DELETE FROM rate_limits');
t_ok(t_call('POST', '/auth/resend-verification', ['email' => 'zly-adres'])['status'] === 400, 'resend with invalid e-mail → 400');
Db::exec('DELETE FROM rate_limits');
for ($i = 0; $i < 3; $i++) {
    t_call('POST', '/auth/resend-verification', ['email' => 'ghost@example.com']);
}
$r = t_call('POST', '/auth/resend-verification', ['email' => 'ghost@example.com']);
t_ok($r['status'] === 429 && ($r['json']['error'] ?? null) === 'TOO_MANY_REQUESTS', 'resend is rate-limited (4th in an hour → 429)');

// ---------- verify ----------
Db::exec('DELETE FROM rate_limits');
$r = t_call('POST', '/auth/verify-email', ['token' => str_repeat('b', 64)]);
t_ok($r['status'] === 400 && $r['json'] === ['error' => 'invalid_token'], 'unknown token → 400 invalid_token');
t_ok(t_call('POST', '/auth/verify-email', ['token' => 'krotki'])['status'] === 400, 'malformed token → 400 validation');
$r = t_call('POST', '/api/auth/verify-email', ['token' => $newToken]);
t_ok($r['status'] === 200 && $r['json'] === ['email' => $email, 'status' => 'active'], 'verify → 200 {status:active}');
$user = Db::one('SELECT * FROM users WHERE email = ?', [$email]);
t_ok($user['status'] === 'active' && $user['email_verified_at'] !== null, 'user active + email_verified_at set');
t_ok(t_call('POST', '/auth/verify-email', ['token' => $newToken])['json'] === ['error' => 'invalid_token'], 'token is single-use');

// ---------- login after confirmation ----------
$r = t_login($email, 'Haslo1234!');
t_ok($r['status'] === 200 && ($r['json']['user']['email'] ?? null) === $email && ($r['json']['user']['role'] ?? null) === 'customer'
    && array_key_exists('nip', $r['json']['user'] ?? []) && $r['json']['user']['nip'] === null, 'login after verification → 200 with customer user, no company data yet');
$access = (string) ($r['json']['accessToken'] ?? '');
$me = t_call('GET', '/me', null, $access);
t_ok($me['status'] === 200 && $me['json']['companyName'] === null, 'GET /me works for the new customer');
$r = t_call('PATCH', '/me', ['companyName' => 'Auto Części Nowak sp. z o.o.', 'nip' => '123-456-78-90', 'contactName' => 'Piotr Nowak', 'phone' => '+48 601 234 567'], $access);
t_ok($r['status'] === 200 && $r['json']['nip'] === '1234567890' && $r['json']['companyName'] === 'Auto Części Nowak sp. z o.o.', 'company data filled later via PATCH /me, NIP dashes stripped');

// ---------- expired token ----------
Db::exec('DELETE FROM rate_limits');
t_call('POST', '/auth/register', ['email' => 'pozny@example.com'] + $payload);
$late = verify_token_for('pozny@example.com');
Db::exec("UPDATE email_verification_tokens SET expires_at = ? WHERE token_hash = ?", [now_iso(-60), hash('sha256', $late)]);
t_ok(t_call('POST', '/auth/verify-email', ['token' => $late])['json'] === ['error' => 'invalid_token'], 'expired token → 400 invalid_token');
t_ok(Db::val("SELECT status FROM users WHERE email = 'pozny@example.com'") === 'pending', 'expired token leaves the account pending');

// ---------- password reset mail uses the template ----------
Db::exec('DELETE FROM rate_limits');
t_call('POST', '/auth/password-reset/request', ['email' => $email]);
$mails = t_mails();
$last = end($mails) ?: [];
t_ok(str_contains((string) ($last['html'] ?? ''), 'USTAW NOWE HASŁO') && str_contains((string) ($last['html'] ?? ''), '/reset-hasla/potwierdz?token='),
    'password reset mail rendered from templates/mail/reset_password.php');
