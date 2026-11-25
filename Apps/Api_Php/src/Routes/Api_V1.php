<?php

declare(strict_types=1);

/**
 * /api/v1 — client API (B-21): read only, `Authorization: Bearer cdm_live_…` (ApiKeyAuth).
 * Products with the key owner's prices. No write routes live here (Pilot_Run N-01):
 * POST/PUT/PATCH/DELETE answer 405 with `Allow: GET, HEAD`.
 */

/** The OpenAPI spec, public (developers read it before they have a key). Source: templates/Openapi_V1.yaml. */
Router::get('/v1/openapi.yaml', static function (Request $req): Response {
    $yaml = file_get_contents(dirname(__DIR__, 2) . '/templates/Openapi_V1.yaml');
    if ($yaml === false) {
        throw ApiError::notFound('openapi');
    }
    return Response::raw($yaml, 'application/yaml; charset=UTF-8');
}, ['auth' => false]);

$readOnly = static fn(Request $req): Response => Response::json(
    ['error' => 'METHOD_NOT_ALLOWED'],
    405,
    ['Allow' => 'GET, HEAD'],
);
foreach (['/v1/products', '/v1/products/:sku'] as $path) {
    foreach (['post', 'put', 'patch', 'delete'] as $method) {
        Router::$method($path, $readOnly, ['auth' => false]);
    }
}

Router::get('/v1/products', static fn(Request $req): Response => Response::json(
    ApiV1Service::list($req, $req->query),
), ['auth' => 'apikey']);

Router::get('/v1/products/:sku', static function (Request $req): Response {
    $sku = trim((string) ($req->params['sku'] ?? ''));
    if ($sku === '' || mb_strlen($sku) > 100) {
        throw ApiError::notFound('product');
    }
    return Response::json(ApiV1Service::detail($req, $sku));
}, ['auth' => 'apikey']);
