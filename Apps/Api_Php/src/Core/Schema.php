<?php

declare(strict_types=1);

/**
 * Applies database/Schema.sql, then every database/Schema_*.sql (sorted),
 * each file at most once per database (tracked in schema_files). Used by
 * database/Migrate.php and the test harness.
 */
final class Schema
{
    /** @return list<string> file names applied by this call */
    public static function apply(?string $dir = null): array
    {
        $dir ??= dirname(__DIR__, 2) . '/database';
        $pdo = Db::pdo();
        $pdo->exec('CREATE TABLE IF NOT EXISTS schema_files (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
        $extra = glob($dir . '/Schema_*.sql') ?: [];
        sort($extra, SORT_STRING);
        $files = array_merge([$dir . '/Schema.sql'], $extra);
        $applied = [];
        foreach ($files as $file) {
            $name = basename($file);
            if (Db::val('SELECT 1 FROM schema_files WHERE name = ?', [$name]) !== null) {
                continue;
            }
            $sql = file_get_contents($file);
            if ($sql === false) {
                throw new RuntimeException('Cannot read ' . $file);
            }
            Db::tx(static function () use ($pdo, $sql, $name): void {
                $pdo->exec($sql);
                Db::insert('schema_files', ['name' => $name, 'applied_at' => now_iso()]);
            });
            $applied[] = $name;
        }
        return $applied;
    }
}
