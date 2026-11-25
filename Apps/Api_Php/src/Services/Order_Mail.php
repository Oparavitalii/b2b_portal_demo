<?php

declare(strict_types=1);

/**
 * The one order e-mail (R-06): the full order goes to the company inbox
 * ORDER_EMAIL. Nothing is ever sent to the customer (N-04).
 *
 * Orders_Service checks configured() BEFORE saving an order, so a missing
 * recipient never produces an order that silently reaches nobody (503).
 * A delivery failure after the commit (SMTP down) must not turn a saved order
 * into an error the customer would "fix" by ordering twice — it is written to
 * storage/error.log with the order number, sendToCompany() returns false and
 * the API reports mailSent=false so the customer is told to call DEMO PARTS.
 */
final class OrderMail
{
    /** Local-only recipient used with MAIL_DRIVER=log, where nothing leaves the machine. */
    public const DEV_RECIPIENT = 'zamowienia@catalog-demo.local';

    /** ORDER_EMAIL, or the dev recipient when mail only goes to storage/mail.log. */
    public static function recipient(): ?string
    {
        $to = env('ORDER_EMAIL');
        if ($to === null && env('MAIL_DRIVER', 'log') === 'log') {
            $to = self::DEV_RECIPIENT;
        }
        return $to !== null && filter_var($to, FILTER_VALIDATE_EMAIL) !== false ? $to : null;
    }

    public static function configured(): bool
    {
        return self::recipient() !== null;
    }

    public static function sendToCompany(array $order): bool
    {
        try {
            $to = self::recipient();
            if ($to === null) {
                throw new RuntimeException('ORDER_EMAIL is not set to a valid address');
            }
            Mail::send($to, self::subject($order), Mail::render('order_company', ['order' => $order]), self::text($order));
            return true;
        } catch (Throwable $e) {
            @file_put_contents(
                storage_path('error.log'),
                gmdate('c') . ' order mail NOT sent for ' . ($order['number'] ?? '?') . ': ' . get_class($e) . ': ' . $e->getMessage() . "\n",
                FILE_APPEND | LOCK_EX,
            );
            return false;
        }
    }

    public static function subject(array $order): string
    {
        $company = trim((string) ($order['customer']['companyName'] ?? ''));
        return 'Nowe zamówienie ' . $order['number'] . ($company !== '' ? ' — ' . $company : '');
    }

    /** 123456 grosze → '1 234,56 zł'. */
    public static function money(?int $grosze): string
    {
        if ($grosze === null) {
            return 'Cena na zapytanie';
        }
        $sign = $grosze < 0 ? '-' : '';
        return $sign . number_format(abs($grosze) / 100, 2, ',', ' ') . ' zł';
    }

    public static function variantLabel(?string $variant): string
    {
        return match ($variant) {
            'oryginalne' => 'Oryginalne',
            'zamienne' => 'Zamienne',
            default => '—',
        };
    }

    /** 'Y-m-d\TH:i:s.v\Z' (UTC) → 'dd.mm.rrrr, gg:mm' in Polish time. */
    public static function date(string $iso): string
    {
        try {
            $d = new DateTimeImmutable($iso, new DateTimeZone('UTC'));
            return $d->setTimezone(new DateTimeZone('Europe/Warsaw'))->format('d.m.Y, H:i');
        } catch (Exception) {
            return $iso;
        }
    }

    public static function percent(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, ',', ''), '0'), ',') . '%';
    }

    /** Plain-text alternative of the HTML mail (same content, one item per block). */
    public static function text(array $order): string
    {
        $c = $order['customer'];
        $a = $order['address'];
        $t = $order['totals'];
        $out = [
            'DEMO PARTS — Katalog B2B',
            'Nowe zamówienie ' . $order['number'] . ' z ' . self::date($order['createdAt']),
            '',
            'KLIENT',
            'Firma: ' . ($c['companyName'] ?? '—'),
            'NIP: ' . ($c['nip'] ?? '—'),
            'Osoba kontaktowa: ' . ($c['contactName'] ?? '—'),
            'E-mail: ' . ($c['email'] ?? '—'),
            'Telefon: ' . ($c['phone'] ?? '—'),
            '',
            'ADRES DOSTAWY',
            (string) ($a['companyName'] ?? ''),
            (string) ($a['street'] ?? ''),
            trim(($a['postalCode'] ?? '') . ' ' . ($a['city'] ?? '')),
            (string) ($a['country'] ?? ''),
        ];
        if (($a['phone'] ?? null) !== null) {
            $out[] = 'Tel.: ' . $a['phone'];
        }
        $out[] = '';
        $perLine = !empty($order['productDiscounts']);
        $out[] = $perLine
            ? 'Rabat klienta: wg pozycji (rabaty produktowe; nie obejmuje kaucji)'
            : 'Rabat klienta: ' . self::percent((float) $order['discountPercent']) . ' (nie obejmuje kaucji)';
        $out[] = '';
        $out[] = 'POZYCJE';
        foreach ($order['items'] as $n => $i) {
            $out[] = ($n + 1) . '. ' . $i['name'];
            $out[] = '   SKU: ' . $i['sku'] . ' | Wersja: ' . self::variantLabel($i['variant']) . ' | Ilość: ' . $i['qty']
                . ($perLine ? ' | Rabat: ' . self::percent((float) $i['discountPercent']) : '');
            if ($i['priceOnRequest']) {
                $out[] = '   Cena na zapytanie | Kaucja: ' . self::money($i['unitDeposit']) . ' / szt.';
            } else {
                $out[] = '   Cena netto: ' . self::money($i['unitNet']) . ' | Cena brutto: ' . self::money($i['unitGross'])
                    . ' | Kaucja: ' . self::money($i['unitDeposit']);
                $out[] = '   Wartość netto: ' . self::money($i['lineNet']) . ' | Wartość brutto: ' . self::money($i['lineGross'])
                    . ' | Kaucja razem: ' . self::money($i['lineDeposit']);
            }
        }
        $out[] = '';
        $out[] = 'PODSUMOWANIE';
        $out[] = 'Razem netto: ' . self::money($t['net']);
        $out[] = 'Razem brutto: ' . self::money($t['gross']);
        $out[] = 'Kaucja (VAT 0%): ' . self::money($t['deposit']);
        $out[] = 'Razem do zapłaty (brutto + kaucja): ' . self::money($t['grossWithDeposit']);
        if ($order['hasPriceOnRequest']) {
            $out[] = 'Pozycje "Cena na zapytanie" nie są wliczone do sum — cenę trzeba ustalić z klientem.';
        }
        $out[] = '';
        $out[] = 'UWAGI KLIENTA';
        $out[] = trim((string) ($order['note'] ?? '')) !== '' ? (string) $order['note'] : 'Brak uwag.';
        $out[] = '';
        $out[] = 'Wiadomość wygenerowana automatycznie przez katalog B2B DEMO PARTS. Odpowiedz klientowi na adres: ' . ($c['email'] ?? '—');
        return implode("\n", $out);
    }
}

if (!class_exists('Order_Mail', false)) {
    class_alias(OrderMail::class, 'Order_Mail');
}
