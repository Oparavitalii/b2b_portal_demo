<?php

declare(strict_types=1);

/**
 * B-22 smoke: InPost ShipX shipments (R-01 – R-09). Never touches the network:
 * InpostClient::$transport is a fake ShipX that records every call.
 */
require __DIR__ . '/Harness.php';

putenv('INPOST_API_TOKEN=test_shipx_token_value');
putenv('INPOST_ORG_ID=4242');
putenv('INPOST_GEOWIDGET_TOKEN=test_geowidget_token');
putenv('INPOST_API_URL');
putenv('INPOST_COURIER_SENDING_METHOD');
ShipmentsService::$sleep = static function (int $s): void {
};

t_reset();

// ---------- fake ShipX ----------
$GLOBALS['fx'] = [
    'calls' => [],      // [method, path, query, body]
    'next' => 900,      // next ShipX id
    'ship' => [],       // inpostId => [status, tracking, getsUntilConfirmed]
    'failCreate' => null,
];

$json = static fn(int $status, array $data): array => [$status, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)];

InpostClient::$transport = static function (string $method, string $url, ?array $body) use ($json): array {
    $fx = &$GLOBALS['fx'];
    $parts = parse_url($url);
    $path = (string) ($parts['path'] ?? '');
    parse_str((string) ($parts['query'] ?? ''), $query);
    $fx['calls'][] = ['method' => $method, 'url' => $url, 'path' => $path, 'query' => $query, 'body' => $body];

    if ($method === 'POST' && $path === '/v1/organizations/4242/shipments') {
        if ($fx['failCreate'] !== null) {
            return $json($fx['failCreate'], ['status' => $fx['failCreate'], 'error' => 'validation_failed',
                'message' => 'There are some validation errors.', 'details' => ['receiver' => [['phone' => ['invalid']]]]]);
        }
        $id = $fx['next']++;
        $fx['ship'][$id] = ['status' => 'created', 'tracking' => null, 'getsUntilConfirmed' => array_key_exists('confirmAfter', $fx) ? $fx['confirmAfter'] : 2];
        return $json(201, ['id' => $id, 'status' => 'created', 'tracking_number' => null, 'service' => $body['service'] ?? null]);
    }
    if ($method === 'GET' && preg_match('#^/v1/shipments/(\d+)$#', $path, $m) === 1) {
        $id = (int) $m[1];
        if (!isset($fx['ship'][$id])) {
            return $json(404, ['status' => 404, 'error' => 'resource_not_found', 'message' => 'Not found']);
        }
        $s = &$fx['ship'][$id];
        if ($s['status'] === 'created' && $s['getsUntilConfirmed'] !== null) {
            $s['getsUntilConfirmed']--;
            if ($s['getsUntilConfirmed'] <= 0) {
                $s['status'] = 'confirmed';
                $s['tracking'] = '6200' . str_pad((string) $id, 20, '0', STR_PAD_LEFT);
            }
        }
        return $json(200, ['id' => $id, 'status' => $s['status'], 'tracking_number' => $s['tracking']]);
    }
    if ($method === 'GET' && preg_match('#^/v1/shipments/(\d+)/label$#', $path) === 1) {
        return [200, "%PDF-1.4\n% fake A6 label\n%%EOF"];
    }
    if ($method === 'GET' && $path === '/v1/points') {
        $items = [];
        $items[] = ['name' => 'WRO01BROKEN', 'status' => 'NonOperating', 'functions' => ['parcel_collect'], 'distance' => 10, 'address' => ['line1' => 'x', 'line2' => 'y']];
        $items[] = ['name' => 'WRO02SEND', 'status' => 'Operating', 'functions' => ['parcel_send'], 'distance' => 20, 'address' => ['line1' => 'x', 'line2' => 'y']];
        for ($i = 1; $i <= 7; $i++) {
            $items[] = ['name' => 'WRO1' . $i . 'M', 'status' => 'Operating', 'functions' => ['parcel_collect', 'parcel_send'],
                'distance' => 100.4 * $i, 'location_description' => $i === 1 ? 'Przy sklepie' : '',
                'address' => ['line1' => 'Buforowa ' . $i, 'line2' => '52-131 Wrocław'], 'location_247' => $i % 2 === 1];
        }
        return $json(200, ['items' => $items]);
    }
    if ($method === 'GET' && preg_match('#^/v1/points/([A-Z0-9-]+)$#', $path, $m) === 1) {
        if ($m[1] === 'WRO115M') {
            return $json(200, ['name' => 'WRO115M', 'status' => 'Operating', 'functions' => ['parcel_collect'],
                'address' => ['line1' => 'Buforowa 5', 'line2' => '52-131 Wrocław'], 'location_description' => 'Stacja paliw', 'location247' => true]);
        }
        // Live ShipX answers an unknown code with HTTP 200 and a 404 body (seen 2026-10-14).
        return $json(200, ['status' => 404, 'key' => 'point_not_found', 'error' => 'Point not found.']);
    }
    if ($method === 'GET' && preg_match('#^/v1/tracking/(\w+)$#', $path, $m) === 1) {
        foreach ($fx['ship'] as $s) {
            if ($s['tracking'] === $m[1]) {
                return $json(200, ['status' => $s['status'], 'tracking_details' => [
                    ['status' => $s['status'], 'origin_status' => 'X', 'datetime' => '2026-10-14T12:00:00.000+02:00'],
                    ['status' => 'confirmed', 'origin_status' => 'Y', 'datetime' => '2026-10-14T09:00:00.000+02:00'],
                ]]);
            }
        }
        return $json(404, ['status' => 404, 'error' => 'resource_not_found']);
    }
    return $json(500, ['status' => 500, 'error' => 'unexpected', 'message' => "fake: $method $path"]);
};
$calls = static fn(): int => count($GLOBALS['fx']['calls']);
$lastCall = static fn(): array => $GLOBALS['fx']['calls'][count($GLOBALS['fx']['calls']) - 1];

