<?php

declare(strict_types=1);

/**
 * In-process test harness. Every smoke file: require __DIR__ . '/Harness.php';
 * then t_reset() and assertions via t_ok(). On exit prints a summary and exits 1
 * when any assertion failed (or none ran).
 *
 * Isolation: each process gets its own temp dir (SQLite files + storage for
 * mail.log / error.log), so parallel runs never collide. Mail always goes to
 * the log driver and the seed uses a random admin password, whatever .env says.
 * Apps/Api_Php/.env is never read (ENV_FILE points at a missing file): it may
 * hold the production SMTP login, and a test that clears ORDER_EMAIL would
 * otherwise fall through to it and send a real e-mail.
 */

putenv('ENV_FILE=' . sys_get_temp_dir() . '/api_php_test_no_env_file');
putenv('APP_ENV=test');
putenv('RATE_LIMIT=on');
putenv('MAIL_DRIVER=log');
putenv('APP_URL=http://localhost:5173');
// Throwaway credentials, new for every test process: the repo holds no password.
define('T_ADMIN_PASSWORD', 'adm-' . bin2hex(random_bytes(8)));
define('T_DEMO_PASSWORD', 'demo-' . bin2hex(random_bytes(8)));
putenv('ADMIN_EMAIL=admin@catalog-demo.local');
putenv('ADMIN_PASSWORD=' . T_ADMIN_PASSWORD);
putenv('DEMO_PASSWORD=' . T_DEMO_PASSWORD);
$GLOBALS['__t'] = [
    'pass' => 0,
    'fail' => 0,
    'dir' => rtrim(str_replace('\\', '/', sys_get_temp_dir()), '/') . '/api_php_test_' . getmypid() . '_' . bin2hex(random_bytes(4)),
    'n' => 0,
    'pwHash' => null,
];
mkdir($GLOBALS['__t']['dir'] . '/storage', 0775, true);
putenv('STORAGE_PATH=' . $GLOBALS['__t']['dir'] . '/storage');

require_once dirname(__DIR__) . '/src/Bootstrap.php';

const T_PASSWORD = 'Test12345!';
const T_ADMIN_EMAIL = 'admin@catalog-demo.local';
const T_APP_URL = 'http://localhost:5173';

register_shutdown_function(static function (): void {
    $t = $GLOBALS['__t'];
    Db::reset();
    t_rmdir($t['dir']);
    $err = error_get_last();
    $crashed = $err !== null && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true);
    echo "\n# {$t['pass']} passed, {$t['fail']} failed\n";
    if ($crashed || $t['fail'] > 0 || $t['pass'] === 0) {
        exit(1);
    }
});

/** Fresh temp SQLite built from Schema.sql + Schema_*.sql. */
function t_reset(): void
{
    Db::reset();
    $t = &$GLOBALS['__t'];
    $t['n']++;
    $path = $t['dir'] . '/db_' . $t['n'] . '.sqlite';
    Db::reset($path);
    Schema::apply();
}

/** Runs database/Seed.php (admin + demo customer) against the current test database. */
function t_seed(): array
{
    require_once dirname(__DIR__) . '/database/Seed.php';
    return Seeder::run();
}

/** Inserts a user (password T_PASSWORD; active customer by default) and returns the DB row. */
function t_user(string $role = 'customer', array $over = []): array
{
    $GLOBALS['__t']['pwHash'] ??= Auth::hashPassword(T_PASSWORD);
    $id = uuid4();
    $row = array_merge([
        'id' => $id,
        'email' => $role . '.' . substr($id, 0, 8) . '@example.com',
        'password_hash' => $GLOBALS['__t']['pwHash'],
        'role' => $role,
        'status' => 'active',
        'company_name' => 'Firma Testowa sp. z o.o.',
        'nip' => '9876543210',
        'contact_name' => 'Anna Testowa',
        'phone' => '+48 500 000 000',
        'discount_percent' => 0,
        'email_verified_at' => now_iso(),
        'created_at' => now_iso(),
        'updated_at' => now_iso(),
    ], $over);
    Db::insert('users', $row);
    return Db::one('SELECT * FROM users WHERE id = ?', [$row['id']]);
}

/** Issues a real session for the user and returns its access token. */
function t_token(array $userRow): string
{
    return Auth::issueSession($userRow, t_request('POST', '/auth/login'))['accessToken'];
}

function t_request(string $method, string $path): Request
{
    $req = new Request();
    $req->method = strtoupper($method);
    $req->path = Request::normalizePath($path);
    $req->remoteAddr = '127.0.0.1';
    $req->headers = ['user-agent' => 'api-php-smoke'];
    return $req;
}

/**
 * Dispatches through the real router (JSON body round-tripped like HTTP).
 * Paths may be given with or without the '/api' mount prefix.
 * @return array{status:int,json:mixed,headers:array,body:string,cookies:array<string,string>,setCookie:array<string,string>}
 */
function t_call(string $method, string $path, mixed $body = null, ?string $token = null, array $query = [], array $cookies = []): array
{
    $qs = [];
    if (str_contains($path, '?')) {
        [$path, $raw] = explode('?', $path, 2);
        parse_str($raw, $qs);
    }
    $req = t_request($method, $path);
    $req->query = array_merge($qs, $query);
    $req->cookies = $cookies;
    if ($token !== null) {
        $req->headers['authorization'] = 'Bearer ' . $token;
    }
    if ($body !== null) {
        $req->rawBody = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $req->headers['content-type'] = 'application/json';
        $req->body = json_decode($req->rawBody, true);
    }
    $res = Router::dispatch($req);
    $isJson = str_contains(strtolower($res->headers['Content-Type'] ?? ''), 'json');
    return [
        'status' => $res->status,
        'json' => $isJson ? json_decode($res->body, true) : null,
        'headers' => $res->headers,
        'body' => $res->body,
        'cookies' => array_map(static fn(array $c) => $c['value'], $res->cookies),
        'setCookie' => array_map(static fn(array $c) => $c['header'], $res->cookies),
    ];
}

/** Logs in through POST /auth/login (rate-limit buckets cleared first). */
function t_login(string $email, string $password): array
{
    Db::exec('DELETE FROM rate_limits');
    return t_call('POST', '/auth/login', ['email' => $email, 'password' => $password]);
}

function t_ok(bool $cond, string $label): void
{
    if ($cond) {
        $GLOBALS['__t']['pass']++;
        echo "ok   $label\n";
    } else {
        $GLOBALS['__t']['fail']++;
        echo "FAIL $label\n";
    }
}

/** Raw contents of this process's mail log ('' when nothing was "sent"). */
function t_mail_log(): string
{
    $f = storage_path('mail.log');
    return is_file($f) ? (string) file_get_contents($f) : '';
}

/** Mail log as decoded entries {to,subject,html,text,at}, oldest first. */
function t_mails(): array
{
    $out = [];
    foreach (explode("\n", t_mail_log()) as $line) {
        if (trim($line) !== '') {
            $out[] = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
        }
    }
    return $out;
}

function t_rmdir(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    foreach (scandir($dir) ?: [] as $f) {
        if ($f === '.' || $f === '..') {
            continue;
        }
        $p = $dir . '/' . $f;
        is_dir($p) ? t_rmdir($p) : @unlink($p);
    }
    @rmdir($dir);
}
