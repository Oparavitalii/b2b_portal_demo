<?php

declare(strict_types=1);

/**
 * Customer self-registration (R-03) with e-mail confirmation (R-18).
 *
 * register: only e-mail + password + terms (owner, 2026-10-08). Company data
 * (name, NIP, contact person, phone) is filled later in "Moje konto" and is
 * required before the first order (OrdersService: 422 company_data_required).
 * Creates a 'customer' user with status 'pending' and sends the
 * verify_email mail. The token is random, only its sha256 is stored, it is
 * valid 24 h and single-use. Login stays 403 email_not_verified until
 * verify() flips the user to 'active'.
 */
final class RegisterService
{
    public const VERIFY_TTL = 86400;

    public const NIP_RULE = ['type' => 'string', 'required' => true, 'pattern' => '/^\d{10}$/'];
    public const PHONE_RULE = ['type' => 'string', 'required' => true, 'min' => 6, 'max' => 40, 'pattern' => '/^\+?[0-9][0-9 ()-]{5,39}$/'];

    public const REGISTER_SCHEMA = [
        'email' => ['type' => 'email', 'required' => true, 'max' => 254],
        'password' => ['type' => 'string', 'required' => true, 'min' => 8, 'max' => 200, 'trim' => false],
        'acceptTerms' => ['type' => 'bool', 'required' => true],
    ];
    public const VERIFY_SCHEMA = [
        'token' => ['type' => 'string', 'required' => true, 'min' => 20, 'max' => 200, 'trim' => false],
    ];
    public const RESEND_SCHEMA = [
        'email' => ['type' => 'email', 'required' => true, 'max' => 254],
    ];

    /** NIP may be typed as '123-456-78-90' or '123 456 78 90': strip dashes and spaces before validation. */
    public static function normalizeNip(mixed $body): mixed
    {
        if (is_array($body) && isset($body['nip']) && is_string($body['nip'])) {
            $body['nip'] = (string) preg_replace('/[\s-]+/u', '', $body['nip']);
        }
        return $body;
    }

    /** @return array{email:string,status:string} */
    public static function register(Request $req, mixed $body): array
    {
        $in = V::parse($body, self::REGISTER_SCHEMA);
        if ($in['acceptTerms'] !== true) {
            throw ApiError::validation([[
                'code' => 'invalid_literal',
                'expected' => true,
                'received' => false,
                'path' => ['acceptTerms'],
                'message' => 'Invalid literal value, expected true',
            ]]);
        }
        $email = $in['email'];
        if (Db::val('SELECT 1 FROM users WHERE email = ?', [$email]) !== null) {
            throw new ApiError(409, 'email_taken');
        }
        $uid = uuid4();
        $now = now_iso();
        $token = Db::tx(static function () use ($in, $email, $uid, $now): string {
            Db::insert('users', [
                'id' => $uid,
                'email' => $email,
                'password_hash' => Auth::hashPassword($in['password']),
                'role' => 'customer',
                'status' => 'pending',
                'discount_percent' => 0,
                'email_verified_at' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            return self::issueToken($uid);
        });
        Audit::log($req, 'register', 'user', $uid, null, null, $uid);
        self::sendVerification($email, null, $token);
        return ['email' => $email, 'status' => 'pending'];
    }

    /** @return array{email:string,status:string} */
    public static function verify(Request $req, string $token): array
    {
        $record = Db::one(
            'SELECT * FROM email_verification_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
            [hash('sha256', $token), now_iso()],
        );
        if ($record === null) {
            throw new ApiError(400, 'invalid_token');
        }
        $user = Db::one('SELECT * FROM users WHERE id = ?', [$record['user_id']]);
        if ($user === null) {
            throw new ApiError(400, 'invalid_token');
        }
        $now = now_iso();
        Db::tx(static function () use ($user, $now): void {
            if ($user['status'] !== 'active') {
                Db::update('users', ['status' => 'active', 'email_verified_at' => $now, 'updated_at' => $now], ['id' => $user['id']]);
            }
            Db::exec('UPDATE email_verification_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [$now, $user['id']]);
        });
        Audit::log($req, 'email_verified', 'user', $user['id'], null, null, $user['id']);
        return ['email' => $user['email'], 'status' => 'active'];
    }

    /** Sends a fresh link to a pending account; silent for unknown or already active e-mails. */
    public static function resend(Request $req, string $email): void
    {
        $user = Db::one('SELECT * FROM users WHERE email = ?', [strtolower(trim($email))]);
        if ($user === null || $user['status'] !== 'pending') {
            return;
        }
        $token = Db::tx(static function () use ($user): string {
            Db::exec('UPDATE email_verification_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [now_iso(), $user['id']]);
            return self::issueToken($user['id']);
        });
        Audit::log($req, 'email_verification_resent', 'user', $user['id'], null, null, $user['id']);
        self::sendVerification($user['email'], (string) ($user['contact_name'] ?? ''), $token);
    }

    private static function issueToken(string $userId): string
    {
        $token = bin2hex(random_bytes(32));
        Db::insert('email_verification_tokens', [
            'id' => uuid4(),
            'user_id' => $userId,
            'token_hash' => hash('sha256', $token),
            'expires_at' => now_iso(self::VERIFY_TTL),
            'created_at' => now_iso(),
        ]);
        return $token;
    }

    private static function sendVerification(string $email, ?string $contactName, string $token): void
    {
        $url = app_url('/potwierdz-email?token=' . rawurlencode($token));
        $hours = intdiv(self::VERIFY_TTL, 3600);
        $html = Mail::render('verify_email', [
            'verifyUrl' => $url,
            'email' => $email,
            'contactName' => $contactName,
            'validHours' => $hours,
        ]);
        Mail::send(
            $email,
            'DEMO PARTS Katalog B2B — potwierdź adres e-mail',
            $html,
            "Dziękujemy za rejestrację w katalogu B2B DEMO PARTS.\n\n"
            . "Aby aktywować konto, otwórz link (ważny $hours godziny): $url\n\n"
            . "Jeśli to nie Ty zakładałeś konto — zignoruj tę wiadomość.",
        );
    }
}
