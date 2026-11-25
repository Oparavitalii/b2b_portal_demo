<?php

declare(strict_types=1);

/**
 * Method-aware router. Patterns: '/orders/:id', '/products/:sku'.
 *
 * opts: ['auth' => bool|'apikey' (default true), 'roles' => string[]|null].
 * Pipeline per request: match → Auth::authenticate (unless auth=false;
 * auth='apikey' → ApiKeyAuth::authenticate, client API keys only)
 * → Auth::requireRole (when roles given) → uuid check of params named
 * `id` / `*Id` (400 zod-style) → handler.
 *
 * Paths arrive without the '/api' mount prefix (Request::normalizePath).
 *
 * Precedence: at the first position where two matching routes differ, a
 * literal segment beats a :param, independent of registration order.
 */
final class Router
{
    /** @var list<array{method:string,segments:list<string>,handler:callable,opts:array,seq:int}> */
    private static array $routes = [];

    public static function get(string $pattern, callable $h, array $opts = []): void
    {
        self::add('GET', $pattern, $h, $opts);
    }

    public static function post(string $pattern, callable $h, array $opts = []): void
    {
        self::add('POST', $pattern, $h, $opts);
    }

    public static function put(string $pattern, callable $h, array $opts = []): void
    {
        self::add('PUT', $pattern, $h, $opts);
    }

    public static function patch(string $pattern, callable $h, array $opts = []): void
    {
        self::add('PATCH', $pattern, $h, $opts);
    }

    public static function delete(string $pattern, callable $h, array $opts = []): void
    {
        self::add('DELETE', $pattern, $h, $opts);
    }

    public static function add(string $method, string $pattern, callable $h, array $opts = []): void
    {
        self::$routes[] = [
            'method' => strtoupper($method),
            'segments' => self::split($pattern),
            'handler' => $h,
            'opts' => $opts,
            'seq' => count(self::$routes),
        ];
    }

    public static function dispatch(Request $req): Response
    {
        try {
            $method = $req->method === 'HEAD' ? 'GET' : $req->method;
            $match = self::match($method, $req->path);
            if ($match === null) {
                return Response::json(['error' => 'NOT_FOUND'], 404);
            }
            [$route, $params] = $match;
            $req->params = $params;
            $opts = $route['opts'];
            $auth = $opts['auth'] ?? true;
            if ($auth === 'apikey') {
                ApiKeyAuth::authenticate($req);
            } elseif ($auth) {
                Auth::authenticate($req);
            }
            if (!empty($opts['roles'])) {
                Auth::requireRole($req, $opts['roles']);
            }
            self::validateParams($params);
            $res = ($route['handler'])($req);
            if (!$res instanceof Response) {
                throw new LogicException('Route handler must return Response: ' . $req->method . ' ' . $req->path);
            }
            return $res;
        } catch (ApiError $e) {
            return $e->toResponse();
        } catch (Throwable $e) {
            self::logError($e, $req);
            return Response::json(['error' => 'INTERNAL_ERROR'], 500);
        }
    }

    /** @return array{0:array,1:array<string,string>}|null */
    private static function match(string $method, string $path): ?array
    {
        $segs = self::split($path);
        $best = null;
        $bestScore = null;
        $bestParams = [];
        foreach (self::$routes as $r) {
            if ($r['method'] !== $method || count($r['segments']) !== count($segs)) {
                continue;
            }
            $params = [];
            $score = '';
            foreach ($r['segments'] as $i => $s) {
                if ($s !== '' && $s[0] === ':') {
                    $params[substr($s, 1)] = rawurldecode($segs[$i]);
                    $score .= '0';
                } elseif ($s === $segs[$i]) {
                    $score .= '1';
                } else {
                    continue 2;
                }
            }
            if ($bestScore === null || strcmp($score, $bestScore) > 0) {
                $best = $r;
                $bestScore = $score;
                $bestParams = $params;
            }
        }
        return $best === null ? null : [$best, $bestParams];
    }

    private static function validateParams(array $params): void
    {
        $issues = [];
        foreach ($params as $name => $value) {
            if (($name === 'id' || str_ends_with($name, 'Id')) && !V::isUuid($value)) {
                $issues[] = ['validation' => 'uuid', 'code' => 'invalid_string', 'message' => 'Invalid uuid', 'path' => [$name]];
            }
        }
        if ($issues !== []) {
            throw ApiError::validation($issues);
        }
    }

    /** @return list<string> */
    private static function split(string $path): array
    {
        $t = trim($path, '/');
        return $t === '' ? [] : explode('/', $t);
    }

    /** Message + frames without call arguments (arguments can hold secrets). */
    private static function logError(Throwable $e, Request $req): void
    {
        $lines = [gmdate('c') . ' ' . $req->method . ' ' . $req->path . ' ' . get_class($e) . ': ' . $e->getMessage()
            . ' @ ' . $e->getFile() . ':' . $e->getLine()];
        foreach (array_slice($e->getTrace(), 0, 12) as $f) {
            $lines[] = '  at ' . ($f['class'] ?? '') . ($f['type'] ?? '') . ($f['function'] ?? '?')
                . ' ' . ($f['file'] ?? '') . ':' . ($f['line'] ?? '');
        }
        @file_put_contents(storage_path('error.log'), implode("\n", $lines) . "\n", FILE_APPEND | LOCK_EX);
    }
}
