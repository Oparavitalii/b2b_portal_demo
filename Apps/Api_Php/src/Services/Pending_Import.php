<?php

declare(strict_types=1);

/**
 * Product import dropped on the server by `npm run products:push`.
 *
 * The push script uploads storage/import/Pending_Products.json over FTP/SFTP
 * (there is no shell on the host). The next HTTP request to the API claims the
 * file with an atomic rename, so two requests never import it twice, runs the
 * same ImportService as the admin panel and writes the outcome to
 * storage/import/Last_Import.json, which the push script reads back.
 * Afterwards the file is kept as Imported_Products.json (or Failed_Products.json).
 */
final class PendingImport
{
    public const PENDING = 'import/Pending_Products.json';
    public const CLAIMED = 'import/Pending_Products.claimed.json';
    public const DONE = 'import/Imported_Products.json';
    public const FAILED = 'import/Failed_Products.json';
    public const RESULT = 'import/Last_Import.json';

    /** @return array<string,mixed>|null the written result, null when nothing was pending */
    public static function run(): ?array
    {
        $pending = storage_path(self::PENDING);
        if (!is_file($pending)) {
            return null;
        }
        $claimed = storage_path(self::CLAIMED);
        if (!@rename($pending, $claimed)) {
            return null;
        }

        $result = ['at' => now_iso(), 'bytes' => (int) filesize($claimed)];
        $target = self::DONE;
        try {
            $json = json_decode((string) file_get_contents($claimed), true, 64, JSON_THROW_ON_ERROR);
            if (!is_array($json)) {
                throw new RuntimeException('top level is not an object');
            }
            $imported = ImportService::import($json);
            $result += [
                'ok' => true,
                'created' => $imported['created'],
                'updated' => $imported['updated'],
                'deactivated' => $imported['deactivated'],
                'skipped' => $imported['skipped'],
            ];
        } catch (ApiError $e) {
            $result += ['ok' => false, 'error' => $e->errorCode, 'meta' => $e->meta];
            $target = self::FAILED;
        } catch (Throwable $e) {
            $result += ['ok' => false, 'error' => $e->getMessage()];
            $target = self::FAILED;
        }

        $final = storage_path($target);
        if (is_file($final)) {
            @unlink($final);
        }
        @rename($claimed, $final);
        file_put_contents(
            storage_path(self::RESULT),
            json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n",
        );
        if ($result['ok'] === false) {
            error_log('Pending product import failed: ' . json_encode($result, JSON_UNESCAPED_UNICODE));
        }
        return $result;
    }
}
