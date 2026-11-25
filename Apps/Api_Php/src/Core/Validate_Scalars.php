<?php

declare(strict_types=1);

/** Scalar checks for V (string/email/uuid/date/datetime, numbers, booleans, enums). */
final class VScalar
{
    private const DATETIME_RE = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/';

    public static function str(mixed $v, string $type, array $rule, array $p, array &$issues): mixed
    {
        if (!is_string($v)) {
            return VIssue::fail($issues, VIssue::type('string', $v, $p));
        }
        if ($type === 'email') {
            $v = strtolower($v);
            if (filter_var($v, FILTER_VALIDATE_EMAIL) === false) {
                return VIssue::fail($issues, VIssue::str('email', 'Invalid email', $p));
            }
        } elseif ($type === 'uuid' && !V::isUuid($v)) {
            return VIssue::fail($issues, VIssue::str('uuid', 'Invalid uuid', $p));
        } elseif ($type === 'date') {
            $ok = preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) === 1 && checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
            if (!$ok) {
                return VIssue::fail($issues, VIssue::str('date', 'Invalid date', $p));
            }
        } elseif ($type === 'datetime' && (preg_match(self::DATETIME_RE, $v) !== 1 || to_iso($v) === null)) {
            return VIssue::fail($issues, VIssue::str('datetime', 'Invalid datetime', $p));
        }
        $len = mb_strlen($v, 'UTF-8');
        if (isset($rule['min']) && $len < $rule['min']) {
            $issues[] = ['code' => 'too_small', 'minimum' => $rule['min'], 'type' => 'string', 'inclusive' => true, 'exact' => false,
                'message' => 'String must contain at least ' . $rule['min'] . ' character(s)', 'path' => $p];
        }
        if (isset($rule['max']) && $len > $rule['max']) {
            $issues[] = ['code' => 'too_big', 'maximum' => $rule['max'], 'type' => 'string', 'inclusive' => true, 'exact' => false,
                'message' => 'String must contain at most ' . $rule['max'] . ' character(s)', 'path' => $p];
        }
        if (isset($rule['pattern']) && preg_match($rule['pattern'], $v) !== 1) {
            $issues[] = VIssue::str('regex', 'Invalid', $p);
        }
        return $v;
    }

    public static function num(mixed $v, string $type, array $rule, array $p, array &$issues): mixed
    {
        if (is_string($v) && is_numeric(trim($v))) {
            $v = trim($v) + 0;
        }
        if (is_bool($v) || !(is_int($v) || is_float($v))) {
            return VIssue::fail($issues, VIssue::type('number', is_string($v) ? NAN : $v, $p));
        }
        if ($type === 'int') {
            if (is_float($v) && floor($v) !== $v) {
                return VIssue::fail($issues, ['code' => 'invalid_type', 'expected' => 'integer', 'received' => 'float', 'path' => $p, 'message' => 'Expected integer, received float']);
            }
            $v = (int) $v;
        }
        if (isset($rule['min']) && $v < $rule['min']) {
            $issues[] = ['code' => 'too_small', 'minimum' => $rule['min'], 'type' => 'number', 'inclusive' => true, 'exact' => false,
                'message' => 'Number must be greater than or equal to ' . $rule['min'], 'path' => $p];
        }
        if (isset($rule['max']) && $v > $rule['max']) {
            $issues[] = ['code' => 'too_big', 'maximum' => $rule['max'], 'type' => 'number', 'inclusive' => true, 'exact' => false,
                'message' => 'Number must be less than or equal to ' . $rule['max'], 'path' => $p];
        }
        return $v;
    }

    public static function boolStrict(mixed $v, array $p, array &$issues): mixed
    {
        if (is_bool($v)) {
            return $v;
        }
        if ($v === 'true' || $v === 'false') {
            return $v === 'true';
        }
        return VIssue::fail($issues, VIssue::type('boolean', $v, $p));
    }

    public static function enum(mixed $v, array $rule, array $p, array &$issues): mixed
    {
        $values = $rule['values'] ?? [];
        if (!in_array($v, $values, true)) {
            $opts = implode(' | ', array_map(static fn($x) => "'" . $x . "'", $values));
            $received = is_scalar($v) ? (string) $v : gettype($v);
            return VIssue::fail($issues, ['received' => $received, 'code' => 'invalid_enum_value', 'options' => $values, 'path' => $p,
                'message' => "Invalid enum value. Expected $opts, received '$received'"]);
        }
        return $v;
    }
}
