<?php

declare(strict_types=1);

/**
 * Zamówienia (R-06, R-10). An order is the customer's cart frozen at the
 * moment of sending: prices (net, gross after the discount, kaucja without
 * discount) are copied into order_items, the customer and the delivery
 * address into JSON snapshots, so the order survives later price changes and
 * the deletion of the account (user_id → NULL). No statuses, no payment, no
 * delivery choice (N-01, N-02, N-04). The only e-mail goes to the company.
 * InPost shipments (B-22) ride along: `shipments` on find(), the latest
 * `shipment` on list() / listForAdmin() (Shipments_Service.php).
 */
final class OrdersService
{
    public const CREATE_SCHEMA = [
        'note' => ['type' => 'string', 'max' => 1000, 'nullable' => true, 'emptyNull' => true, 'default' => null],
    ];

    public const NUMBER_PREFIX = 'CDM';

    /** POST /orders: cart → order in one transaction, then the company e-mail. */
    public static function create(Request $req, mixed $body): array
    {
        $in = V::parse($body, self::CREATE_SCHEMA);
        $userId = (string) $req->userId;
        $user = Db::one('SELECT * FROM users WHERE id = ?', [$userId]);
        if ($user === null) {
            throw ApiError::unauthorized();
        }
        foreach (['company_name', 'nip', 'contact_name', 'phone'] as $col) {
            if (trim((string) ($user[$col] ?? '')) === '') {
                throw new ApiError(422, 'company_data_required');
            }
        }
        $address = Db::one('SELECT company_name, street, postal_code, city, country, phone FROM addresses WHERE user_id = ?', [$userId]);
        if ($address === null) {
            throw new ApiError(422, 'address_required');
        }
        if (!OrderMail::configured()) {
            throw new ApiError(503, 'order_email_not_configured');
        }
        $policy = DiscountPolicy::forUser($user);
        $discount = $policy->base;

        $orderId = Db::tx(static function () use ($userId, $user, $address, $discount, $policy, $in): string {
            $lines = CartService::lines($userId, $policy);
            if ($lines === []) {
                throw new ApiError(422, 'cart_empty');
            }
            $totals = CartService::totals($lines);
            $id = uuid4();
            $now = now_iso();
            Db::insert('orders', [
                'id' => $id,
                'number' => self::nextNumber(substr($now, 0, 4)),
                'user_id' => $userId,
                'customer_snapshot' => [
                    'companyName' => $user['company_name'],
                    'nip' => $user['nip'],
                    'contactName' => $user['contact_name'],
                    'phone' => $user['phone'],
                    'email' => $user['email'],
                ],
                'address_snapshot' => (array) Row::camel($address),
                'discount_percent' => $discount,
                'total_net' => $totals['net'],
                'total_gross' => $totals['gross'],
                'total_deposit' => $totals['deposit'],
                'note' => $in['note'] ?? null,
                'created_at' => $now,
            ]);
            foreach ($lines as $l) {
                Db::insert('order_items', [
                    'id' => uuid4(),
                    'order_id' => $id,
                    'sku' => $l['sku'],
                    'name' => $l['name'],
                    'variant' => $l['variant'],
                    'qty' => $l['qty'],
                    'discount_percent' => $l['discountPercent'],
                    'unit_net' => $l['unitNet'],
                    'unit_gross' => $l['unitGross'],
                    'unit_deposit' => $l['unitDeposit'],
                    'price_on_request' => $l['priceOnRequest'],
                ]);
            }
            CartService::clear($userId);
            return $id;
        });

        $order = self::find($orderId, $userId);
        Audit::log($req, 'order_create', 'order', $orderId, null, ['number' => $order['number']]);
        $order['mailSent'] = OrderMail::sendToCompany($order);
        return $order;
    }

