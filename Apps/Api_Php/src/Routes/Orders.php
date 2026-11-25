<?php

declare(strict_types=1);

/**
 * /api/orders — sending the cart as an order and the customer's history
 * (R-06, R-10). Customers only; every read is limited to the caller's orders.
 */

Router::post('/orders', static function (Request $req): Response {
    RateLimit::hit($req, 'order_create', 20, 900);
    return Response::json(OrdersService::create($req, $req->body), 201);
}, ['roles' => ['customer']]);

Router::get('/orders', static fn(Request $req): Response => Response::json(
    OrdersService::list((string) $req->userId),
), ['roles' => ['customer']]);

Router::get('/orders/:id', static fn(Request $req): Response => Response::json(
    OrdersService::find((string) $req->params['id'], (string) $req->userId),
), ['roles' => ['customer']]);
