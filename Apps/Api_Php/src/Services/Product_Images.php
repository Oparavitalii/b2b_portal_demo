<?php

declare(strict_types=1);

/**
 * Product photos uploaded in the admin panel (Pilot_Run 2026-10-10).
 *
 * Stored in storage/product_images/ — never touched by the deploy, unlike the SPA's
 * /img/products/ — and served by GET /api/media/products/:file. products.image keeps
 * 'upload/<file>' so ProductsService::imageUrl() can tell them from synced photos.
 * The type is read from the file's bytes, never from the client's name or header.
 */
final class ProductImages
{
    public const PREFIX = 'upload/';
    public const URL_BASE = '/api/media/products/';
    public const MAX_BYTES = 5 * 1024 * 1024;
    private const DIR = 'product_images';
    private const TYPES = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
    private const NAME_RE = '/^[A-Za-z0-9_]+\.(jpg|png|webp)$/';

    /** Raw image bytes → stored file name ('Sku_ab12cd34.webp'). 422 invalid_image when not jpg/png/webp. */
    public static function store(string $sku, string $bytes): string
    {
        if ($bytes === '') {
            throw new ApiError(422, 'invalid_image', ['reason' => 'empty']);
        }
        if (strlen($bytes) > self::MAX_BYTES) {
            throw new ApiError(413, 'payload_too_large', ['maxBytes' => self::MAX_BYTES]);
        }
        $ext = self::sniff($bytes);
        if ($ext === null) {
            throw new ApiError(422, 'invalid_image', ['reason' => 'type']);
        }
        $base = trim((string) preg_replace('/[^A-Za-z0-9]+/', '_', $sku), '_');
        $name = ($base === '' ? 'Produkt' : $base) . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        if (file_put_contents(self::path($name), $bytes) === false) {
            throw new RuntimeException('Cannot write product image ' . $name);
        }
        return $name;
    }

    /** Deletes an uploaded file when products.image pointed at one (older synced photos are left alone). */
    public static function forget(?string $image): void
    {
        if ($image === null || !str_starts_with($image, self::PREFIX)) {
            return;
        }
        $name = substr($image, strlen(self::PREFIX));
        if (preg_match(self::NAME_RE, $name) === 1 && is_file(self::path($name))) {
            @unlink(self::path($name));
        }
    }

    /** GET /api/media/products/:file → the image, cached for a year (names are unique per upload). */
    public static function serve(string $name): Response
    {
        if (preg_match(self::NAME_RE, $name, $m) !== 1 || !is_file(self::path($name))) {
            throw ApiError::notFound('image');
        }
        return Response::raw((string) file_get_contents(self::path($name)), self::TYPES[$m[1]], 200, [
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }

    private static function path(string $name): string
    {
        $dir = storage_path(self::DIR);
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        return $dir . '/' . $name;
    }

    private static function sniff(string $b): ?string
    {
        if (str_starts_with($b, "\xFF\xD8\xFF")) {
            return 'jpg';
        }
        if (str_starts_with($b, "\x89PNG\r\n\x1A\n")) {
            return 'png';
        }
        if (strlen($b) >= 12 && substr($b, 0, 4) === 'RIFF' && substr($b, 8, 4) === 'WEBP') {
            return 'webp';
        }
        return null;
    }
}