    /** GET /orders: the customer's own orders, newest first. */
    public static function list(string $userId): array
    {
        $rows = Db::all(
            'SELECT o.id, o.number, o.created_at, o.total_net, o.total_gross, o.total_deposit,
                    (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS items_count,
                    (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.price_on_request = 1) AS por_count
             FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC, o.number DESC',
            [$userId],
        );
        $shipments = ShipmentsService::latestFor(array_map(static fn(array $r): string => (string) $r['id'], $rows), true);
        return ['items' => array_map(static fn(array $r): array => self::withShipment([
            'id' => (string) $r['id'],
            'number' => (string) $r['number'],
            'createdAt' => (string) $r['created_at'],
            'totals' => self::totals($r),
            'itemsCount' => (int) $r['items_count'],
            'hasPriceOnRequest' => (int) $r['por_count'] > 0,
        ], $shipments), $rows)];
    }

    /**
     * GET /admin/orders: every order, newest first. q matches the number, the
     * company, the NIP and the e-mail from the customer snapshot.
     */
    public static function listForAdmin(string $q, int $page, int $pageSize): array
    {
        $where = 'FROM orders o';
        $params = [];
        $q = trim($q);
        if ($q !== '') {
            $where .= " WHERE ulower(o.number) LIKE :q ESCAPE '\\'"
                . " OR ulower(ifnull(json_extract(o.customer_snapshot, '\$.companyName'), '')) LIKE :q ESCAPE '\\'"
                . " OR ulower(ifnull(json_extract(o.customer_snapshot, '\$.email'), '')) LIKE :q ESCAPE '\\'"
                . " OR ifnull(json_extract(o.customer_snapshot, '\$.nip'), '') LIKE :nip ESCAPE '\\'";
            $params = ['q' => Db::like($q), 'nip' => Db::like((string) preg_replace('/\D+/', '', $q) ?: $q)];
        }
        $select = 'o.id, o.number, o.created_at, o.user_id, o.customer_snapshot, o.total_net, o.total_gross, o.total_deposit,
                   (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS items_count,
                   (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.price_on_request = 1) AS por_count';
        $result = paginate($where, $params, $select, 'o.created_at DESC, o.number DESC', $page, $pageSize,
            static fn(array $r): array => [
                'id' => (string) $r['id'],
                'number' => (string) $r['number'],
                'createdAt' => (string) $r['created_at'],
                'customer' => self::snapshot($r['customer_snapshot'], ['companyName', 'nip', 'contactName', 'phone', 'email']),
                'accountDeleted' => $r['user_id'] === null,
                'totals' => self::totals($r),
                'itemsCount' => (int) $r['items_count'],
                'hasPriceOnRequest' => (int) $r['por_count'] > 0,
            ]);
        $shipments = ShipmentsService::latestFor(array_column($result['items'], 'id'), false);
        $result['items'] = array_map(static fn(array $item): array => self::withShipment($item, $shipments), $result['items']);
        return $result;
    }

    /**
     * Adds `shipment` (latest InPost shipment) to a list row. The key is left out
     * when the order has none: the shared schema defaults it to null, and rows of
     * orders without a shipment keep their pre-B-22 shape.
     */
    private static function withShipment(array $item, array $shipments): array
    {
        if (isset($shipments[$item['id']])) {
            $item['shipment'] = $shipments[$item['id']];
        }
        return $item;
    }

    /** GET /orders/:id: full order of this customer, 404 for anyone else's. $userId null = any order (admin). */
    public static function find(string $orderId, ?string $userId = null): array
    {
        $row = $userId === null
            ? Db::one('SELECT * FROM orders WHERE id = ?', [$orderId])
            : Db::one('SELECT * FROM orders WHERE id = ? AND user_id = ?', [$orderId, $userId]);
        if ($row === null) {
            throw ApiError::notFound('order');
        }
        ShipmentsService::refreshStale($orderId);
        $orderDiscount = (float) $row['discount_percent'];
        // Lines keep the % they were priced with; orders sent before per-product rabaty carry the order's %.
        $items = array_map(static function (array $i) use ($orderDiscount): array {
            $qty = (int) $i['qty'];
            $por = (int) $i['price_on_request'] === 1;
            $unitNet = $i['unit_net'] === null ? null : (int) $i['unit_net'];
            $unitGross = $i['unit_gross'] === null ? null : (int) $i['unit_gross'];
            $unitDeposit = (int) $i['unit_deposit'];
            return [
                'id' => (string) $i['id'],
                'sku' => (string) $i['sku'],
                'name' => (string) $i['name'],
                'variant' => $i['variant'],
                'qty' => $qty,
                'discountPercent' => $i['discount_percent'] === null ? $orderDiscount : (float) $i['discount_percent'],
                'priceOnRequest' => $por,
                'unitNet' => $por ? null : $unitNet,
                'unitGross' => $por ? null : $unitGross,
                'unitDeposit' => $unitDeposit,
                'lineNet' => $por || $unitNet === null ? null : $unitNet * $qty,
                'lineGross' => $por || $unitGross === null ? null : $unitGross * $qty,
                'lineDeposit' => $unitDeposit * $qty,
            ];
        }, Db::all('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid', [$orderId]));

        return [
            'id' => (string) $row['id'],
            'number' => (string) $row['number'],
            'createdAt' => (string) $row['created_at'],
            'discountPercent' => $orderDiscount,
            // A line was priced with a % other than the customer's global one (per-product rabat).
            'productDiscounts' => array_filter($items, static fn(array $i): bool => $i['discountPercent'] !== $orderDiscount) !== [],
            'customer' => self::snapshot($row['customer_snapshot'], ['companyName', 'nip', 'contactName', 'phone', 'email']),
            'address' => self::snapshot($row['address_snapshot'], ['companyName', 'street', 'postalCode', 'city', 'country', 'phone']),
            'note' => $row['note'],
            'totals' => self::totals($row),
            'hasPriceOnRequest' => in_array(true, array_column($items, 'priceOnRequest'), true),
            'itemsCount' => count($items),
            'items' => $items,
            'shipments' => ShipmentsService::forOrder($orderId, $userId !== null),
        ];
    }

    /** Next 'CDM-YYYY-NNNN' of the year (sequential, restarts every year). Call inside a transaction. */
    public static function nextNumber(string $year): string
    {
        $prefix = self::NUMBER_PREFIX . '-' . $year . '-';
        $last = Db::val(
            'SELECT MAX(CAST(substr(number, ?) AS INTEGER)) FROM orders WHERE number LIKE ?',
            [strlen($prefix) + 1, $prefix . '%'],
        );
        return $prefix . sprintf('%04d', ((int) $last) + 1);
    }

    /** @return array{net:int,gross:int,deposit:int,grossWithDeposit:int} */
    private static function totals(array $row): array
    {
        $gross = (int) $row['total_gross'];
        $deposit = (int) $row['total_deposit'];
        return ['net' => (int) $row['total_net'], 'gross' => $gross, 'deposit' => $deposit, 'grossWithDeposit' => $gross + $deposit];
    }

    /** Decoded JSON snapshot with exactly the given keys (missing → null). */
    private static function snapshot(mixed $json, array $keys): array
    {
        $data = is_string($json) ? json_decode($json, true) : null;
        $data = is_array($data) ? $data : [];
        $out = [];
        foreach ($keys as $k) {
            $out[$k] = isset($data[$k]) ? (string) $data[$k] : null;
        }
        return $out;
    }
}

if (!class_exists('Orders_Service', false)) {
    class_alias(OrdersService::class, 'Orders_Service');
}
