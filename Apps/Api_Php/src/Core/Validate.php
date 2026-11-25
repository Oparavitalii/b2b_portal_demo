<?php

declare(strict_types=1);

/**
 * Zod-compatible validator (scalar checks in VScalar, issue shapes in VIssue).
 *
 * Rule keys: type, required (false), nullable (false), default, min, max,
 * values (enum), items (rule for array elements), schema (nested object),
 * plus: trim (strings, default true — pass false for passwords),
 * pattern (PCRE for strings; zod .regex, message 'Invalid'),
 * emptyNull (strings: '' after trim → null, like optionalTrimmedString).
 *
 * Types: string | email | uuid | date | datetime | int | number | bool
 *        | coerce_bool | enum | array | object | any
 *
 * Absent optional keys are omitted (or get `default`); unknown keys are
 * stripped; all issues are collected, then ApiError::validation is thrown.
 */
final class V
{
    public const PAGE = [
        // D-04: a huge page overflowed LIMIT/OFFSET into a 500.
        'page' => ['type' => 'int', 'min' => 1, 'max' => 1000000, 'default' => 1],
        'pageSize' => ['type' => 'int', 'min' => 1, 'max' => 100, 'default' => 20],
    ];

    private const UUID_RE = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    public static function parse(mixed $data, array $schema, array $path = []): array
    {
        $issues = [];
        $out = self::object($data, $schema, $path, $issues);
        if ($issues !== []) {
            throw ApiError::validation($issues);
        }
        return $out;
    }

    public static function isUuid(mixed $v): bool
    {
        return is_string($v) && preg_match(self::UUID_RE, $v) === 1;
    }

    private static function object(mixed $data, array $schema, array $path, array &$issues): array
    {
        if ($data === null && $path === []) {
            $data = [];
        }
        if (!is_array($data) || ($data !== [] && array_is_list($data))) {
            $issues[] = VIssue::type('object', $data, $path);
            return [];
        }
        $out = [];
        foreach ($schema as $key => $rule) {
            $p = array_merge($path, [$key]);
            if (!array_key_exists($key, $data)) {
                if (array_key_exists('default', $rule)) {
                    $out[$key] = $rule['default'];
                } elseif (!empty($rule['required'])) {
                    $issues[] = ['code' => 'invalid_type', 'expected' => VIssue::expected($rule), 'received' => 'undefined', 'path' => $p, 'message' => 'Required'];
                }
                continue;
            }
            $ok = true;
            $value = self::value($data[$key], $rule, $p, $issues, $ok);
            if ($ok) {
                $out[$key] = $value;
            }
        }
        return $out;
    }

    private static function value(mixed $v, array $rule, array $p, array &$issues, bool &$ok): mixed
    {
        $type = $rule['type'] ?? 'any';
        $before = count($issues);
        if (is_string($v) && in_array($type, ['string', 'email', 'uuid', 'date', 'datetime', 'enum'], true)) {
            if ($rule['trim'] ?? true) {
                $v = trim($v);
            }
            if (!empty($rule['emptyNull']) && $v === '') {
                $v = null;
            }
        }
        if ($v === null) {
            if (!empty($rule['nullable'])) {
                return null;
            }
            $issues[] = VIssue::type(VIssue::expected($rule), null, $p);
            $ok = false;
            return null;
        }
        $v = match ($type) {
            'string', 'email', 'uuid', 'date', 'datetime' => VScalar::str($v, $type, $rule, $p, $issues),
            'int', 'number' => VScalar::num($v, $type, $rule, $p, $issues),
            'bool' => VScalar::boolStrict($v, $p, $issues),
            'coerce_bool' => is_string($v) ? $v !== '' : (bool) $v,
            'enum' => VScalar::enum($v, $rule, $p, $issues),
            'array' => self::arr($v, $rule, $p, $issues),
            'object' => isset($rule['schema']) ? self::object($v, $rule['schema'], $p, $issues)
                : (is_array($v) && ($v === [] || !array_is_list($v)) ? $v : VIssue::fail($issues, VIssue::type('object', $v, $p))),
            default => $v,
        };
        $ok = count($issues) === $before;
        return $v;
    }

    private static function arr(mixed $v, array $rule, array $p, array &$issues): mixed
    {
        if (!is_array($v) || !array_is_list($v)) {
            return VIssue::fail($issues, VIssue::type('array', $v, $p));
        }
        $n = count($v);
        if (isset($rule['min']) && $n < $rule['min']) {
            $issues[] = ['code' => 'too_small', 'minimum' => $rule['min'], 'type' => 'array', 'inclusive' => true, 'exact' => false,
                'message' => 'Array must contain at least ' . $rule['min'] . ' element(s)', 'path' => $p];
        }
        if (isset($rule['max']) && $n > $rule['max']) {
            $issues[] = ['code' => 'too_big', 'maximum' => $rule['max'], 'type' => 'array', 'inclusive' => true, 'exact' => false,
                'message' => 'Array must contain at most ' . $rule['max'] . ' element(s)', 'path' => $p];
        }
        if (!isset($rule['items'])) {
            return $v;
        }
        $out = [];
        foreach ($v as $i => $item) {
            $ok = true;
            $out[] = self::value($item, $rule['items'], array_merge($p, [$i]), $issues, $ok);
        }
        return $out;
    }
}