// ---------- users + one order of customer A ----------
$admin = t_user('admin');
$adminTok = t_token($admin);
$custA = t_user('customer', ['email' => 'klient.a@example.com', 'contact_name' => 'Anna Nowak', 'phone' => '+48 500 100 200']);
$tokA = t_token($custA);
$custB = t_user('customer', ['email' => 'klient.b@example.com']);
$tokB = t_token($custB);

$orderId = uuid4();
Db::insert('orders', [
    'id' => $orderId,
    'number' => 'CDM-2026-0001',
    'user_id' => $custA['id'],
    'customer_snapshot' => ['companyName' => 'Firma A', 'nip' => '1234567890', 'contactName' => 'Anna Nowak', 'phone' => '+48 500 100 200', 'email' => 'klient.a@example.com'],
    'address_snapshot' => ['companyName' => 'Firma A', 'street' => 'ul. Buforowa 5/2', 'postalCode' => '52-131', 'city' => 'Wrocław', 'country' => 'Polska', 'phone' => null],
    'discount_percent' => 0,
    'total_net' => 1000,
    'total_gross' => 1230,
    'total_deposit' => 0,
    'created_at' => now_iso(),
]);
Db::insert('order_items', ['id' => uuid4(), 'order_id' => $orderId, 'sku' => 'X-1', 'name' => 'Pompa', 'variant' => null, 'qty' => 1,
    'unit_net' => 1000, 'unit_gross' => 1230, 'unit_deposit' => 0, 'price_on_request' => 0]);
$shipCount = static fn(): int => (int) Db::val('SELECT COUNT(*) FROM shipments');

