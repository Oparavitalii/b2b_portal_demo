<?php

declare(strict_types=1);

/**
 * /api/products — the catalogue, behind login (R-17). Search by OE / SKU /
 * name (R-21), filters category + vehicle make (R-22). Prices are computed for
 * the signed-in user's discounts (DiscountPolicy: per-product %, else global %).
 */

Router::get('/products', static function (Request $req): Response {
    $in = V::parse($req->query, ProductsService::LIST_SCHEMA);
    return Response::json(ProductsService::list($in, DiscountPolicy::forUser($req->user)));
}, ['roles' => ['customer', 'admin']]);

Router::get('/products/:sku', static function (Request $req): Response {
    $sku = trim((string) ($req->params['sku'] ?? ''));
    if ($sku === '' || mb_strlen($sku) > 100) {
        throw ApiError::notFound('product');
    }
    return Response::json(ProductsService::detail($sku, DiscountPolicy::forUser($req->user)));
}, ['roles' => ['customer', 'admin']]);
