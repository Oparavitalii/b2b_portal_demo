<?php

declare(strict_types=1);

/** /api/admin/customers — customer list, per-customer catalogue discount (R-02), block and delete. Admin only. */

Router::get('/admin/customers', static function (Request $req): Response {
    $in = V::parse($req->query, CustomersService::LIST_SCHEMA);
    return Response::json(CustomersService::list($in['q']));
}, ['roles' => ['admin']]);

Router::patch('/admin/customers/:id', static function (Request $req): Response {
    $in = V::parse($req->body, CustomersService::DISCOUNT_SCHEMA);
    return Response::json(CustomersService::updateDiscount($req, $req->params['id'], $in['discountPercent']));
}, ['roles' => ['admin']]);

Router::post('/admin/customers/:id/block', static fn(Request $req): Response => Response::json(
    CustomersService::setBlocked($req, $req->params['id'], true),
), ['roles' => ['admin']]);

Router::post('/admin/customers/:id/unblock', static fn(Request $req): Response => Response::json(
    CustomersService::setBlocked($req, $req->params['id'], false),
), ['roles' => ['admin']]);

Router::delete('/admin/customers/:id', static function (Request $req): Response {
    CustomersService::delete($req, $req->params['id']);
    return Response::noContent();
}, ['roles' => ['admin']]);