// ---------- access (R-08) ----------
t_ok(t_call('GET', '/api/admin/inpost/config')['status'] === 401, 'guest GET /admin/inpost/config → 401');
$r = t_call('GET', '/api/admin/inpost/config', null, $tokA);
t_ok($r['status'] === 403 && !str_contains($r['body'], 'test_geowidget_token'), 'customer GET /admin/inpost/config → 403, no geowidget token');
t_ok(t_call('GET', '/api/admin/inpost/points?postCode=52-131', null, $tokA)['status'] === 403, 'customer GET /admin/inpost/points → 403');
t_ok(t_call('GET', '/api/admin/inpost/points/WRO115M', null, $tokA)['status'] === 403, 'customer GET /admin/inpost/points/:name → 403');
t_ok(t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'locker'], $tokA)['status'] === 403, 'customer POST /admin/orders/:id/shipments → 403');
t_ok(t_call('GET', "/api/admin/orders/$orderId/shipping", null, $tokA)['status'] === 403, 'customer GET /admin/orders/:id/shipping → 403');
t_ok($calls() === 0, 'refused requests never reach InPost');
$r = t_call('GET', '/api/admin/inpost/config', null, $adminTok);
t_ok($r['status'] === 200 && $r['json'] === ['geowidgetToken' => 'test_geowidget_token'], 'admin GET /admin/inpost/config → {geowidgetToken}');
t_ok(!str_contains($r['body'], 'test_shipx_token_value'), 'config never contains the ShipX token');

// ---------- points (R-05) ----------
$r = t_call('GET', '/api/admin/inpost/points?postCode=52131', null, $adminTok);
$c = $lastCall();
t_ok($r['status'] === 200 && count($r['json']['items']) === 5 && $r['json']['items'][0]['name'] === 'WRO11M',
    'points → 5 nearest, NonOperating and send-only points filtered out');
t_ok($c['url'] === InpostClient::DEFAULT_URL . $c['path'] . '?' . parse_url($c['url'], PHP_URL_QUERY)
    && $c['query']['relative_post_code'] === '52-131' && $c['query']['type'] === 'parcel_locker'
    && $c['query']['sort_by'] === 'distance_to_relative_point', 'points query: production URL, normalised post code, sorted by distance');
t_ok($r['json']['items'][0] === ['name' => 'WRO11M', 'line1' => 'Buforowa 1', 'line2' => '52-131 Wrocław', 'description' => 'Przy sklepie', 'distanceM' => 100, 'open247' => true]
    && $r['json']['items'][1]['description'] === null && $r['json']['items'][1]['open247'] === false, 'Point shape');
$r = t_call('GET', '/api/admin/inpost/points?postCode=abc', null, $adminTok);
t_ok($r['status'] === 422 && $r['json']['error'] === 'invalid_post_code', 'bad post code → 422');
$r = t_call('GET', '/api/admin/inpost/points/wro115m', null, $adminTok);
t_ok($r['status'] === 200 && $r['json']['name'] === 'WRO115M' && $r['json']['open247'] === true && $r['json']['description'] === 'Stacja paliw', 'point by code (case-insensitive)');
t_ok(t_call('GET', '/api/admin/inpost/points/NOPE01', null, $adminTok)['status'] === 404, 'unknown point code → 404');

// ---------- shipping info ----------
$r = t_call('GET', "/api/admin/orders/$orderId/shipping", null, $adminTok);
$rcv = $r['json']['receiver'] ?? [];
t_ok($r['status'] === 200 && $r['json']['shipments'] === [] && count($r['json']['suggestedPoints']) === 5 && $r['json']['postCode'] === '52-131',
    'GET /admin/orders/:id/shipping → no shipments, 5 suggested lockers, post code');
t_ok($rcv === ['companyName' => 'Firma A', 'firstName' => 'Anna', 'lastName' => 'Nowak', 'email' => 'klient.a@example.com', 'phone' => '500100200',
    'street' => 'ul. Buforowa', 'buildingNumber' => '5/2', 'city' => 'Wrocław', 'postCode' => '52-131'], 'receiver prefilled from the order (phone 9 digits, street split)');
t_ok(t_call('GET', '/api/admin/orders/' . uuid4() . '/shipping', null, $adminTok)['status'] === 404, 'shipping of unknown order → 404');

$receiver = $rcv;

