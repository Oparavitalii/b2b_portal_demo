<?php

declare(strict_types=1);

/**
 * B-22 InPost shipments (R-02 – R-07, R-09). Mirror: Packages/Shared/src/schemas/shipment.ts.
 *
 * Admin buys a ShipX shipment for an order (simplified mode, reference = order
 * number): Paczkomat (template small/medium/large + target point) or Kurier
 * (dimensions + weight + receiver address). After the create call the shipment
 * is polled ≤ 10 s for a tracking number; the label is a PDF A6 streamed from
 * ShipX. A failed create stores nothing (R-09).
 *
 * Status updates (R-07): webhook (payload never trusted, re-fetched with our
 * token), refresh of one stale shipment when an order is viewed (public
 * tracking, 5 s timeout, failures swallowed) and scripts/Inpost_Refresh.php (cron).
 */
final class ShipmentsService
{
    public const LOCKER = 'inpost_locker_standard';
    public const COURIER = 'inpost_courier_standard';

    /** Never refreshed again. Everything else (incl. pickup_time_expired) keeps refreshing. */
    public const FINAL = ['delivered', 'returned_to_sender', 'canceled', 'undelivered', 'rejected_by_receiver'];

    /** Offer not bought yet: no tracking number, no label. */
    public const PENDING = ['created', 'offers_prepared', 'offer_selected'];

    public const STALE_SECONDS = 1800;
    public const POLL_SECONDS = 10;
    public const TRACKING_URL = 'https://inpost.pl/sledzenie-przesylek?number=';

    /** Polish ShipX titles (GET /v1/statuses?lang=pl_PL), same subset as shipment.ts. */
    public const STATUS_LABELS = [
        'created' => 'Przesyłka utworzona',
        'offers_prepared' => 'Przygotowano oferty',
        'offer_selected' => 'Oferta wybrana',
        'confirmed' => 'Przygotowana przez Nadawcę',
        'dispatched_by_sender' => 'Paczka nadana w automacie Paczkomat',
        'collected_from_sender' => 'Odebrana od klienta',
        'taken_by_courier' => 'Odebrana od Nadawcy',
        'adopted_at_source_branch' => 'Przyjęta w oddziale InPost',
        'sent_from_source_branch' => 'W trasie',
        'adopted_at_sorting_center' => 'Przyjęta w Sortowni',
        'sent_from_sorting_center' => 'Wysłana z Sortowni',
        'adopted_at_target_branch' => 'Przyjęta w Oddziale Docelowym',
        'out_for_delivery' => 'Przekazano do doręczenia',
        'out_for_delivery_to_address' => 'W doręczeniu',
        'ready_to_pickup' => 'Umieszczona w automacie Paczkomat (odbiorczym)',
        'pickup_reminder_sent' => 'Przypomnienie o czekającej paczce',
        'delivered' => 'Dostarczona',
        'pickup_time_expired' => 'Upłynął termin odbioru',
        'avizo' => 'Powrót do oddziału',
        'returned_to_sender' => 'Zwrot do nadawcy',
        'canceled' => 'Anulowano etykietę',
        'undelivered' => 'Przekazanie do magazynu przesyłek niedoręczalnych',
        'rejected_by_receiver' => 'Odmowa przyjęcia',
        'delay_in_delivery' => 'Możliwe opóźnienie doręczenia',
        'ready_to_pickup_from_pok' => 'Czeka na odbiór w PaczkoPunkcie',
        'dispatched_by_sender_to_pok' => 'Nadana w PaczkoPunkcie',
        'other' => 'Inny status',
    ];

    private const POST_CODE_RE = '/^\d{2}-\d{3}$/';
    private const POINT_RE = '/^[A-Za-z0-9-]{3,32}$/';

