<?php

declare(strict_types=1);

/** storage/Reset_Admin.flag → ADMIN_PASSWORD from .env applied on the next request (npm run env:push). */
require __DIR__ . '/Harness.php';

$flag = storage_path(AdminPassword::FLAG);
$log = static fn(): string => (string) @file_get_contents(storage_path('setup.log'));

// ---------- no flag: nothing happens ----------
t_reset();
$admin = t_user('admin', ['email' => T_ADMIN_EMAIL]);
AdminPassword::applyFlag();
t_ok(t_login(T_ADMIN_EMAIL, T_PASSWORD)['status'] === 200 && $log() === '', 'no flag → old password still works, no log');

// ---------- flag: password from .env applied, sessions ended, flag gone ----------
t_ok(Db::val('SELECT COUNT(*) FROM sessions WHERE user_id = ?', [$admin['id']]) > 0, 'admin has a session before the reset');
file_put_contents($flag, "test\n");
t_call('GET', '/health');
AdminPassword::applyFlag();
t_ok(!is_file($flag), 'flag deleted');
t_ok(str_contains($log(), 'admin reset — ' . T_ADMIN_EMAIL . ': password updated, sessions ended'), 'setup.log records the reset');
t_ok(!str_contains($log(), T_ADMIN_PASSWORD), 'setup.log never contains the password');
t_ok((int) Db::val('SELECT COUNT(*) FROM sessions WHERE user_id = ?', [$admin['id']]) === 0, 'old sessions ended');
t_ok(t_login(T_ADMIN_EMAIL, T_PASSWORD)['status'] === 401, 'old password rejected');
t_ok(t_login(T_ADMIN_EMAIL, T_ADMIN_PASSWORD)['status'] === 200, 'new password from .env accepted');

// ---------- pending customer becomes an active admin ----------
Db::exec("UPDATE users SET status = 'pending', role = 'customer' WHERE id = ?", [$admin['id']]);
file_put_contents($flag, "test\n");
AdminPassword::applyFlag();
$row = Db::one('SELECT role, status FROM users WHERE id = ?', [$admin['id']]);
t_ok($row['role'] === 'admin' && $row['status'] === 'active', 'reset restores role admin + status active');

// ---------- no admin yet: created ----------
t_reset();
file_put_contents($flag, "test\n");
AdminPassword::applyFlag();
t_ok(str_contains($log(), T_ADMIN_EMAIL . ': created') && t_login(T_ADMIN_EMAIL, T_ADMIN_PASSWORD)['status'] === 200, 'missing admin is created');

// ---------- empty ADMIN_PASSWORD: flag consumed, failure logged, nothing changed ----------
// An empty process value falls through to Apps/Api_Php/.env, so this case only runs without one.
putenv('ADMIN_PASSWORD=');
if (env('ADMIN_PASSWORD') === null) {
    file_put_contents($flag, "test\n");
    AdminPassword::applyFlag();
    putenv('ADMIN_PASSWORD=' . T_ADMIN_PASSWORD);
    t_ok(!is_file($flag) && str_contains($log(), 'admin reset — failed: ADMIN_EMAIL and ADMIN_PASSWORD must be set'), 'missing password → flag removed, failure logged');
    t_ok(t_login(T_ADMIN_EMAIL, T_ADMIN_PASSWORD)['status'] === 200, 'password unchanged after the failed reset');
} else {
    putenv('ADMIN_PASSWORD=' . T_ADMIN_PASSWORD);
    echo "skip empty-password case: Apps/Api_Php/.env sets ADMIN_PASSWORD\n";
}