// ---------- missing token → 503 (R-08) ----------
putenv('INPOST_API_TOKEN');
$n = $calls();
$r = t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'locker', 'targetPoint' => 'WRO115M', 'receiver' => $receiver], $adminTok);
t_ok($r['status'] === 503 && $r['json']['error'] === 'inpost_not_configured' && $calls() === $n && $shipCount() === 0,
    'no INPOST_API_TOKEN → 503 inpost_not_configured, no call, no row');
putenv('INPOST_API_TOKEN=test_shipx_token_value');

// ---------- ShipX 4xx → 502 (R-09) ----------
$GLOBALS['fx']['failCreate'] = 400;
$r = t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'locker', 'targetPoint' => 'WRO115M', 'receiver' => $receiver], $adminTok);
t_ok($r['status'] === 502 && $r['json']['error'] === 'inpost_error' && $r['json']['meta']['status'] === 400
    && $r['json']['meta']['message'] === 'There are some validation errors.' && isset($r['json']['meta']['details']['receiver']),
    'ShipX 400 → 502 inpost_error with InPost status/message/details');
t_ok($shipCount() === 0 && (int) Db::val("SELECT COUNT(*) FROM audit_log WHERE action = 'shipment_create'") === 0, 'failed create stores no shipment and no audit row');
$GLOBALS['fx']['failCreate'] = null;

// ---------- validation ----------
$r = t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'locker', 'receiver' => $receiver], $adminTok);
t_ok($r['status'] === 422 && $r['json']['error'] === 'target_point_required', 'locker without point → 422 target_point_required');
$r = t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'locker', 'targetPoint' => 'WRO115M', 'receiver' => ['phone' => '12'] + $receiver], $adminTok);
t_ok($r['status'] === 422 && $r['json']['error'] === 'invalid_phone', 'phone not 9 digits → 422 invalid_phone');
$r = t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'courier', 'receiver' => $receiver], $adminTok);
t_ok($r['status'] === 422 && $r['json']['error'] === 'parcel_required', 'courier without parcel → 422 parcel_required');
t_ok(t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'pigeon', 'receiver' => $receiver], $adminTok)['status'] === 400, 'unknown kind → 400');
$before = $calls();
$r = t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'locker', 'targetPoint' => 'NOPE01', 'receiver' => $receiver], $adminTok);
$posted = array_filter(array_slice($GLOBALS['fx']['calls'], $before), static fn(array $c): bool => $c['method'] === 'POST');
t_ok($r['status'] === 422 && ($r['json']['error'] ?? null) === 'unknown_target_point' && $posted === [], 'unknown locker code → 422 unknown_target_point, no paid POST to InPost');
t_ok($shipCount() === 0, 'invalid requests store nothing');

// ---------- create locker that stays "created" → label 409 (R-04) ----------
$GLOBALS['fx']['confirmAfter'] = null;
$r = t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'locker', 'targetPoint' => 'WRO115M', 'size' => 'small', 'receiver' => $receiver], $adminTok);
$pending = $r['json'];
t_ok($r['status'] === 201 && $pending['status'] === 'created' && $pending['trackingNumber'] === null && $pending['labelReady'] === false
    && $pending['statusLabel'] === 'Przesyłka utworzona' && $pending['parcel'] === ['template' => 'small'],
    'create locker, offer not bought within the poll → 201 status created, no tracking, labelReady false');
$r = t_call('GET', '/api/admin/shipments/' . $pending['id'] . '/label', null, $adminTok);
t_ok($r['status'] === 409 && $r['json']['error'] === 'label_not_ready', 'label before confirmed → 409 label_not_ready');

// refresh after InPost confirmed it
$GLOBALS['fx']['ship'][900]['status'] = 'confirmed';
$GLOBALS['fx']['ship'][900]['tracking'] = '620000000000000000000900';
$r = t_call('POST', '/api/admin/shipments/' . $pending['id'] . '/refresh', null, $adminTok);
t_ok($r['status'] === 200 && $r['json']['status'] === 'confirmed' && $r['json']['trackingNumber'] === '620000000000000000000900'
    && $r['json']['labelReady'] === true && count($r['json']['events']) === 2 && $r['json']['events'][0]['statusLabel'] === 'Przygotowana przez Nadawcę'
    && $r['json']['events'][0]['at'] === '2026-10-14T10:00:00.000Z', 'POST /admin/shipments/:id/refresh → confirmed + tracking + history');