    public const CREATE_SCHEMA = [
        'kind' => ['type' => 'enum', 'values' => ['locker', 'courier'], 'required' => true],
        'targetPoint' => ['type' => 'string', 'max' => 32, 'nullable' => true, 'emptyNull' => true, 'default' => null, 'pattern' => self::POINT_RE],
        'size' => ['type' => 'enum', 'values' => ['small', 'medium', 'large'], 'default' => 'medium'],
        'parcel' => ['type' => 'object', 'nullable' => true, 'default' => null, 'schema' => [
            'lengthMm' => ['type' => 'int', 'min' => 1, 'max' => 10000, 'required' => true],
            'widthMm' => ['type' => 'int', 'min' => 1, 'max' => 10000, 'required' => true],
            'heightMm' => ['type' => 'int', 'min' => 1, 'max' => 10000, 'required' => true],
            'weightKg' => ['type' => 'number', 'min' => 0.01, 'max' => 1000, 'required' => true],
        ]],
        'receiver' => ['type' => 'object', 'required' => true, 'schema' => [
            'companyName' => ['type' => 'string', 'max' => 100, 'nullable' => true, 'emptyNull' => true, 'default' => null],
            'firstName' => ['type' => 'string', 'min' => 1, 'max' => 60, 'required' => true],
            'lastName' => ['type' => 'string', 'min' => 1, 'max' => 60, 'required' => true],
            'email' => ['type' => 'email', 'max' => 200, 'required' => true],
            'phone' => ['type' => 'string', 'min' => 1, 'max' => 30, 'required' => true],
            'street' => ['type' => 'string', 'max' => 100, 'nullable' => true, 'emptyNull' => true, 'default' => null],
            'buildingNumber' => ['type' => 'string', 'max' => 20, 'nullable' => true, 'emptyNull' => true, 'default' => null],
            'city' => ['type' => 'string', 'max' => 100, 'nullable' => true, 'emptyNull' => true, 'default' => null],
            'postCode' => ['type' => 'string', 'max' => 10, 'nullable' => true, 'emptyNull' => true, 'default' => null],
        ]],
    ];

    /** @var null|callable(int):void Pause between polls (tests replace it with a no-op). */
    public static $sleep = null;

    // ---------------------------------------------------------------- admin reads

    /** GET /admin/inpost/config — the Geowidget token is handed to admins only (R-08). */
    public static function config(): array
    {
        return ['geowidgetToken' => env('INPOST_GEOWIDGET_TOKEN')];
    }

    /** GET /admin/inpost/points?postCode= — 5 nearest operating lockers that accept parcels for collection. */
    public static function points(mixed $postCode): array
    {
        $code = self::postCode(is_string($postCode) ? $postCode : null);
        if ($code === null) {
            throw new ApiError(422, 'invalid_post_code');
        }
        $data = InpostClient::get('/v1/points', [
            'relative_post_code' => $code,
            'sort_by' => 'distance_to_relative_point',
            'type' => 'parcel_locker',
            'per_page' => 15,
        ]);
        $out = [];
        foreach (is_array($data['items'] ?? null) ? $data['items'] : [] as $p) {
            if (!is_array($p) || ($p['status'] ?? null) !== 'Operating'
                || !in_array('parcel_collect', is_array($p['functions'] ?? null) ? $p['functions'] : [], true)) {
                continue;
            }
            $out[] = self::point($p);
            if (count($out) === 5) {
                break;
            }
        }
        return ['items' => $out];
    }

    /** GET /admin/inpost/points/:name — one point by its code (404 when InPost does not know it). */
    public static function pointByName(string $name): array
    {
        $name = strtoupper(trim($name));
        if (preg_match(self::POINT_RE, $name) !== 1) {
            throw ApiError::notFound('point');
        }
        try {
            $p = InpostClient::get('/v1/points/' . rawurlencode($name));
            // Unknown code: ShipX answers HTTP 200 with {"status":404,"key":"point_not_found"} (live, 2026-10-14).
            if (!is_string($p['name'] ?? null) || $p['name'] === '') {
                throw ApiError::notFound('point');
            }
            return self::point($p);
        } catch (ApiError $e) {
            if ($e->errorCode === 'inpost_error' && ($e->meta['status'] ?? null) === 404) {
                throw ApiError::notFound('point');
            }
            throw $e;
        }
    }

