<?php

declare(strict_types=1);

/**
 * /api/admin/discount-templates — szablony rabatów; /api/admin/customers/:id/discounts —
 * a customer's szablon and own per-product / per-category rules (Pilot_Run 2026-10-16). Admin only.
 */

Router::get('/admin/discount-templates', static fn(Request $req): Response => Response::json(
    DiscountsService::listTemplates(),
), ['roles' => ['admin']]);

Router::post('/admin/discount-templates', static fn(Request $req): Response => Response::json(
    DiscountsService::createTemplate($req, $req->body),
    201,
), ['roles' => ['admin']]);

Router::put('/admin/discount-templates/:id', static fn(Request $req): Response => Response::json(
    DiscountsService::updateTemplate($req, $req->params['id'], $req->body),
), ['roles' => ['admin']]);

Router::delete('/admin/discount-templates/:id', static function (Request $req): Response {
    DiscountsService::deleteTemplate($req, $req->params['id']);
    return Response::noContent();
}, ['roles' => ['admin']]);

Router::get('/admin/customers/:id/discounts', static fn(Request $req): Response => Response::json(
    DiscountsService::forCustomer($req->params['id']),
), ['roles' => ['admin']]);

Router::put('/admin/customers/:id/discounts', static fn(Request $req): Response => Response::json(
    DiscountsService::updateCustomer($req, $req->params['id'], $req->body),
), ['roles' => ['admin']]);
