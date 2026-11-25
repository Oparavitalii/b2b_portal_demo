<?php

declare(strict_types=1);

/**
 * /api/inpost/webhook (B-22, R-07). InPost validates the URL with a GET and
 * posts status changes. No signature exists and the API sits behind a proxy,
 * so the payload is never trusted: only the shipment id is read, our row is
 * looked up and re-fetched from ShipX with our token. Always 200 {ok:true}.
 */

Router::get('/inpost/webhook', static fn(Request $req): Response => Response::json(['ok' => true]), ['auth' => false]);

Router::post('/inpost/webhook', static function (Request $req): Response {
    RateLimit::hit($req, 'inpost_webhook', 300, 60);
    ShipmentsService::webhook($req->body);
    return Response::json(['ok' => true]);
}, ['auth' => false]);
