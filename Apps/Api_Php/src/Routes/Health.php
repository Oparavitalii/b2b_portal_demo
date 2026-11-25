<?php

declare(strict_types=1);

/**
 * GET /api/health (public). Reports the SQLite journal mode (expected 'wal';
 * Host support is verified with this at first deploy) and whether the
 * database file accepts writes (insert + delete in health_probe), plus whether
 * order mails have a recipient (mail.orderEmailConfigured).
 * 200 when the database is reachable and writable, 503 otherwise.
 */
Router::get('/health', static function (Request $req): Response {
    try {
        $journalMode = strtolower((string) Db::val('PRAGMA journal_mode'));
    } catch (Throwable) {
        return Response::json(['status' => 'error', 'db' => ['journalMode' => null, 'writable' => false]], 503);
    }
    $writable = true;
    try {
        Db::tx(static function (): void {
            Db::insert('health_probe', ['at' => now_iso()]);
            Db::exec('DELETE FROM health_probe');
        });
    } catch (Throwable) {
        $writable = false;
    }
    return Response::json(
        [
            'status' => $writable ? 'ok' : 'error',
            'db' => ['journalMode' => $journalMode, 'writable' => $writable],
            'mail' => ['driver' => env('MAIL_DRIVER', 'log'), 'orderEmailConfigured' => OrderMail::configured()],
        ],
        $writable ? 200 : 503,
    );
}, ['auth' => false]);
