<?php

declare(strict_types=1);

/**
 * SQLite access. One lazily opened PDO per process.
 *
 * Params may be a list (positional ?) or a map (named; the leading ':' is
 * optional). bool → 0/1, int → PARAM_INT, null → PARAM_NULL, array → JSON.
 */
final class Db
{
    private static ?PDO $pdo = null;
    private static ?string $path = null;
    private static int $depth = 0;

    public static function path(): string
    {
        if (self::$path !== null) {
            return self::$path;
        }
        $root = dirname(__DIR__, 2);
        $p = env('DB_PATH');
        if ($p === null) {
            return $root . '/storage/katalog.sqlite';
        }
        $p = str_replace('\\', '/', $p);
        $absolute = str_starts_with($p, '/') || preg_match('#^[A-Za-z]:/#', $p) === 1;
        return $absolute ? $p : $root . '/' . $p;
    }

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }
        $path = self::path();
        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $lower = static fn($x) => $x === null ? null : mb_strtolower((string) $x, 'UTF-8');
        $pdo->sqliteCreateFunction('ulower', $lower, 1, PDO::SQLITE_DETERMINISTIC);
        self::$pdo = $pdo;
        return $pdo;
    }

    /** Closes the connection; the next call opens $path (null = back to DB_PATH). */
    public static function reset(?string $path = null): void
    {
        self::$pdo = null;
        self::$path = $path;
        self::$depth = 0;
    }

    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public static function val(string $sql, array $params = []): mixed
    {
        $v = self::run($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    public static function exec(string $sql, array $params = []): int
    {
        return self::run($sql, $params)->rowCount();
    }

    public static function insert(string $table, array $row): void
    {
        self::ident($table);
        $cols = array_keys($row);
        array_walk($cols, static fn($c) => self::ident((string) $c));
        $sql = 'INSERT INTO ' . $table . ' (' . implode(', ', $cols) . ') VALUES ('
            . implode(', ', array_map(static fn($c) => ':' . $c, $cols)) . ')';
        self::run($sql, $row);
    }

    public static function update(string $table, array $set, array $where): int
    {
        self::ident($table);
        if ($set === [] || $where === []) {
            throw new InvalidArgumentException('Db::update needs non-empty set and where');
        }
        $params = [];
        $sets = [];
        foreach ($set as $c => $v) {
            self::ident((string) $c);
            $sets[] = "$c = :s_$c";
            $params["s_$c"] = $v;
        }
        $conds = [];
        foreach ($where as $c => $v) {
            self::ident((string) $c);
            if ($v === null) {
                $conds[] = "$c IS NULL";
            } else {
                $conds[] = "$c = :w_$c";
                $params["w_$c"] = $v;
            }
        }
        return self::exec('UPDATE ' . $table . ' SET ' . implode(', ', $sets) . ' WHERE ' . implode(' AND ', $conds), $params);
    }

    /** Runs $fn inside a transaction. Re-entrant: nested calls join the outer one. */
    public static function tx(callable $fn): mixed
    {
        $pdo = self::pdo();
        if (self::$depth === 0) {
            $pdo->beginTransaction();
        }
        self::$depth++;
        try {
            $result = $fn();
            self::$depth--;
            if (self::$depth === 0) {
                $pdo->commit();
            }
            return $result;
        } catch (Throwable $e) {
            self::$depth--;
            if (self::$depth === 0 && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /** '%term%' lower-cased with LIKE wildcards escaped. Use: ulower(col) LIKE :q ESCAPE '\' */
    public static function like(string $term): string
    {
        $t = mb_strtolower(trim($term), 'UTF-8');
        return '%' . addcslashes($t, '\\%_') . '%';
    }

    private static function run(string $sql, array $params): PDOStatement
    {
        $stmt = self::pdo()->prepare($sql);
        $positional = array_is_list($params);
        foreach ($params as $k => $v) {
            $name = $positional ? $k + 1 : (str_starts_with((string) $k, ':') ? (string) $k : ':' . $k);
            if (is_bool($v)) {
                $stmt->bindValue($name, $v ? 1 : 0, PDO::PARAM_INT);
            } elseif (is_int($v)) {
                $stmt->bindValue($name, $v, PDO::PARAM_INT);
            } elseif ($v === null) {
                $stmt->bindValue($name, null, PDO::PARAM_NULL);
            } elseif (is_array($v)) {
                $stmt->bindValue($name, json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            } else {
                $stmt->bindValue($name, (string) $v, PDO::PARAM_STR);
            }
        }
        $stmt->execute();
        return $stmt;
    }

    private static function ident(string $name): void
    {
        if (preg_match('/^[a-z_][a-z0-9_]*$/', $name) !== 1) {
            throw new InvalidArgumentException('Invalid SQL identifier: ' . $name);
        }
    }
}
