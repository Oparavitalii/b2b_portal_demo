<?php

declare(strict_types=1);

/**
 * /api/admin/products — JSON import (R-16, R-25), the admin list and product editing
 * (Pilot_Run 2026-10-10: edit, add by hand, stock, delivery time, photo). Admin only.
 * GET /api/media/products/:file serves photos uploaded here (public, like /img/products).
 */

Router::post('/admin/products/import', static function (Request $req): Response {
    $length = (int) ($req->header('content-length') ?? 0);
    if ($length > ImportService::MAX_BYTES || strlen($req->rawBody) > ImportService::MAX_BYTES) {
        throw new ApiError(413, 'payload_too_large', ['maxBytes' => ImportService::MAX_BYTES]);
    }
    $json = $req->body;
    if (!is_array($json) && $req->rawBody !== '') {
        $json = json_decode($req->rawBody, true, 64);
    }
    if (!is_array($json)) {
        throw new ApiError(422, 'invalid_import_file', ['reason' => 'invalid_json']);
    }
    $result = ImportService::import($json);
    Audit::log($req, 'products_import', 'product', null, null, [
        'created' => $result['created'],
        'updated' => $result['updated'],
        'deactivated' => $result['deactivated'],
        'skipped' => count($result['skipped']),
    ]);
    return Response::json($result);
}, ['roles' => ['admin']]);

// Admin search + category filter (exact name, '' = all) — the list and "select all" use the same rule.
$adminFilter = [
    'q' => ['type' => 'string', 'max' => 200, 'default' => ''],
    'category' => ['type' => 'string', 'max' => 100, 'default' => ''],
];

Router::get('/admin/products', static function (Request $req) use ($adminFilter): Response {
    $in = V::parse($req->query, $adminFilter + V::PAGE);
    return Response::json(ImportService::listForAdmin($in['q'], $in['page'], $in['pageSize'], $in['category']));
}, ['roles' => ['admin']]);

// The whole catalogue as .xlsx (ProductsExport); registered before /admin/products/:sku.
Router::get('/admin/products/export', static function (Request $req): Response {
    $file = ProductsExport::xlsx();
    Audit::log($req, 'products_export', 'product', null, null, ['count' => $file['count']]);
    return Response::raw($file['bytes'], Xlsx::MIME, 200, [
        'Content-Disposition' => 'attachment; filename="' . $file['name'] . '"',
    ]);
}, ['roles' => ['admin']]);

// SKUs matching the search ("select all") and one change for many products; before /admin/products/:sku.
Router::get('/admin/products/skus', static function (Request $req) use ($adminFilter): Response {
    $in = V::parse($req->query, $adminFilter);
    return Response::json(['skus' => ImportService::skusForAdmin($in['q'], $in['category'])]);
}, ['roles' => ['admin']]);

Router::post('/admin/products/bulk', static fn(Request $req): Response => Response::json(
    AdminProducts::bulk($req, $req->body),
), ['roles' => ['admin']]);

Router::get('/admin/products/options',static fn(Request $req): Response => Response::json(AdminProducts::options()), ['roles' => ['admin']]);

Router::get('/admin/products/:sku', static fn(Request $req): Response => Response::json(
    AdminProducts::get($req->params['sku']),
), ['roles' => ['admin']]);

Router::post('/admin/products', static fn(Request $req): Response => Response::json(
    AdminProducts::create($req, $req->body),
    201,
), ['roles' => ['admin']]);

Router::patch('/admin/products/:sku', static fn(Request $req): Response => Response::json(
    AdminProducts::update($req, $req->params['sku'], $req->body),
), ['roles' => ['admin']]);

Router::post('/admin/products/:sku/image', static function (Request $req): Response {
    $length = (int) ($req->header('content-length') ?? 0);
    if ($length > ProductImages::MAX_BYTES) {
        throw new ApiError(413, 'payload_too_large', ['maxBytes' => ProductImages::MAX_BYTES]);
    }
    return Response::json(AdminProducts::setImage($req, $req->params['sku'], $req->rawBody));
}, ['roles' => ['admin']]);

Router::delete('/admin/products/:sku/image', static fn(Request $req): Response => Response::json(
    AdminProducts::removeImage($req, $req->params['sku']),
), ['roles' => ['admin']]);

Router::get('/media/products/:file', static fn(Request $req): Response => ProductImages::serve($req->params['file']), ['auth' => false]);