    /** GET /admin/orders/:id/shipping — shipments, suggested lockers and the receiver prefilled from the order. */
    public static function shipping(string $orderId): array
    {
        $order = self::order($orderId);
        $address = self::json($order['address_snapshot']);
        $customer = self::json($order['customer_snapshot']);
        $postCode = self::postCode(isset($address['postalCode']) ? (string) $address['postalCode'] : null);
        $suggested = [];
        if ($postCode !== null) {
            try {
                $suggested = self::points($postCode)['items'];
            } catch (ApiError) {
                $suggested = [];
            }
        }
        $contact = trim((string) ($customer['contactName'] ?? ''));
        $parts = $contact === '' ? [] : preg_split('/\s+/u', $contact, 2);
        [$street, $building] = self::splitStreet(isset($address['street']) ? (string) $address['street'] : '');
        $phoneRaw = (string) ($address['phone'] ?? '') !== '' ? (string) $address['phone'] : (string) ($customer['phone'] ?? '');
        $phone = self::phone($phoneRaw);
        $company = $customer['companyName'] ?? $address['companyName'] ?? null;
        return [
            'shipments' => self::forOrder($orderId, false),
            'suggestedPoints' => $suggested,
            'postCode' => $postCode,
            'receiver' => [
                'companyName' => $company === null || $company === '' ? null : (string) $company,
                'firstName' => (string) ($parts[0] ?? ''),
                'lastName' => (string) ($parts[1] ?? ''),
                'email' => (string) ($customer['email'] ?? ''),
                'phone' => $phone ?? (string) preg_replace('/\D+/', '', $phoneRaw),
                'street' => $street,
                'buildingNumber' => $building,
                'city' => isset($address['city']) && $address['city'] !== '' ? (string) $address['city'] : null,
                'postCode' => $postCode,
            ],
        ];
    }

    // ---------------------------------------------------------------- create / label / refresh

