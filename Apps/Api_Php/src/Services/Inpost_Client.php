<?php

declare(strict_types=1);

/**
 * B-22 InPost (R-01, R-08, R-09): the only place that talks to the ShipX API.
 *
 * Bearer token + organisation id come from the server env (INPOST_API_TOKEN,
 * INPOST_ORG_ID); they never leave the backend and are never logged. Base URL:
 * INPOST_API_URL (default production ShipX).
 *
 * Errors: any non-2xx answer or a network failure → ApiError(502, 'inpost_error',
 * {status, message, details}) with InPost's own message/details; a missing token
 * or organisation → ApiError(503, 'inpost_not_configured').
 *
 * Tests set InpostClient::$transport = fn(string $method, string $url, ?array $body): array{0:int,1:string}
 * so nothing goes to the network.
 */
final class InpostClient
{
    public const DEFAULT_URL = 'https://api-shipx-pl.easypack24.net';

    /** @var null|callable(string,string,?array):array{0:int,1:string} */
    public static $transport = null;

    /** Seconds per request (refresh-on-view lowers it to 5 via withTimeout). */
    private static int $timeout = 20;

    public static function configured(): bool
    {
        return env('INPOST_API_TOKEN') !== null && env('INPOST_ORG_ID') !== null;
    }

    public static function orgId(): string
    {
        $org = env('INPOST_ORG_ID');
        if ($org === null || env('INPOST_API_TOKEN') === null) {
            throw new ApiError(503, 'inpost_not_configured');
        }
        return $org;
    }

    /** Runs $fn with a shorter per-request timeout, then restores the previous one. */
    public static function withTimeout(int $seconds, callable $fn): mixed
    {
        $prev = self::$timeout;
        self::$timeout = max(1, $seconds);
        try {
            return $fn();
        } finally {
            self::$timeout = $prev;
        }
    }

    /** GET with the token → decoded JSON object. */
    public static function get(string $path, array $query = []): array
    {
        return self::decode(self::send('GET', $path, $query, null, true));
    }

    /** POST JSON with the token → decoded JSON object. */
    public static function post(string $path, array $body): array
    {
        return self::decode(self::send('POST', $path, [], $body, true));
    }

    /** GET with the token → raw response bytes (labels). */
    public static function raw(string $path, array $query): string
    {
        return self::send('GET', $path, $query, null, true);
    }

    /** GET without the token (public endpoints such as /v1/tracking/{number}). */
    public static function getPublic(string $path, array $query = []): array
    {
        return self::decode(self::send('GET', $path, $query, null, false));
    }

    private static function send(string $method, string $path, array $query, ?array $body, bool $auth): string
    {
        $token = null;
        if ($auth) {
            $token = env('INPOST_API_TOKEN');
            if ($token === null || env('INPOST_ORG_ID') === null) {
                throw new ApiError(503, 'inpost_not_configured');
            }
        }
        $url = rtrim((string) env('INPOST_API_URL', self::DEFAULT_URL), '/') . '/' . ltrim($path, '/');
        if ($query !== []) {
            $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        }
        [$status, $raw] = self::$transport !== null
            ? (self::$transport)($method, $url, $body)
            : self::curl($method, $url, $body, $token);
        if ($status < 200 || $status >= 300) {
            throw self::error((int) $status, (string) $raw);
        }
        return (string) $raw;
    }

    /** @return array{0:int,1:string} */
    private static function curl(string $method, string $url, ?array $body, ?string $token): array
    {
        $headers = ['Accept: application/json, application/pdf'];
        if ($token !== null) {
            $headers[] = 'Authorization: Bearer ' . $token;
        }
        $ch = curl_init($url);
        $opts = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => min(5, self::$timeout),
            CURLOPT_TIMEOUT => self::$timeout,
            CURLOPT_FOLLOWLOCATION => false,
        ];
        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
            $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        }
        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $failed = $raw === false;
        curl_close($ch);
        if ($failed) {
            throw new ApiError(502, 'inpost_error', ['status' => 0, 'message' => 'Brak połączenia z InPost', 'details' => null]);
        }
        return [$status, (string) $raw];
    }

    private static function decode(string $raw): array
    {
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new ApiError(502, 'inpost_error', ['status' => 200, 'message' => 'Nieczytelna odpowiedź InPost', 'details' => null]);
        }
        return $data;
    }

    /** ShipX error body {status, error, message, details} → our 502 inpost_error. */
    private static function error(int $status, string $raw): ApiError
    {
        $data = json_decode($raw, true);
        $message = null;
        $details = null;
        if (is_array($data)) {
            $m = $data['message'] ?? $data['error'] ?? null;
            $message = is_string($m) && $m !== '' ? $m : null;
            $details = $data['details'] ?? null;
        }
        return new ApiError(502, 'inpost_error', ['status' => $status, 'message' => $message, 'details' => $details]);
    }
}

if (!class_exists('Inpost_Client', false)) {
    class_alias(InpostClient::class, 'Inpost_Client');
}
