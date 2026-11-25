<?php

declare(strict_types=1);

/** Zod-shaped issue builders used by V and VScalar. */
final class VIssue
{
    public static function fail(array &$issues, array $issue): mixed
    {
        $issues[] = $issue;
        return null;
    }

    public static function str(string $validation, string $message, array $p): array
    {
        return ['validation' => $validation, 'code' => 'invalid_string', 'message' => $message, 'path' => $p];
    }

    public static function type(string $expected, mixed $v, array $p): array
    {
        $received = self::received($v);
        return ['code' => 'invalid_type', 'expected' => $expected, 'received' => $received, 'path' => $p,
            'message' => "Expected $expected, received $received"];
    }

    public static function received(mixed $v): string
    {
        return match (true) {
            $v === null => 'null',
            is_bool($v) => 'boolean',
            is_int($v) => 'number',
            is_float($v) => is_nan($v) ? 'nan' : 'number',
            is_string($v) => 'string',
            is_array($v) => array_is_list($v) && $v !== [] ? 'array' : 'object',
            default => 'unknown',
        };
    }

    public static function expected(array $rule): string
    {
        return match ($rule['type'] ?? 'any') {
            'email', 'uuid', 'date', 'datetime' => 'string',
            'int', 'number' => 'number',
            'bool', 'coerce_bool' => 'boolean',
            'enum' => implode(' | ', array_map(static fn($x) => "'" . $x . "'", $rule['values'] ?? [])),
            default => $rule['type'] ?? 'any',
        };
    }
}
