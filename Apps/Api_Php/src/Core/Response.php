<?php

declare(strict_types=1);

/** HTTP response value object + the ApiError exception (split from Http.php). */
final class Response
{
    public int $status;
    /** @var array<string,string> */
    public array $headers;
    public string $body;
    /** @var array<string,array{value:string,opts:array,header:string}> */
    public array $cookies = [];

    public function __construct(int $status = 200, array $headers = [], string $body = '')
    {
        $this->status = $status;
        $this->headers = $headers;
        $this->body = $body;
    }

    public static function json(mixed $data, int $status = 200, array $headers = []): self
    {
        $body = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        return new self($status, ['Content-Type' => 'application/json; charset=UTF-8'] + $headers, $body);
    }

    public static function noContent(): self
    {
        return new self(204);
    }

    public static function raw(string $body, string $contentType, int $status = 200, array $headers = []): self
    {
        return new self($status, ['Content-Type' => $contentType] + $headers, $body);
    }

    /** opts: path, maxAge (seconds; 0 deletes), httpOnly, sameSite (Lax|Strict|None), secure */
    public function withCookie(string $name, string $value, array $opts): self
    {
        $parts = [$name . '=' . rawurlencode($value)];
        if (isset($opts['maxAge'])) {
            $max = (int) $opts['maxAge'];
            $parts[] = 'Max-Age=' . $max;
            if ($max === 0) {
                $parts[] = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT';
            }
        }
        $parts[] = 'Path=' . ($opts['path'] ?? '/');
        if (!empty($opts['httpOnly'])) {
            $parts[] = 'HttpOnly';
        }
        if (!empty($opts['secure'])) {
            $parts[] = 'Secure';
        }
        if (!empty($opts['sameSite'])) {
            $parts[] = 'SameSite=' . $opts['sameSite'];
        }
        $this->cookies[$name] = ['value' => $value, 'opts' => $opts, 'header' => implode('; ', $parts)];
        return $this;
    }

    /** Writes status, headers, cookies and body to the SAPI (front controller only). */
    public function send(): void
    {
        http_response_code($this->status);
        foreach ($this->headers as $k => $v) {
            header($k . ': ' . $v);
        }
        foreach ($this->cookies as $c) {
            header('Set-Cookie: ' . $c['header'], false);
        }
        if ($this->status !== 204 && $this->status !== 304) {
            echo $this->body;
        }
    }
}

final class ApiError extends Exception
{
    /** Zod-style issues when this is a validation error (body shape differs). */
    public ?array $issues = null;
    /** Extra response headers (e.g. WWW-Authenticate for the client API). */
    public array $headers = [];

    public function __construct(public int $status, public string $errorCode, public ?array $meta = null)
    {
        parent::__construct($errorCode);
    }

    public static function notFound(string $entity): self
    {
        return new self(404, 'NOT_FOUND', ['entity' => $entity]);
    }

    public static function forbidden(?string $reason = null): self
    {
        return new self(403, 'FORBIDDEN', $reason === null ? null : ['reason' => $reason]);
    }

    public static function unauthorized(): self
    {
        return new self(401, 'UNAUTHORIZED');
    }

    /** 400 {success:false,error:{issues,name:'ZodError'}} — same body as @hono/zod-validator. */
    public static function validation(array $issues): self
    {
        $e = new self(400, 'VALIDATION');
        $e->issues = array_values($issues);
        return $e;
    }

    public function toResponse(): Response
    {
        if ($this->issues !== null) {
            return Response::json(['success' => false, 'error' => ['issues' => $this->issues, 'name' => 'ZodError']], 400);
        }
        $body = ['error' => $this->errorCode];
        if ($this->meta !== null) {
            $body['meta'] = $this->meta === [] ? new stdClass() : $this->meta;
        }
        $headers = $this->headers;
        // Rate limits (RateLimit) carry the wait in meta; the standard header lets HTTP clients back off on their own.
        if ($this->status === 429 && is_int($this->meta['retryAfter'] ?? null)) {
            $headers += ['Retry-After' => (string) $this->meta['retryAfter']];
        }
        return Response::json($body, $this->status, $headers);
    }
}