    /** POST /admin/orders/:id/shipments → 201 Shipment. Nothing is stored when ShipX refuses (R-09). */
    public static function create(Request $req, string $orderId, mixed $body): array
    {
        $order = self::order($orderId);
        $in = V::parse($body, self::CREATE_SCHEMA);
        $r = $in['receiver'];
        $phone = self::phone($r['phone']);
        if ($phone === null) {
            throw new ApiError(422, 'invalid_phone');
        }
        $receiver = [
            'first_name' => $r['firstName'],
            'last_name' => $r['lastName'],
            'email' => $r['email'],
            'phone' => $phone,
        ];
        if ($r['companyName'] !== null) {
            $receiver = ['company_name' => $r['companyName']] + $receiver;
        }

        if ($in['kind'] === 'locker') {
            if ($in['targetPoint'] === null) {
                throw new ApiError(422, 'target_point_required');
            }
            $target = strtoupper($in['targetPoint']);
            // Checked before the paid call: a wrong code would otherwise reach InPost.
            try {
                self::pointByName($target);
            } catch (ApiError $e) {
                if ($e->status === 404) {
                    throw new ApiError(422, 'unknown_target_point');
                }
                throw $e;
            }
            $parcel = ['template' => $in['size']];
            $payload = [
                'receiver' => $receiver,
                'parcels' => $parcel,
                'service' => self::LOCKER,
                'custom_attributes' => ['target_point' => $target, 'sending_method' => 'parcel_locker'],
                'reference' => (string) $order['number'],
            ];
        } else {
            $p = $in['parcel'];
            if ($p === null) {
                throw new ApiError(422, 'parcel_required');
            }
            $postCode = self::postCode($r['postCode']);
            if ($r['street'] === null || $r['buildingNumber'] === null || $r['city'] === null || $postCode === null) {
                throw new ApiError(422, 'receiver_address_required');
            }
            $target = null;
            $parcel = ['lengthMm' => $p['lengthMm'], 'widthMm' => $p['widthMm'], 'heightMm' => $p['heightMm'], 'weightKg' => $p['weightKg']];
            $receiver['address'] = [
                'street' => $r['street'],
                'building_number' => $r['buildingNumber'],
                'city' => $r['city'],
                'post_code' => $postCode,
                'country_code' => 'PL',
            ];
            $payload = [
                'receiver' => $receiver,
                'parcels' => [[
                    'dimensions' => ['length' => $p['lengthMm'], 'width' => $p['widthMm'], 'height' => $p['heightMm'], 'unit' => 'mm'],
                    'weight' => ['amount' => $p['weightKg'], 'unit' => 'kg'],
                ]],
                'service' => self::COURIER,
                'custom_attributes' => ['sending_method' => (string) env('INPOST_COURIER_SENDING_METHOD', 'dispatch_order')],
                'reference' => (string) $order['number'],
            ];
        }

        $created = InpostClient::post('/v1/organizations/' . rawurlencode(InpostClient::orgId()) . '/shipments', $payload);
        $inpostId = isset($created['id']) && is_numeric($created['id']) ? (int) $created['id'] : null;
        if ($inpostId === null) {
            throw new ApiError(502, 'inpost_error', ['status' => 200, 'message' => 'InPost nie zwrócił numeru przesyłki', 'details' => null]);
        }

        // From here the shipment exists at InPost: it is stored whatever the polling brings.
        $shipment = self::poll($inpostId, $created);
        $status = is_string($shipment['status'] ?? null) ? $shipment['status'] : 'created';
        $tracking = is_string($shipment['tracking_number'] ?? null) && $shipment['tracking_number'] !== '' ? $shipment['tracking_number'] : null;
        $pointInfo = $target === null ? null : self::pointInfo($target);

        $id = uuid4();
        $now = now_iso();
        Db::insert('shipments', [
            'id' => $id,
            'order_id' => $orderId,
            'inpost_id' => $inpostId,
            'service' => $payload['service'],
            'target_point' => $target,
            'target_point_info' => $pointInfo,
            'parcel' => $parcel,
            'status' => $status,
            'tracking_number' => $tracking,
            'events' => null,
            'created_by' => $req->userId,
            'created_at' => $now,
            'updated_at' => $now,
            'checked_at' => $now,
        ]);
        Audit::log($req, 'shipment_create', 'shipment', $id, null, [
            'orderId' => $orderId, 'inpostId' => $inpostId, 'service' => $payload['service'], 'targetPoint' => $target,
        ]);
        return self::present(self::row($id), false);
    }

    /** GET /admin/shipments/:id/label → PDF A6 bytes; 409 label_not_ready until the offer is bought. */
    public static function label(string $id): array
    {
        $row = self::row($id);
        if (!self::labelReady($row)) {
            throw new ApiError(409, 'label_not_ready');
        }
        $pdf = InpostClient::raw('/v1/shipments/' . (int) $row['inpost_id'] . '/label', ['format' => 'pdf', 'type' => 'A6']);
        $name = 'etykieta_' . preg_replace('/[^A-Za-z0-9]+/', '', (string) $row['tracking_number']) . '.pdf';
        return ['bytes' => $pdf, 'filename' => $name];
    }

    /** POST /admin/shipments/:id/refresh — re-fetch from ShipX now. */
    public static function refresh(string $id): array
    {
        $row = self::row($id);
        self::sync($row);
        return self::present(self::row($id), false);
    }

    // ---------------------------------------------------------------- status updates (R-07)

