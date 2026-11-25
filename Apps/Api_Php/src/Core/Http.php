<?php

declare(strict_types=1);

final class Request
{
    public string $method = 'GET';
    public string $path = '/';
    public array $query = [];
    public array $params = [];
    public mixed $body = null;
    /** @var array<string,string> lower-case keys */
    public array $headers = [];
    public array $cookies = [];
    public array $files = [];
    public array $form = [];
    public ?string $remoteAddr = null;
    /** Raw request body (JSON requests keep it for signature checks). */
    public string $rawBody = '';
    public ?string $userId = null;
    public ?string $role = null;
    public ?string $sessionId = null;
    /** Authenticated user's DB row (snake_case keys), set by Auth::authenticate. */
    public ?array $user = null;
    /** api_keys row when the request came in with a client API key (ApiKeyAuth). */
    public ?array $apiKey = null;

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    /** cf-connecting-ip → first x-forwarded-for → REMOTE_ADDR */
    public function ip(): ?string
    {
        foreach (['cf-connecting-ip'] as $h) {
            $v = trim((string) $this->header($h));
            if ($v !== '') {
                return $v;
            }
        }
        $xff = $this->header('x-forwarded-for');
        if ($xff !== null) {
            $first = trim(explode(',', $xff)[0]);
            if ($first !== '') {
                return $first;
            }
        }
        return $this->remoteAddr;
    }

    public function userAgent(): ?string
    {
        return $this->header('user-agent');
    }

    public static function fromGlobals(): self
    {
        $r = new self();
        $r->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $path = (string) (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/');
        $r->path = self::normalizePath($path);
        $r->query = $_GET;
        $r->cookies = $_COOKIE;
        $r->files = $_FILES;
        $r->form = $_POST;
        $r->remoteAddr = $_SERVER['REMOTE_ADDR'] ?? null;
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) {
                $r->headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string) $v;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $r->headers['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        }
        if (isset($_SERVER['CONTENT_LENGTH'])) {
            $r->headers['content-length'] = (string) $_SERVER['CONTENT_LENGTH'];
        }
        $ct = strtolower((string) $r->header('content-type'));
        if (!str_starts_with($ct, 'multipart/form-data')) {
            $r->rawBody = (string) file_get_contents('php://input');
        }
        if (str_contains($ct, 'json') && $r->rawBody !== '') {
            $decoded = json_decode($r->rawBody, true);
            $r->body = json_last_error() === JSON_ERROR_NONE ? $decoded : null;
        } elseif ($r->form !== []) {
            $r->body = $r->form;
        }
        return $r;
    }

    /** Mount prefix of the API (same origin as the SPA): '/api/health' and '/health' route alike. */
    public const MOUNT = '/api';

    /** Trims slashes and strips the '/api' mount prefix, so the Router sees '/health', '/auth/login', ... */
    public static function normalizePath(string $path): string
    {
        $path = '/' . trim($path, '/');
        if ($path === self::MOUNT) {
            return '/';
        }
        if (str_starts_with($path, self::MOUNT . '/')) {
            $path = substr($path, strlen(self::MOUNT));
        }
        return $path;
    }
}
