<?php

declare(strict_types=1);

/** Minimal HS256 JWT (catalogue jwt.php, wrapped in a class). */
final class Jwt
{
    public static function encode(array $payload, string $secret): string
    {
        $h = self::b64(json_encode(['alg' => 'HS256'], JSON_UNESCAPED_SLASHES));
        $p = self::b64(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        return "$h.$p." . self::b64(hash_hmac('sha256', "$h.$p", $secret, true));
    }

    /** Payload on success; null on malformed token, wrong alg, bad signature, exp or nbf. */
    public static function decode(string $t, string $secret): ?array
    {
        $parts = explode('.', $t);
        if (count($parts) !== 3) {
            return null;
        }
        [$h, $p, $s] = $parts;
        $header = json_decode(self::unb64($h), true);
        if (!is_array($header) || ($header['alg'] ?? null) !== 'HS256') {
            return null;
        }
        if (!hash_equals(self::b64(hash_hmac('sha256', "$h.$p", $secret, true)), $s)) {
            return null;
        }
        $payload = json_decode(self::unb64($p), true);
        if (!is_array($payload)) {
            return null;
        }
        $now = time();
        if (isset($payload['exp']) && (int) $payload['exp'] <= $now) {
            return null;
        }
        if (isset($payload['nbf']) && (int) $payload['nbf'] > $now) {
            return null;
        }
        return $payload;
    }

    private static function b64(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function unb64(string $data): string
    {
        $padded = $data . str_repeat('=', (4 - strlen($data) % 4) % 4);
        return base64_decode(strtr($padded, '-_', '+/'), true) ?: '';
    }
}