    /**
     * POST /inpost/webhook. The payload only names the shipment: unknown ids are
     * ignored, known ones are re-fetched with our token. Never throws.
     */
    public static function webhook(mixed $body): void
    {
        $sid = is_array($body) && is_array($body['payload'] ?? null) ? ($body['payload']['shipment_id'] ?? null) : null;
        if (!is_int($sid) && !(is_string($sid) && ctype_digit($sid))) {
            return;
        }
        $row = Db::one('SELECT * FROM shipments WHERE inpost_id = ?', [(int) $sid]);
        if ($row === null) {
            return;
        }
        try {
            self::sync($row);
        } catch (Throwable) {
            // The view refresh and the cron script catch up later.
        }
    }

    /**
     * Called when an order is viewed: at most one InPost call (public tracking,
     * 5 s timeout) for the longest-unchecked non-final shipment older than 30 min.
     * Failures are swallowed; checked_at moves on so a dead InPost does not slow every view.
     */
    public static function refreshStale(string $orderId): void
    {
        $final = implode(', ', array_map(static fn(string $s) => "'" . $s . "'", self::FINAL));
        $row = Db::one(
            "SELECT * FROM shipments WHERE order_id = ? AND tracking_number IS NOT NULL AND status NOT IN ($final)
             AND checked_at < ? ORDER BY checked_at LIMIT 1",
            [$orderId, now_iso(-self::STALE_SECONDS)],
        );
        if ($row === null) {
            return;
        }
        try {
            $t = InpostClient::withTimeout(5, static fn() => InpostClient::getPublic('/v1/tracking/' . rawurlencode((string) $row['tracking_number'])));
            $status = is_string($t['status'] ?? null) && $t['status'] !== '' ? $t['status'] : (string) $row['status'];
            self::apply($row, $status, (string) $row['tracking_number'], self::events($t));
        } catch (Throwable) {
            Db::update('shipments', ['checked_at' => now_iso()], ['id' => $row['id']]);
        }
    }

    /** Cron (scripts/Inpost_Refresh.php): every non-final shipment, longest-unchecked first. */
    public static function refreshAll(): array
    {
        $final = implode(', ', array_map(static fn(string $s) => "'" . $s . "'", self::FINAL));
        $rows = Db::all("SELECT * FROM shipments WHERE status NOT IN ($final) ORDER BY checked_at");
        $out = ['checked' => 0, 'changed' => 0, 'failed' => 0];
        foreach ($rows as $row) {
            $out['checked']++;
            try {
                if (self::sync($row)) {
                    $out['changed']++;
                }
            } catch (Throwable) {
                $out['failed']++;
            }
        }
        return $out;
    }

    /** GET /v1/shipments/{id} with our token (+ public tracking for the history). Returns true when status/tracking changed. */
    public static function sync(array $row): bool
    {
        $s = InpostClient::get('/v1/shipments/' . (int) $row['inpost_id']);
        $status = is_string($s['status'] ?? null) && $s['status'] !== '' ? $s['status'] : (string) $row['status'];
        $tracking = is_string($s['tracking_number'] ?? null) && $s['tracking_number'] !== '' ? $s['tracking_number'] : $row['tracking_number'];
        $events = null;
        if ($tracking !== null) {
            try {
                $events = self::events(InpostClient::getPublic('/v1/tracking/' . rawurlencode((string) $tracking)));
            } catch (ApiError) {
                $events = null;
            }
        }
        return self::apply($row, $status, $tracking === null ? null : (string) $tracking, $events);
    }

    // ---------------------------------------------------------------- order pages (R-02, R-03)

    /** Shipments of one order, newest first. $customer = the customer shape (no id, parcel, labelReady). */
    public static function forOrder(string $orderId, bool $customer): array
    {
        $rows = Db::all('SELECT * FROM shipments WHERE order_id = ? ORDER BY created_at DESC, rowid DESC', [$orderId]);
        return array_map(static fn(array $r): array => self::present($r, $customer), $rows);
    }

