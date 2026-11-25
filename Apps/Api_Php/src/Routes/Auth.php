<?php

declare(strict_types=1);

/** /api/auth/* — login, refresh, logout, password reset. Registration and e-mail confirmation: Routes/Register.php. */

Router::post('/auth/login', static function (Request $req): Response {
    // Only wrong passwords count (20 per 15 min per IP); a correct login never waits.
    RateLimit::full($req, 'login_failed', 20, 900);
    $in = V::parse($req->body, AuthService::LOGIN_SCHEMA);
    try {
        $result = AuthService::login($req, $in['email'], $in['password']);
    } catch (ApiError $e) {
        if ($e->errorCode === 'INVALID_CREDENTIALS') {
            RateLimit::hit($req, 'login_failed', 20, 900);
        }
        throw $e;
    }
    return Auth::refreshCookie(
        Response::json(['user' => $result['user'], 'accessToken' => $result['accessToken']]),
        $result['refreshToken'],
    );
}, ['auth' => false]);

Router::post('/auth/refresh', static function (Request $req): Response {
    $token = $req->cookies[Auth::REFRESH_COOKIE] ?? '';
    if (!is_string($token) || $token === '') {
        throw ApiError::unauthorized();
    }
    $result = SessionRotation::refresh($req, $token);
    $res = Response::json(['accessToken' => $result['accessToken']]);
    return $result['refreshToken'] !== null ? Auth::refreshCookie($res, $result['refreshToken']) : $res;
}, ['auth' => false]);

Router::post('/auth/logout', static function (Request $req): Response {
    SessionRotation::logout($req);
    return Auth::refreshCookie(Response::noContent(), null);
});

Router::post('/auth/password-reset/request', static function (Request $req): Response {
    RateLimit::hit($req, 'password_reset', 5, 3600);
    $in = V::parse($req->body, AuthService::RESET_REQUEST_SCHEMA);
    PasswordReset::request($req, $in['email']);
    return Response::noContent();
}, ['auth' => false]);

Router::post('/auth/password-reset/confirm', static function (Request $req): Response {
    RateLimit::hit($req, 'password_reset', 5, 3600);
    $in = V::parse($req->body, AuthService::RESET_CONFIRM_SCHEMA);
    PasswordReset::confirm($req, $in['token'], $in['password']);
    return Response::noContent();
}, ['auth' => false]);
