<?php

declare(strict_types=1);

/**
 * Applies ADMIN_EMAIL / ADMIN_PASSWORD from .env to the database. Seed.php only
 * creates the admin, so a password changed in .env later needs this:
 *   - CLI: php scripts/Set_Admin_Password.php
 *   - no SSH: upload storage/Reset_Admin.flag (Apps/Web: npm run env:push does it
 *     together with .env); the next API request applies it and deletes the flag.
 * The flag can only be written over FTP: storage/ is outside the web root.
 */
final class AdminPassword
{
    public const FLAG = 'Reset_Admin.flag';

    /** Called on every request by public/index.php; one is_file() when no flag. */
    public static function applyFlag(): void
    {
        $flag = storage_path(self::FLAG);
        if (!is_file($flag)) {
            return;
        }
        // Delete first: if applying fails, it must not retry on every request.
        if (!@unlink($flag)) {
            self::log('flag found but cannot be deleted; nothing applied');
            return;
        }
        try {
            self::log(self::apply());
        } catch (Throwable $e) {
            self::log('failed: ' . $e->getMessage());
        }
    }

    /** @return string "<email>: created" | "<email>: password updated, sessions ended" */
    public static function apply(): string
    {
        $email = strtolower(trim((string) env('ADMIN_EMAIL', '')));
        $password = (string) env('ADMIN_PASSWORD', '');
        if ($email === '' || $password === '') {
            throw new RuntimeException('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
        }

        $result = Db::tx(static function () use ($email, $password): string {
            $now = now_iso();
            $id = Db::val('SELECT id FROM users WHERE email = ?', [$email]);
            if ($id === null) {
                Db::insert('users', [
                    'id' => uuid4(),
                    'email' => $email,
                    'password_hash' => Auth::hashPassword($password),
                    'role' => 'admin',
                    'status' => 'active',
                    'contact_name' => 'Administrator',
                    'email_verified_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                return 'created';
            }
            Db::exec(
                "UPDATE users SET password_hash = ?, role = 'admin', status = 'active',
                    email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?",
                [Auth::hashPassword($password), $now, $now, $id],
            );
            Db::exec('DELETE FROM sessions WHERE user_id = ?', [$id]);
            return 'password updated, sessions ended';
        });
        return "$email: $result";
    }

    private static function log(string $line): void
    {
        @file_put_contents(storage_path('setup.log'), gmdate('c') . " admin reset — $line\n", FILE_APPEND);
    }
}