    /** @param list<string> $orderIds @return array<string,array> latest shipment per order id (orders without one are absent) */
    public static function latestFor(array $orderIds, bool $customer): array
    {
        if ($orderIds === []) {
            return [];
        }
        $marks = implode(', ', array_fill(0, count($orderIds), '?'));
        $rows = Db::all("SELECT * FROM shipments WHERE order_id IN ($marks) ORDER BY created_at DESC, rowid DESC", array_values($orderIds));
        $out = [];
        foreach ($rows as $r) {
            $oid = (string) $r['order_id'];
            if (!isset($out[$oid])) {
                $out[$oid] = self::present($r, $customer);
            }
        }
        return $out;
    }

    public static function statusLabel(string $status): string
    {
        return self::STATUS_LABELS[$status] ?? $status;
    }

    // ---------------------------------------------------------------- internals

    private static function present(array $r, bool $customer): array
    {
        $tracking = $r['tracking_number'] === null ? null : (string) $r['tracking_number'];
        $info = $r['target_point_info'] === null ? null : self::json($r['target_point_info']);
        $events = array_map(static fn(array $e): array => [
            'status' => (string) ($e['status'] ?? ''),
            'statusLabel' => self::statusLabel((string) ($e['status'] ?? '')),
            'at' => (string) ($e['at'] ?? ''),
        ], array_values(array_filter(self::json($r['events']), 'is_array')));
        $out = [
            'id' => (string) $r['id'],
            'service' => (string) $r['service'],
            'kind' => $r['service'] === self::COURIER ? 'courier' : 'locker',
            'targetPoint' => $r['target_point'] === null ? null : (string) $r['target_point'],
            'targetPointInfo' => $info === null ? null : [
                'line1' => (string) ($info['line1'] ?? ''),
                'line2' => (string) ($info['line2'] ?? ''),
                'description' => isset($info['description']) && $info['description'] !== '' ? (string) $info['description'] : null,
            ],
            'parcel' => self::json($r['parcel']),
            'status' => (string) $r['status'],
            'statusLabel' => self::statusLabel((string) $r['status']),
            'trackingNumber' => $tracking,
            'trackingUrl' => $tracking === null ? null : self::TRACKING_URL . rawurlencode($tracking),
            'labelReady' => self::labelReady($r),
            'events' => $events,
            'createdAt' => (string) $r['created_at'],
            'updatedAt' => (string) $r['updated_at'],
        ];
        if ($customer) {
            unset($out['id'], $out['parcel'], $out['labelReady']);
        }
        return $out;
    }

    private static function labelReady(array $row): bool
    {
        return $row['tracking_number'] !== null && !in_array($row['status'], self::PENDING, true) && $row['status'] !== 'canceled';
    }

    /** Polls GET /v1/shipments/{id} (1 s steps, ≤ 10 s) until the offer is bought and a tracking number exists. */
    private static function poll(int $inpostId, array $shipment): array
    {
        $sleep = self::$sleep ?? static function (int $s): void {
            sleep($s);
        };
        for ($i = 0; $i < self::POLL_SECONDS; $i++) {
            $status = $shipment['status'] ?? 'created';
            if (!in_array($status, self::PENDING, true) && is_string($shipment['tracking_number'] ?? null) && $shipment['tracking_number'] !== '') {
                break;
            }
            $sleep(1);
            try {
                $shipment = InpostClient::get('/v1/shipments/' . $inpostId);
            } catch (ApiError) {
                break;
            }
        }
        return $shipment;
    }

    /** Address of the target locker for the shipment card; null when InPost cannot tell. */
    private static function pointInfo(string $name): ?array
    {
        try {
            $p = self::pointByName($name);
        } catch (ApiError) {
            return null;
        }
        return ['line1' => $p['line1'], 'line2' => $p['line2'], 'description' => $p['description']];
    }

