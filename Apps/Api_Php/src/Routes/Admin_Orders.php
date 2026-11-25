<?php

declare(strict_types=1);

/** /api/admin/orders — every order received, newest first, and one order in full. Admin only, read-only (N-04: no statuses). */

Router::get('/admin/orders', static function (Request $req): Response {
    $in = V::parse($req->query, ['q' => ['type' => 'string', 'max' => 200, 'default' => '']] + V::PAGE);
    return Response::json(OrdersService::listForAdmin($in['q'], $in['page'], $in['pageSize']));
}, ['roles' => ['admin']]);

Router::get('/admin/orders/:id', static fn(Request $req): Response => Response::json(
    OrdersService::find((string) $req->params['id']),
), ['roles' => ['admin']]);
