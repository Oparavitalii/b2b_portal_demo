<?php

declare(strict_types=1);

/** /api/auth/register, /api/auth/verify-email, /api/auth/resend-verification — all public (R-03, R-18). */

Router::post('/auth/register', static function (Request $req): Response {
    RateLimit::hit($req, 'register', 10, 3600);
    return Response::json(RegisterService::register($req, $req->body), 201);
}, ['auth' => false]);

Router::post('/auth/verify-email', static function (Request $req): Response {
    RateLimit::hit($req, 'verify_email', 20, 3600);
    $in = V::parse($req->body, RegisterService::VERIFY_SCHEMA);
    return Response::json(RegisterService::verify($req, $in['token']));
}, ['auth' => false]);

Router::post('/auth/resend-verification', static function (Request $req): Response {
    RateLimit::hit($req, 'resend_verification', 3, 3600);
    $in = V::parse($req->body, RegisterService::RESEND_SCHEMA);
    RegisterService::resend($req, $in['email']);
    return Response::noContent();
}, ['auth' => false]);
