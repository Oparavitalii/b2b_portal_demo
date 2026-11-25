<?php

declare(strict_types=1);

/** /api/me — "Moje konto": data, password, delivery address, account deletion (R-07, R-08, R-09, R-04, R-12). */

Router::get('/me', static fn(Request $req): Response => Response::json(AccountService::me($req)));

Router::patch('/me', static fn(Request $req): Response => Response::json(AccountService::updateMe($req, $req->body)));

Router::post('/me/password', static function (Request $req): Response {
    RateLimit::hit($req, 'password_change', 10, 900);
    AccountService::changePassword($req, $req->body);
    return Response::noContent();
});

Router::get('/me/address', static fn(Request $req): Response => Response::json(AccountService::address($req)));

Router::put('/me/address', static fn(Request $req): Response => Response::json(AccountService::saveAddress($req, $req->body)));

// Customers only: an admin account cannot delete itself (403 FORBIDDEN from the role guard).
Router::delete('/me', static function (Request $req): Response {
    RateLimit::hit($req, 'account_delete', 10, 900);
    AccountService::delete($req, $req->body);
    return Auth::refreshCookie(Response::noContent(), null);
}, ['roles' => ['customer']]);
