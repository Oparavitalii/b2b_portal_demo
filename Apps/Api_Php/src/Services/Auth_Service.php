<?php

declare(strict_types=1);

/** Login. Refresh/logout: SessionRotation; password reset: PasswordReset (Core). */
final class AuthService
{
    public const LOGIN_SCHEMA = [
        'email' => ['type' => 'email', 'required' => true],
        'password' => ['type' => 'string', 'required' => true, 'min' => 1, 'max' => 200, 'trim' => false],
    ];
    public const RESET_REQUEST_SCHEMA = [
        'email' => ['type' => 'email', 'required' => true],
    ];
    public const RESET_CONFIRM_SCHEMA = [
        'token' => ['type' => 'string', 'required' => true, 'min' => 20, 'max' => 200, 'trim' => false],
        'password' => ['type' => 'string', 'required' => true, 'min' => 8, 'max' => 200, 'trim' => false],
    ];

    private static ?string $decoyHash = null;

    public static function findUserByEmail(string $email): ?array
    {
        return Db::one('SELECT * FROM users WHERE email = ?', [strtolower(trim($email))]);
    }

    public static function findUser(string $id): ?array
    {
        return Db::one('SELECT * FROM users WHERE id = ?', [$id]);
    }

    /**
     * Unknown e-mail or wrong password → 401 INVALID_CREDENTIALS. A correct
     * password on an account whose e-mail is not confirmed yet → 403 email_not_verified.
     *
     * @return array{user:array,accessToken:string,refreshToken:string}
     */
    public static function login(Request $req, string $email, string $password): array
    {
        $user = self::findUserByEmail($email);
        if ($user === null) {
            self::burnDecoy($password);
            Audit::log($req, 'login_failed', 'user', null, null, ['reason' => 'user_not_found']);
            throw new ApiError(401, 'INVALID_CREDENTIALS');
        }
        $uid = $user['id'];
        if (!password_verify($password, $user['password_hash'])) {
            Audit::log($req, 'login_failed', 'user', $uid, null, ['reason' => 'bad_password'], $uid);
            throw new ApiError(401, 'INVALID_CREDENTIALS');
        }
        if (Auth::isBlocked($user)) {
            Audit::log($req, 'login_failed', 'user', $uid, null, ['reason' => 'account_blocked'], $uid);
            throw new ApiError(403, 'account_blocked');
        }
        if (!Auth::isActive($user)) {
            Audit::log($req, 'login_failed', 'user', $uid, null, ['reason' => 'email_not_verified'], $uid);
            throw new ApiError(403, 'email_not_verified');
        }
        $tokens = Auth::issueSession($user, $req);
        Audit::log($req, 'login', 'user', $uid, null, null, $uid);
        return ['user' => Auth::publicUser($user), 'accessToken' => $tokens['accessToken'], 'refreshToken' => $tokens['refreshToken']];
    }

    /** Timing parity: an unknown e-mail costs one full bcrypt compare, like a wrong password. */
    private static function burnDecoy(string $password): void
    {
        self::$decoyHash ??= Auth::hashPassword(bin2hex(random_bytes(16)));
        password_verify($password, self::$decoyHash);
    }
}