$r = t_call('GET', '/api/admin/shipments/' . $pending['id'] . '/label', null, $adminTok);
$c = $lastCall();
t_ok($r['status'] === 200 && $r['headers']['Content-Type'] === 'application/pdf' && str_starts_with($r['body'], '%PDF')
    && $c['path'] === '/v1/shipments/900/label' && $c['query'] === ['format' => 'pdf', 'type' => 'A6'], 'label → PDF A6 bytes streamed from ShipX');
t_ok(str_contains($r['headers']['Content-Disposition'] ?? '', 'etykieta_620000000000000000000900.pdf'), 'label file name carries the tracking number');

// ---------- create locker with tracking after poll (R-01, R-04) ----------
$GLOBALS['fx']['confirmAfter'] = 2;
$r = t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'locker', 'targetPoint' => 'wro115m', 'receiver' => $receiver], $adminTok);
$locker = $r['json'];
$createCall = array_values(array_filter($GLOBALS['fx']['calls'], static fn(array $c) => $c['method'] === 'POST'));
$body = $createCall[count($createCall) - 1]['body'];
t_ok($r['status'] === 201 && $locker['status'] === 'confirmed' && $locker['trackingNumber'] === '620000000000000000000901' && $locker['labelReady'] === true,
    'create locker → 201, tracking number after poll');
t_ok($body === [
    'receiver' => ['company_name' => 'Firma A', 'first_name' => 'Anna', 'last_name' => 'Nowak', 'email' => 'klient.a@example.com', 'phone' => '500100200'],
    'parcels' => ['template' => 'medium'],
    'service' => 'inpost_locker_standard',
    'custom_attributes' => ['target_point' => 'WRO115M', 'sending_method' => 'parcel_locker'],
    'reference' => 'CDM-2026-0001',
], 'locker body: simplified mode, default size B (medium), reference = order number, no sender');
t_ok($locker['kind'] === 'locker' && $locker['targetPoint'] === 'WRO115M'
    && $locker['targetPointInfo'] === ['line1' => 'Buforowa 5', 'line2' => '52-131 Wrocław', 'description' => 'Stacja paliw']
    && $locker['trackingUrl'] === 'https://inpost.pl/sledzenie-przesylek?number=620000000000000000000901', 'Shipment shape: point info + tracking URL');
t_ok(array_keys($locker) === ['id', 'service', 'kind', 'targetPoint', 'targetPointInfo', 'parcel', 'status', 'statusLabel', 'trackingNumber',
    'trackingUrl', 'labelReady', 'events', 'createdAt', 'updatedAt'], 'Shipment keys');
$audit = Db::one("SELECT * FROM audit_log WHERE action = 'shipment_create' AND entity_id = ?", [$locker['id']]);
t_ok($audit !== null && $audit['actor_id'] === $admin['id'] && !str_contains((string) $audit['new_value'], 'test_shipx_token_value'), 'audit shipment_create by the admin, no token');

// ---------- create courier (R-06-a) ----------
$r = t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'courier', 'parcel' => ['lengthMm' => 400, 'widthMm' => 300, 'heightMm' => 200, 'weightKg' => 12],
    'receiver' => ['street' => null] + $receiver], $adminTok);
t_ok($r['status'] === 422 && $r['json']['error'] === 'receiver_address_required', 'courier without street → 422 receiver_address_required');
$r = t_call('POST', "/api/admin/orders/$orderId/shipments", ['kind' => 'courier', 'parcel' => ['lengthMm' => 400, 'widthMm' => 300, 'heightMm' => 200, 'weightKg' => 12.5],
    'receiver' => $receiver], $adminTok);
