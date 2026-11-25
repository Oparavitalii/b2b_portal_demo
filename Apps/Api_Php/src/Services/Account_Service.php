<?php

declare(strict_types=1);

/**
 * "Moje konto" (R-07, R-08, R-09, R-04, R-12): company data, password change,
 * the single delivery address, account deletion. Every method acts on the
 * authenticated user ($req->user) only.
 */
final class AccountService
{
    public const UPDATE_ME_SCHEMA = [
        'companyName' => ['type' => 'string', 'min' => 2, 'max' => 200],
        'nip' => ['type' => 'string', 'pattern' => '/^\d{10}$/'],
        'contactName' => ['type' => 'string', 'min' => 2, 'max' => 200],
        'phone' => ['type' => 'string', 'min' => 6, 'max' => 40, 'pattern' => '/^\+?[0-9][0-9 ()-]{5,39}$/'],
    ];
    public const CHANGE_PASSWORD_SCHEMA = [
        'currentPassword' => ['type' => 'string', 'required' => true, 'min' => 1, 'max' => 200, 'trim' => false],
        'newPassword' => ['type' => 'string', 'required' => true, 'min' => 8, 'max' => 200, 'trim' => false],
    ];
    public const ADDRESS_SCHEMA = [
        'companyName' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 200],
        'street' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 200],
        'postalCode' => ['type' => 'string', 'required' => true, 'pattern' => '/^\d{2}-\d{3}$/'],
        'city' => ['type' => 'string', 'required' => true, 'min' => 2, 'max' => 100],
        'country' => ['type' => 'string', 'min' => 2, 'max' => 100, 'default' => 'Polska'],
        'phone' => ['type' => 'string', 'nullable' => true, 'emptyNull' => true, 'max' => 40, 'pattern' => '/^\+?[0-9][0-9 ()-]{5,39}$/'],
    ];
    public const DELETE_SCHEMA = [
        'password' => ['type' => 'string', 'required' => true, 'min' => 1, 'max' => 200, 'trim' => false],
    ];

    private const ME_COLUMNS = ['companyName' => 'company_name', 'nip' => 'nip', 'contactName' => 'contact_name', 'phone' => 'phone'];

    public static function me(Request $req): array
    {
        return Auth::publicUser(self::user($req));
    }

    public static function updateMe(Request $req, mixed $body): array
    {
        $in = V::parse(RegisterService::normalizeNip($body), self::UPDATE_ME_SCHEMA);
        $user = self::user($req);
        $set = [];
        foreach (self::ME_COLUMNS as $key => $col) {
            if (array_key_exists($key, $in) && $in[$key] !== $user[$col]) {
                $set[$col] = $in[$key];
            }
        }
        if ($set !== []) {
            Db::update('users', $set + ['updated_at' => now_iso()], ['id' => $user['id']]);
            // Field names only: the values are personal data and must not outlive an account deletion.
            Audit::log($req, 'account_update', 'user', $user['id'], null, ['fields' => array_keys($set)]);
        }
        return Auth::publicUser((array) Db::one('SELECT * FROM users WHERE id = ?', [$user['id']]));
    }

    /** Wrong current password → 400 wrong_password. Every other session of the user is revoked. */
    public static function changePassword(Request $req, mixed $body): void
    {
        $in = V::parse($body, self::CHANGE_PASSWORD_SCHEMA);
        $user = self::user($req);
        if (!password_verify($in['currentPassword'], $user['password_hash'])) {
            Audit::log($req, 'password_change_failed', 'user', $user['id']);
            throw new ApiError(400, 'wrong_password');
        }
        Db::tx(static function () use ($req, $user, $in): void {
            Db::update('users', ['password_hash' => Auth::hashPassword($in['newPassword']), 'updated_at' => now_iso()], ['id' => $user['id']]);
            Db::exec('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [$user['id'], (string) $req->sessionId]);
            Db::exec('UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [now_iso(), $user['id']]);
        });
        Audit::log($req, 'password_change', 'user', $user['id']);
    }

    /** The delivery address, or null when the customer has not saved one yet. */
    public static function address(Request $req): ?array
    {
        $row = Db::one(
            'SELECT company_name, street, postal_code, city, country, phone, updated_at FROM addresses WHERE user_id = ?',
            [(string) $req->userId],
        );
        return Row::camel($row);
    }

    public static function saveAddress(Request $req, mixed $body): array
    {
        $in = V::parse($body, self::ADDRESS_SCHEMA);
        $uid = (string) $req->userId;
        Db::exec(
            'INSERT INTO addresses (user_id, company_name, street, postal_code, city, country, phone, updated_at)
             VALUES (:uid, :company, :street, :postal, :city, :country, :phone, :now)
             ON CONFLICT(user_id) DO UPDATE SET company_name = excluded.company_name, street = excluded.street,
               postal_code = excluded.postal_code, city = excluded.city, country = excluded.country,
               phone = excluded.phone, updated_at = excluded.updated_at',
            [
                'uid' => $uid,
                'company' => $in['companyName'],
                'street' => $in['street'],
                'postal' => $in['postalCode'],
                'city' => $in['city'],
                'country' => $in['country'],
                'phone' => $in['phone'] ?? null,
                'now' => now_iso(),
            ],
        );
        Audit::log($req, 'address_save', 'user', $uid);
        return (array) self::address($req);
    }

    /**
     * Deletes the customer account after a password check. Cart, address,
     * sessions and tokens go with the user (ON DELETE CASCADE); orders stay
     * with their snapshots and user_id = NULL.
     */
    public static function delete(Request $req, mixed $body): void
    {
        $in = V::parse($body, self::DELETE_SCHEMA);
        $user = self::user($req);
        if ($user['role'] !== 'customer') {
            throw ApiError::forbidden('admin_cannot_delete_self');
        }
        if (!password_verify($in['password'], $user['password_hash'])) {
            Audit::log($req, 'account_delete_failed', 'user', $user['id']);
            throw new ApiError(400, 'wrong_password');
        }
        self::purge($req, $user['id'], 'account_delete');
    }

    /**
     * Removes a user with everything personal (shared by self-deletion and the
     * admin's "Usuń klienta"). Orders keep their snapshots with user_id = NULL.
     */
    public static function purge(Request $req, string $uid, string $auditAction): void
    {
        Db::tx(static function () use ($req, $uid, $auditAction): void {
            $orders = (int) Db::val('SELECT COUNT(*) FROM orders WHERE user_id = ?', [$uid]);
            Audit::log($req, $auditAction, 'user', $uid, null, ['orders' => $orders]);
            Db::exec('UPDATE orders SET user_id = NULL WHERE user_id = ?', [$uid]);
            Db::exec('DELETE FROM cart_items WHERE user_id = ?', [$uid]);
            Db::exec('DELETE FROM addresses WHERE user_id = ?', [$uid]);
            Db::exec('DELETE FROM sessions WHERE user_id = ?', [$uid]);
            Db::exec('DELETE FROM api_keys WHERE user_id = ?', [$uid]);
            Db::exec('DELETE FROM password_reset_tokens WHERE user_id = ?', [$uid]);
            Db::exec('DELETE FROM email_verification_tokens WHERE user_id = ?', [$uid]);
            Db::exec('DELETE FROM users WHERE id = ?', [$uid]);
        });
    }

    private static function user(Request $req): array
    {
        $user = Db::one('SELECT * FROM users WHERE id = ?', [(string) $req->userId]);
        if ($user === null) {
            throw ApiError::unauthorized();
        }
        return $user;
    }
}
