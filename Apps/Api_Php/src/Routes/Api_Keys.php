<?php

declare(strict_types=1);

/**
 * Client API keys (B-21). A customer manages their own keys in Moje konto (/me/api-keys);
 * the admin manages them for a customer (/admin/customers/:id/api-keys). The plain key is
 * in the POST response only.
 */

Router::get('/me/api-keys', static fn(Request $req): Response => Response::json(
    ApiKeysService::list((string) $req->userId),
), ['roles' => ['customer']]);

Router::post('/me/api-keys', static function (Request $req): Response {
    RateLimit::hit($req, 'api_key_create', 20, 3600);
    return Response::json(ApiKeysService::create($req, (string) $req->userId, $req->body, 'customer'), 201);
}, ['roles' => ['customer']]);

Router::delete('/me/api-keys/:keyId', static fn(Request $req): Response => Response::json(
    ApiKeysService::revoke($req, (string) $req->userId, $req->params['keyId']),
), ['roles' => ['customer']]);

Router::get('/admin/customers/:id/api-keys', static function (Request $req): Response {
    CustomersService::find($req->params['id']);
    return Response::json(ApiKeysService::list($req->params['id']));
}, ['roles' => ['admin']]);

Router::post('/admin/customers/:id/api-keys', static function (Request $req): Response {
    CustomersService::find($req->params['id']);
    return Response::json(ApiKeysService::create($req, $req->params['id'], $req->body, 'admin'), 201);
}, ['roles' => ['admin']]);

Router::delete('/admin/customers/:id/api-keys/:keyId', static function (Request $req): Response {
    CustomersService::find($req->params['id']);
    return Response::json(ApiKeysService::revoke($req, $req->params['id'], $req->params['keyId']));
}, ['roles' => ['admin']]);
