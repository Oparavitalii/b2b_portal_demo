<?php

declare(strict_types=1);

/**
 * /api/admin/inpost/* and the shipment endpoints of an order (B-22: R-02, R-04,
 * R-05, R-06, R-08). Admin only. The ShipX token never leaves the backend; the
 * Geowidget token is handed to admins only.
 */

Router::get('/admin/inpost/config', static fn(Request $req): Response => Response::json(
    ShipmentsService::config(),
), ['roles' => ['admin']]);

Router::get('/admin/inpost/points', static fn(Request $req): Response => Response::json(
    ShipmentsService::points($req->query['postCode'] ?? null),
), ['roles' => ['admin']]);

Router::get('/admin/inpost/points/:name', static fn(Request $req): Response => Response::json(
    ShipmentsService::pointByName((string) $req->params['name']),
), ['roles' => ['admin']]);

Router::get('/admin/orders/:id/shipping', static fn(Request $req): Response => Response::json(
    ShipmentsService::shipping((string) $req->params['id']),
), ['roles' => ['admin']]);

Router::post('/admin/orders/:id/shipments', static fn(Request $req): Response => Response::json(
    ShipmentsService::create($req, (string) $req->params['id'], $req->body),
    201,
), ['roles' => ['admin']]);

Router::get('/admin/shipments/:id/label', static function (Request $req): Response {
    $label = ShipmentsService::label((string) $req->params['id']);
    return Response::raw($label['bytes'], 'application/pdf', 200, [
        'Content-Disposition' => 'inline; filename="' . $label['filename'] . '"',
        'Cache-Control' => 'no-store',
    ]);
}, ['roles' => ['admin']]);

Router::post('/admin/shipments/:id/refresh', static fn(Request $req): Response => Response::json(
    ShipmentsService::refresh((string) $req->params['id']),
), ['roles' => ['admin']]);