$courier = $r['json'];
$createCall = array_values(array_filter($GLOBALS['fx']['calls'], static fn(array $c) => $c['method'] === 'POST'));
$body = $createCall[count($createCall) - 1]['body'];
t_ok($r['status'] === 201 && $courier['kind'] === 'courier' && $courier['service'] === 'inpost_courier_standard' && $courier['targetPoint'] === null
    && $courier['parcel'] === ['lengthMm' => 400, 'widthMm' => 300, 'heightMm' => 200, 'weightKg' => 12.5] && $courier['trackingNumber'] !== null,
    'create courier → 201 with parcel dimensions + weight');
t_ok($body['service'] === 'inpost_courier_standard'
    && $body['receiver']['address'] === ['street' => 'ul. Buforowa', 'building_number' => '5/2', 'city' => 'Wrocław', 'post_code' => '52-131', 'country_code' => 'PL']
    && $body['parcels'] === [['dimensions' => ['length' => 400, 'width' => 300, 'height' => 200, 'unit' => 'mm'], 'weight' => ['amount' => 12.5, 'unit' => 'kg']]]
    && $body['custom_attributes'] === ['sending_method' => 'dispatch_order'], 'courier body: address, dimensions mm, weight kg, sending_method');
t_ok($shipCount() === 3, 'three shipments stored for one order');

// ---------- webhook (R-07) ----------
$r = t_call('GET', '/api/inpost/webhook');
t_ok($r['status'] === 200 && $r['json'] === ['ok' => true], 'GET /inpost/webhook → 200 {ok:true} (URL validation)');
$GLOBALS['fx']['ship'][901]['status'] = 'out_for_delivery';
$r = t_call('POST', '/api/inpost/webhook', ['event' => 'shipment_status_changed', 'organization_id' => 4242,
    'payload' => ['shipment_id' => 901, 'status' => 'delivered', 'tracking_number' => 'FORGED']]);
$row = Db::one('SELECT * FROM shipments WHERE inpost_id = 901');
t_ok($r['status'] === 200 && $r['json'] === ['ok' => true] && $row['status'] === 'out_for_delivery' && $row['tracking_number'] === '620000000000000000000901',
    'webhook re-fetches from ShipX: status from our GET, forged payload status/tracking ignored');
$n = $calls();
$r = t_call('POST', '/api/inpost/webhook', ['event' => 'shipment_status_changed', 'payload' => ['shipment_id' => 123456, 'status' => 'delivered']]);
t_ok($r['status'] === 200 && $r['json'] === ['ok' => true] && $calls() === $n, 'webhook for unknown id → 200, ignored, no InPost call');
$r = t_call('POST', '/api/inpost/webhook', ['garbage' => true]);
t_ok($r['status'] === 200 && $calls() === $n, 'webhook with junk body → 200, ignored');

// ---------- customer views (R-03) ----------
$r = t_call('GET', '/api/orders', null, $tokA);
$item = $r['json']['items'][0] ?? [];
t_ok($r['status'] === 200 && ($item['shipment']['trackingNumber'] ?? null) === $courier['trackingNumber']
    && !array_key_exists('id', $item['shipment']) && !array_key_exists('parcel', $item['shipment']) && !array_key_exists('labelReady', $item['shipment']),
    'customer GET /orders → latest shipment (customer shape: no id/parcel/labelReady)');
$r = t_call('GET', "/api/orders/$orderId", null, $tokA);
t_ok($r['status'] === 200 && count($r['json']['shipments']) === 3 && $r['json']['shipments'][1]['status'] === 'out_for_delivery'
    && $r['json']['shipments'][1]['statusLabel'] === 'Przekazano do doręczenia' && !array_key_exists('id', $r['json']['shipments'][0]),
    'customer GET /orders/:id → own shipments with Polish status');
t_ok(t_call('GET', "/api/orders/$orderId", null, $tokB)['status'] === 404, 'other customer GET /orders/:id → 404');
$r = t_call('GET', '/api/orders', null, $tokB);
t_ok($r['status'] === 200 && $r['json']['items'] === [], 'other customer sees no shipments');

