<?php

declare(strict_types=1);

/** T-01 smoke: GET /api/health (journal mode + write probe), /api mount prefix, schema tables, backup. */
require __DIR__ . '/Harness.php';

t_reset();

$r = t_call('GET', '/api/health');
t_ok($r['status'] === 200 && ($r['json']['status'] ?? null) === 'ok', 'GET /api/health → 200 {status:ok}');
t_ok(($r['json']['db']['journalMode'] ?? null) === 'wal', 'health reports journalMode wal');
t_ok(($r['json']['db']['writable'] ?? null) === true, 'health write probe → writable true');
t_ok((int) Db::val('SELECT COUNT(*) FROM health_probe') === 0, 'write probe leaves no rows behind');
t_ok(t_call('GET', '/health')['json'] === $r['json'], '/health and /api/health route alike');
t_ok(t_call('GET', '/api')['status'] === 404 && t_call('GET', '/apiary/health')['status'] === 404, "only the exact '/api' segment is stripped");
t_ok(Request::normalizePath('/api/auth/login/') === '/auth/login' && Request::normalizePath('/') === '/', 'Request::normalizePath strips /api and slashes');

$tables = array_column(Db::all("SELECT name FROM sqlite_master WHERE type = 'table'"), 'name');
$need = ['users', 'addresses', 'sessions', 'password_reset_tokens', 'email_verification_tokens', 'audit_log',
    'products', 'cart_items', 'orders', 'order_items', 'rate_limits', 'schema_files'];
t_ok(array_diff($need, $tables) === [], 'Schema.sql creates every table');

// money is integer grosze; role/status CHECKs
Db::insert('products', ['sku' => 'BX-T1', 'name' => 'Test', 'price_gross' => 123456, 'deposit_gross' => 50000]);
t_ok(Db::val("SELECT typeof(price_gross) FROM products WHERE sku = 'BX-T1'") === 'integer', 'price_gross stored as INTEGER');
$bad = static function (array $over): bool {
    try {
        t_user('customer', $over);
        return false;
    } catch (PDOException) {
        return true;
    }
};
t_ok($bad(['role' => 'readonly']), "users.role CHECK rejects roles outside admin|customer");
t_ok($bad(['status' => 'blocked']), "users.status CHECK rejects values outside pending|active");
t_ok($bad(['discount_percent' => 101]), 'users.discount_percent CHECK 0..100');
$u = t_user('customer', ['email' => 'Case@Example.com']);
t_ok($bad(['email' => 'case@example.COM']), 'users.email UNIQUE COLLATE NOCASE');

// cart line uniqueness also for NULL variant
$line = static fn(?string $variant) => Db::insert('cart_items', ['id' => uuid4(), 'user_id' => $u['id'], 'sku' => 'BX-T1', 'variant' => $variant, 'qty' => 1]);
$line(null);
try {
    $line(null);
    t_ok(false, 'cart_items unique per (user, sku, variant) incl. NULL variant');
} catch (PDOException) {
    t_ok(true, 'cart_items unique per (user, sku, variant) incl. NULL variant');
}

// orders keep their snapshot when the account is deleted
$orderId = uuid4();
Db::insert('orders', ['id' => $orderId, 'number' => 'CDM-2026-0001', 'user_id' => $u['id'],
    'customer_snapshot' => ['companyName' => 'X'], 'address_snapshot' => ['city' => 'Y']]);
Db::exec('DELETE FROM cart_items');
Db::exec('DELETE FROM users WHERE id = ?', [$u['id']]);
t_ok(Db::one('SELECT user_id FROM orders WHERE id = ?', [$orderId]) === ['user_id' => null], 'deleting a user sets orders.user_id NULL');

// backup script (separate process against a real file)
$dbFile = $GLOBALS['__t']['dir'] . '/backup_src.sqlite';
Db::reset($dbFile);
Schema::apply();
Db::reset();
$env = 'DB_PATH=' . $dbFile;
putenv($env);
$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(dirname(__DIR__) . '/scripts/Backup.php');
$paths = [];
for ($i = 0; $i < 9; $i++) {
    $out = [];
    exec($cmd . ' 2>&1', $out, $code);
    $paths[] = trim(implode("\n", $out));
    if ($i < 8) {
        // distinct second-resolution names: rename the new file into the past
        $last = end($paths);
        if (is_file($last)) {
            rename($last, storage_path('backups/katalog_2000010' . ($i + 1) . '_000000.sqlite'));
        }
    }
}
$final = end($paths);
t_ok($code === 0 && is_file($final) && str_contains($final, '/backups/katalog_'), 'Backup.php writes storage/backups/katalog_*.sqlite and prints its path');
$kept = glob(storage_path('backups') . '/katalog_*.sqlite') ?: [];
t_ok(count($kept) === 7 && in_array($final, $kept, true), 'Backup.php keeps the newest 7 copies');
$pdo = new PDO('sqlite:' . $final);
t_ok((int) $pdo->query("SELECT COUNT(*) FROM sqlite_master WHERE name = 'users'")->fetchColumn() === 1, 'backup is a valid database');
$pdo = null;
putenv('DB_PATH');
