<?php

declare(strict_types=1);

/**
 * Seeds the logins every environment needs. Idempotent: existing rows
 * (matched by e-mail) are left as they are, so it is safe to run repeatedly.
 *
 *   php database/Migrate.php --fresh && php database/Seed.php
 *
 * There are no built-in passwords. Values come from the process environment
 * or Apps/Api_Php/.env:
 *
 * - admin    ADMIN_PASSWORD (required, at least 12 characters) and ADMIN_EMAIL
 *            (required in production, defaults to admin@catalog-demo.local elsewhere).
 *            Seeding stops with a clear error when ADMIN_PASSWORD is missing or short.
 * - customer demo@catalog-demo.local / DEMO_PASSWORD — active, company data, 10 % discount,
 *            delivery address. Created only outside production and only when
 *            DEMO_PASSWORD is set (same 12-character minimum); skipped otherwise.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/src/Bootstrap.php';

final class Seeder
{
    public const MIN_PASSWORD_LENGTH = 12;
    public const DEV_ADMIN_EMAIL = 'admin@catalog-demo.local';
    public const DEMO_EMAIL = 'demo@catalog-demo.local';

    /** @return array<string,string> e-mail => 'created' | 'exists' */
    public static function run(): array
    {
        $adminPassword = self::password('ADMIN_PASSWORD');
        if ($adminPassword === null) {
            throw new RuntimeException('ADMIN_PASSWORD is not set. Set it in the environment or in Apps/Api_Php/.env (at least '
                . self::MIN_PASSWORD_LENGTH . ' characters); the seed has no default password.');
        }
        $adminEmail = env('ADMIN_EMAIL');
        if (is_production() && $adminEmail === null) {
            throw new RuntimeException('ADMIN_EMAIL must be set in production');
        }
        $adminEmail = strtolower(trim($adminEmail ?? self::DEV_ADMIN_EMAIL));
        $demoPassword = is_production() ? null : self::password('DEMO_PASSWORD');

        return Db::tx(static function () use ($adminEmail, $adminPassword, $demoPassword): array {
            $out = [];
            $out[$adminEmail] = self::ensureUser($adminEmail, $adminPassword, [
                'role' => 'admin',
                'company_name' => 'Demo Parts sp. z o.o.',
                'contact_name' => 'Administrator',
            ]);
            if ($demoPassword !== null) {
                $out[self::DEMO_EMAIL] = self::ensureUser(self::DEMO_EMAIL, $demoPassword, [
                    'role' => 'customer',
                    'company_name' => 'Auto Serwis Demo sp. z o.o.',
                    'nip' => '9876543210',
                    'contact_name' => 'Jan Kowalski',
                    'phone' => '+48 600 100 200',
                    'discount_percent' => 10,
                ]);
                self::ensureAddress(self::DEMO_EMAIL, [
                    'company_name' => 'Auto Serwis Demo sp. z o.o.',
                    'street' => 'ul. Przykładowa 12',
                    'postal_code' => '00-001',
                    'city' => 'Warszawa',
                    'country' => 'Polska',
                    'phone' => '+48 600 100 200',
                ]);
            }
            return $out;
        });
    }

    /** The env value, or null when unset; a value shorter than MIN_PASSWORD_LENGTH is an error, never silently used. */
    private static function password(string $key): ?string
    {
        $value = env($key);
        if ($value === null) {
            return null;
        }
        if (mb_strlen($value) < self::MIN_PASSWORD_LENGTH) {
            throw new RuntimeException($key . ' is too short: use at least ' . self::MIN_PASSWORD_LENGTH . ' characters.');
        }
        return $value;
    }

    private static function ensureUser(string $email, string $password, array $fields): string
    {
        if (Db::val('SELECT 1 FROM users WHERE email = ?', [$email]) !== null) {
            return 'exists';
        }
        $now = now_iso();
        Db::insert('users', $fields + [
            'id' => uuid4(),
            'email' => $email,
            'password_hash' => Auth::hashPassword($password),
            'status' => 'active',
            'email_verified_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        return 'created';
    }

    private static function ensureAddress(string $email, array $address): void
    {
        $uid = Db::val('SELECT id FROM users WHERE email = ?', [$email]);
        if ($uid === null || Db::val('SELECT 1 FROM addresses WHERE user_id = ?', [$uid]) !== null) {
            return;
        }
        Db::insert('addresses', $address + ['user_id' => $uid, 'updated_at' => now_iso()]);
    }
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try {
        $result = Seeder::run();
    } catch (Throwable $e) {
        fwrite(STDERR, 'Seed failed: ' . $e->getMessage() . "\n");
        exit(1);
    }
    echo "Seed complete:\n";
    foreach ($result as $email => $state) {
        echo '  ' . $email . ': ' . $state . "\n";
    }
}