// ---------- refresh on view: stale > 30 min, one public tracking call ----------
Db::exec('UPDATE shipments SET checked_at = ?', [now_iso(-3600)]);
$GLOBALS['fx']['ship'][901]['status'] = 'ready_to_pickup';
$n = $calls();
$r = t_call('GET', "/api/orders/$orderId", null, $tokA);
$viewCalls = array_slice($GLOBALS['fx']['calls'], $n);
t_ok(count($viewCalls) === 1 && str_starts_with($viewCalls[0]['path'], '/v1/tracking/'), 'order view → exactly one InPost call (public tracking)');
$n = $calls();
t_call('GET', "/api/orders/$orderId", null, $tokA);
t_call('GET', "/api/orders/$orderId", null, $tokA);
t_call('GET', "/api/orders/$orderId", null, $tokA);
t_ok($calls() - $n === 2, 'each view refreshes at most one stale shipment, fresh ones are skipped');
t_ok($calls() - $n === 2 && t_call('GET', "/api/orders/$orderId", null, $tokA)['status'] === 200 && $calls() - $n === 2, 'nothing stale left → no InPost call');
$r = t_call('GET', "/api/orders/$orderId", null, $tokA);
$byTracking = array_column($r['json']['shipments'], 'status', 'trackingNumber');
t_ok($byTracking['620000000000000000000901'] === 'ready_to_pickup', 'stale refresh updated the status');
// a dead InPost does not break the page
Db::exec('UPDATE shipments SET checked_at = ?', [now_iso(-3600)]);
$saved = InpostClient::$transport;
InpostClient::$transport = static fn(string $m, string $u, ?array $b): array => [503, '{"error":"down"}'];
$r = t_call('GET', "/api/orders/$orderId", null, $tokA);
InpostClient::$transport = $saved;
t_ok($r['status'] === 200 && count($r['json']['shipments']) === 3, 'InPost down during view → order still 200 (failure swallowed)');

// ---------- admin views (R-02) ----------
$r = t_call('GET', '/api/admin/orders', null, $adminTok);
t_ok($r['status'] === 200 && ($r['json']['items'][0]['shipment']['id'] ?? null) === $courier['id'] && $r['json']['items'][0]['shipment']['labelReady'] === true,
    'admin GET /admin/orders → latest shipment with id + labelReady');
$r = t_call('GET', "/api/admin/orders/$orderId", null, $adminTok);
t_ok($r['status'] === 200 && count($r['json']['shipments']) === 3, 'admin GET /admin/orders/:id → shipments');
$r = t_call('GET', "/api/admin/orders/$orderId/shipping", null, $adminTok);
t_ok(count($r['json']['shipments']) === 3 && $r['json']['shipments'][0]['id'] === $courier['id'], 'shipping lists shipments newest first');

// ---------- cron (R-07) ----------
$GLOBALS['fx']['ship'][900]['status'] = 'delivered';
$GLOBALS['fx']['ship'][901]['status'] = 'delivered';
$res = ShipmentsService::refreshAll();
t_ok($res === ['checked' => 3, 'changed' => 2, 'failed' => 0], 'refreshAll → 3 non-final checked, 2 changed');
$res = ShipmentsService::refreshAll();
t_ok($res['checked'] === 1, 'delivered shipments are final and no longer refreshed');
t_ok(Db::val("SELECT status FROM shipments WHERE inpost_id = 900") === 'delivered', 'cron stored delivered');

// ---------- the token never leaves the backend ----------
$all = '';
foreach ([t_call('GET', "/api/admin/orders/$orderId/shipping", null, $adminTok), t_call('GET', "/api/orders/$orderId", null, $tokA),
    t_call('GET', '/api/admin/orders', null, $adminTok)] as $resp) {
    $all .= $resp['body'];
}
t_ok(!str_contains($all, 'test_shipx_token_value'), 'no API response contains the ShipX token');
t_ok(!is_file(storage_path('error.log')) || !str_contains((string) file_get_contents(storage_path('error.log')), 'test_shipx_token_value'), 'error.log has no token');