    /** Stores a fresh status. updated_at moves only when something changed; checked_at always. */
    private static function apply(array $row, string $status, ?string $tracking, ?array $events): bool
    {
        $now = now_iso();
        $changed = $status !== $row['status'] || ($tracking !== null && $tracking !== $row['tracking_number']);
        $set = ['status' => $status, 'checked_at' => $now];
        if ($tracking !== null) {
            $set['tracking_number'] = $tracking;
        }
        if ($events !== null) {
            $set['events'] = $events;
        }
        if ($changed) {
            $set['updated_at'] = $now;
        }
        Db::update('shipments', $set, ['id' => $row['id']]);
        return $changed;
    }

    /** tracking_details [{status, origin_status, datetime}] (newest first) → [{status, at}]. */
    private static function events(array $tracking): array
    {
        $out = [];
        foreach (is_array($tracking['tracking_details'] ?? null) ? $tracking['tracking_details'] : [] as $d) {
            if (!is_array($d) || !is_string($d['status'] ?? null)) {
                continue;
            }
            $at = is_string($d['datetime'] ?? null) ? (to_iso($d['datetime']) ?? $d['datetime']) : '';
            $out[] = ['status' => $d['status'], 'at' => $at];
        }
        return $out;
    }

    /** ShipX point → Point. */
    private static function point(array $p): array
    {
        $addr = is_array($p['address'] ?? null) ? $p['address'] : [];
        $desc = $p['location_description'] ?? null;
        $dist = $p['distance'] ?? null;
        return [
            'name' => (string) ($p['name'] ?? ''),
            'line1' => (string) ($addr['line1'] ?? ''),
            'line2' => (string) ($addr['line2'] ?? ''),
            'description' => is_string($desc) && trim($desc) !== '' ? trim($desc) : null,
            'distanceM' => is_numeric($dist) ? (int) round((float) $dist) : null,
            'open247' => (bool) ($p['location_247'] ?? $p['location247'] ?? false),
        ];
    }

    private static function order(string $orderId): array
    {
        $order = Db::one('SELECT * FROM orders WHERE id = ?', [$orderId]);
        if ($order === null) {
            throw ApiError::notFound('order');
        }
        return $order;
    }

    private static function row(string $id): array
    {
        $row = Db::one('SELECT * FROM shipments WHERE id = ?', [$id]);
        if ($row === null) {
            throw ApiError::notFound('shipment');
        }
        return $row;
    }

    /** '52131' / '52-131' → '52-131'; anything else → null. */
    private static function postCode(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $v = trim($value);
        if (preg_match('/^\d{5}$/', $v) === 1) {
            $v = substr($v, 0, 2) . '-' . substr($v, 2);
        }
        return preg_match(self::POST_CODE_RE, $v) === 1 ? $v : null;
    }

    /** '+48 500 000 000' → '500000000'; null unless exactly 9 digits remain. */
    private static function phone(string $value): ?string
    {
        $d = (string) preg_replace('/\D+/', '', $value);
        if (strlen($d) === 11 && str_starts_with($d, '48')) {
            $d = substr($d, 2);
        } elseif (strlen($d) === 13 && str_starts_with($d, '0048')) {
            $d = substr($d, 4);
        }
        return strlen($d) === 9 ? $d : null;
    }

    /** 'ul. Buforowa 5/2' → ['ul. Buforowa', '5/2']; no number → [street, null]. @return array{0:?string,1:?string} */
    private static function splitStreet(string $value): array
    {
        $v = trim($value);
        if ($v === '') {
            return [null, null];
        }
        if (preg_match('/^(.*?)[\s,]+(\d+[A-Za-z]?(?:\s*[\/-]\s*\d+[A-Za-z]?)?)$/u', $v, $m) === 1 && trim($m[1]) !== '') {
            return [trim($m[1]), preg_replace('/\s+/', '', $m[2])];
        }
        return [$v, null];
    }

    private static function json(mixed $value): array
    {
        $d = is_string($value) ? json_decode($value, true) : $value;
        return is_array($d) ? $d : [];
    }
}

if (!class_exists('Shipments_Service', false)) {
    class_alias(ShipmentsService::class, 'Shipments_Service');
}
