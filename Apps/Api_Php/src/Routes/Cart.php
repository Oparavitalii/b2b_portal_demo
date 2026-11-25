<?php

declare(strict_types=1);

/** /api/cart — koszyk (R-05). Customers and admins; prices for the user's current discount. */

Router::get('/cart', static fn(Request $req): Response => Response::json(
    CartService::get((string) $req->userId, DiscountPolicy::forUser($req->user)),
), ['roles' => ['customer', 'admin']]);

Router::put('/cart/items', static fn(Request $req): Response => Response::json(
    CartService::putItem((string) $req->userId, DiscountPolicy::forUser($req->user), $req->body),
), ['roles' => ['customer', 'admin']]);

Router::delete('/cart', static function (Request $req): Response {
    CartService::clear((string) $req->userId);
    return Response::noContent();
}, ['roles' => ['customer', 'admin']]);
