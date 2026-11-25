<?php

declare(strict_types=1);

/**
 * Runs "SELECT COUNT(*) $fromWhereSql" and
 * "SELECT $select $fromWhereSql ORDER BY $orderBy LIMIT :_limit OFFSET :_offset".
 * $fromWhereSql starts with FROM. $map defaults to Row::camel.
 *
 * @return array{items:list<array>,total:int,page:int,pageSize:int}
 */
function paginate(string $fromWhereSql, array $params, string $select, string $orderBy, int $page, int $pageSize, ?callable $map = null): array
{
    $page = max(1, $page);
    $pageSize = max(1, $pageSize);
    $total = (int) Db::val('SELECT COUNT(*) ' . $fromWhereSql, $params);
    $rows = Db::all(
        'SELECT ' . $select . ' ' . $fromWhereSql . ' ORDER BY ' . $orderBy . ' LIMIT :_limit OFFSET :_offset',
        $params + ['_limit' => $pageSize, '_offset' => ($page - 1) * $pageSize],
    );
    $map ??= static fn(array $r) => Row::camel($r);
    return [
        'items' => array_values(array_map($map, $rows)),
        'total' => $total,
        'page' => $page,
        'pageSize' => $pageSize,
    ];
}
