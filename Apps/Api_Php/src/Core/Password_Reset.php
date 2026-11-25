<?php

declare(strict_types=1);

/**
 * Password-reset request + confirm. The token is random, only its sha256 is
 * stored, it is valid 1 hour and single-use. The link points at the SPA page
 * APP_URL/reset-hasla/potwierdz?token=...
 *
 * Mail template 'reset_password' (templates/mail/reset_password.php) receives:
 *   $resetUrl (string), $email (string), $validMinutes (int).
 * When that file does not exist a plain inline HTML body is sent instead.
 */
final class PasswordReset
{
    public const RESET_TTL = 3600;

    public static function request(Request $req, string $email): void
    {
        $user = Db::one('SELECT * FROM users WHERE email = ?', [strtolower(trim($email))]);
        if ($user === null || !Auth::isActive($user)) {
            return;
        }
        $token = bin2hex(random_bytes(32));
        Db::insert('password_reset_tokens', [
            'id' => uuid4(),
            'user_id' => $user['id'],
            'token_hash' => hash('sha256', $token),
            'expires_at' => now_iso(self::RESET_TTL),
            'created_at' => now_iso(),
        ]);
        $url = app_url('/reset-hasla/potwierdz?token=' . rawurlencode($token));
        $vars = ['resetUrl' => $url, 'email' => $user['email'], 'validMinutes' => intdiv(self::RESET_TTL, 60)];
        $html = Mail::hasTemplate('reset_password') ? Mail::render('reset_password', $vars) : self::fallbackHtml($url);
        Mail::send(
            $user['email'],
            'DEMO PARTS Katalog B2B — ustawienie nowego hasła',
            $html,
            "Otrzymaliśmy prośbę o ustawienie nowego hasła do konta w katalogu DEMO PARTS.\n\n"
            . "Otwórz link (ważny 60 minut): $url\n\nJeśli to nie Ty — zignoruj tę wiadomość.",
        );
        Audit::log($req, 'password_reset_request', 'user', $user['id'], null, null, $user['id']);
    }

    public static function confirm(Request $req, string $token, string $newPassword): void
    {
        $record = Db::one(
            'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
            [hash('sha256', $token), now_iso()],
        );
        if ($record === null) {
            throw new ApiError(400, 'invalid_token');
        }
        $uid = $record['user_id'];
        Db::tx(static function () use ($uid, $record, $newPassword): void {
            Db::update('users', ['password_hash' => Auth::hashPassword($newPassword), 'updated_at' => now_iso()], ['id' => $uid]);
            Db::update('password_reset_tokens', ['used_at' => now_iso()], ['id' => $record['id']]);
            Db::exec('DELETE FROM sessions WHERE user_id = ?', [$uid]);
        });
        Audit::log($req, 'password_reset_complete', 'user', $uid, null, null, $uid);
    }

    private static function fallbackHtml(string $url): string
    {
        $safe = htmlspecialchars($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        return '<p>Otrzymaliśmy prośbę o ustawienie nowego hasła do konta w katalogu DEMO PARTS.</p>'
            . '<p><a href="' . $safe . '">Ustaw nowe hasło</a> (link ważny 60 minut).</p>'
            . '<p>Jeśli to nie Ty — zignoruj tę wiadomość.</p>';
    }
}
