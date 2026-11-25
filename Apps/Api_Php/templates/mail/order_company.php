<?php

declare(strict_types=1);

/**
 * New order → company inbox (R-06, R-10). Rendered by Mail::render('order_company', ...)
 * from OrderMail::sendToCompany(). Vars: $order (OrdersService::find() shape).
 * Never sent to the customer (N-04).
 *
 * Channel: SMTP (PHPMailer) — HTML goes out byte for byte, so the <style> block
 * may carry a phone tweak, but every visual rule is also inline on the cell.
 * Layout: nested tables + attributes, 600 px (inner 536 px = 600 − 2 × 32).
 * Items: one row per item with name / SKU / version, then a row of six price
 * cells (6 × 89 px + 2 px = 536 px) — nine columns side by side do not fit 600 px.
 * Prices are never red; the only red is the DEMO PARTS rule under the header.
 */
$e = static fn(mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES | ENT_HTML5, 'UTF-8');
$m = static fn(?int $g): string => $e(OrderMail::money($g));
$font = 'font-family:Arial,Helvetica,sans-serif;';
$c = $order['customer'];
$a = $order['address'];
$t = $order['totals'];
$dash = static fn(mixed $v): string => trim((string) $v) === '' ? '—' : $e($v);
$label = $font . 'font-size:12px;color:#646669;';
$cell = $font . 'font-size:13px;color:#111318;';
$num = 'align="right" valign="top" width="89"';
$note = trim((string) ($order['note'] ?? ''));
$phoneHref = static fn(string $p): string => 'tel:' . preg_replace('/[^0-9+]/', '', $p);
?>
<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Nowe zamówienie <?= $e($order['number']) ?> — DEMO PARTS Katalog B2B</title>
<style>
  @media (max-width: 620px) {
    .cdm-container { width: 100% !important; }
    .cdm-pad { padding-left: 16px !important; padding-right: 16px !important; }
  }
</style>
</head>
<body bgcolor="#f5f6f7" marginwidth="0" marginheight="0" leftmargin="0" topmargin="0" style="margin:0;padding:0;background-color:#f5f6f7;">
<span style="<?= $font ?>font-size:1px;color:#f5f6f7;line-height:1px;">Zamówienie <?= $e($order['number']) ?> od <?= $dash($c['companyName']) ?> (NIP <?= $dash($c['nip']) ?>) — razem z kaucją <?= $m($t['grossWithDeposit']) ?>.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f6f7">
  <tr>
    <td align="center" valign="top" style="padding:24px 8px;">
      <table role="presentation" class="cdm-container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">
        <tr>
          <td class="cdm-pad" bgcolor="#111318" align="left" valign="middle" height="64" style="padding:0 32px;background-color:#111318;<?= $font ?>font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:2px;">
            DEMO PARTS<span style="<?= $font ?>font-size:13px;font-weight:normal;color:#bcbdbf;letter-spacing:0;">&nbsp;&nbsp;Katalog B2B</span>
          </td>
        </tr>
        <tr><td bgcolor="#e30613" height="3" style="font-size:0;line-height:0;background-color:#e30613;">&nbsp;</td></tr>
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:28px 32px 4px 32px;<?= $font ?>font-size:24px;font-weight:bold;color:#111318;line-height:30px;">
            Nowe zamówienie <?= $e($order['number']) ?>
          </td>
        </tr>
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:0 32px 20px 32px;<?= $font ?>font-size:14px;color:#414246;line-height:21px;">
            Złożone <?= $e(OrderMail::date($order['createdAt'])) ?> w katalogu B2B. Płatność i dostawę ustalcie z klientem — zamówienie nie ma etapu płatności.
          </td>
        </tr>

        <!-- Klient + adres dostawy -->
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:0 32px 20px 32px;">
            <table role="presentation" width="536" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="268" align="left" valign="top" style="padding:0 12px 0 0;<?= $font ?>font-size:14px;color:#111318;line-height:21px;">
                  <span style="<?= $label ?>font-weight:bold;letter-spacing:1px;">KLIENT</span><br>
                  <strong style="<?= $font ?>font-size:15px;color:#111318;"><?= $dash($c['companyName']) ?></strong><br>
                  NIP: <strong style="<?= $font ?>font-size:14px;color:#111318;"><?= $dash($c['nip']) ?></strong><br>
                  <?= $dash($c['contactName']) ?><br>
                  <?php if (($c['email'] ?? null) !== null) : ?><a href="mailto:<?= $e($c['email']) ?>" style="<?= $font ?>font-size:14px;color:#111318;"><?= $e($c['email']) ?></a><br><?php endif; ?>
                  <?php if (($c['phone'] ?? null) !== null) : ?><a href="<?= $e($phoneHref((string) $c['phone'])) ?>" style="<?= $font ?>font-size:14px;color:#111318;"><?= $e($c['phone']) ?></a><?php endif; ?>
                </td>
                <td width="268" align="left" valign="top" style="padding:0 0 0 12px;<?= $font ?>font-size:14px;color:#111318;line-height:21px;">
                  <span style="<?= $label ?>font-weight:bold;letter-spacing:1px;">ADRES DOSTAWY</span><br>
                  <strong style="<?= $font ?>font-size:15px;color:#111318;"><?= $dash($a['companyName']) ?></strong><br>
                  <?= $dash($a['street']) ?><br>
                  <?= $e(trim(($a['postalCode'] ?? '') . ' ' . ($a['city'] ?? ''))) ?><br>
                  <?= $dash($a['country']) ?>
                  <?php if (($a['phone'] ?? null) !== null) : ?><br>tel. <a href="<?= $e($phoneHref((string) $a['phone'])) ?>" style="<?= $font ?>font-size:14px;color:#111318;"><?= $e($a['phone']) ?></a><?php endif; ?>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:0 32px 16px 32px;<?= $font ?>font-size:14px;color:#111318;line-height:21px;">
            Rabat klienta: <strong style="<?= $font ?>font-size:14px;color:#111318;"><?= !empty($order['productDiscounts']) ? 'wg pozycji' : $e(OrderMail::percent((float) $order['discountPercent'])) ?></strong>
            <span style="<?= $font ?>font-size:13px;color:#646669;">(liczony od ceny produktu, nie obejmuje kaucji)</span>
          </td>
        </tr>

        <!-- Pozycje -->
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:0 32px 8px 32px;">
            <table role="presentation" width="536" cellpadding="0" cellspacing="0" border="0" bgcolor="#d9dadc">
              <tr>
                <td style="padding:1px;">
                  <table role="presentation" width="534" cellpadding="6" cellspacing="0" border="0" bgcolor="#ffffff">
                    <tr bgcolor="#f5f6f7">
                      <td <?= $num ?> style="<?= $label ?>font-weight:bold;background-color:#f5f6f7;">Ilość</td>
                      <td <?= $num ?> style="<?= $label ?>font-weight:bold;background-color:#f5f6f7;">Cena netto</td>
                      <td <?= $num ?> style="<?= $label ?>font-weight:bold;background-color:#f5f6f7;">Cena brutto</td>
                      <td <?= $num ?> style="<?= $label ?>font-weight:bold;background-color:#f5f6f7;">Kaucja</td>
                      <td <?= $num ?> style="<?= $label ?>font-weight:bold;background-color:#f5f6f7;">Wartość netto</td>
                      <td <?= $num ?> style="<?= $label ?>font-weight:bold;background-color:#f5f6f7;">Wartość brutto</td>
                    </tr>
                    <?php foreach ($order['items'] as $n => $i) : ?>
                    <tr>
                      <td colspan="6" align="left" valign="top" style="padding:10px 6px 2px 6px;border-top:1px solid #e4e5e7;<?= $font ?>font-size:14px;color:#111318;line-height:20px;">
                        <strong style="<?= $font ?>font-size:14px;color:#111318;"><?= (int) $n + 1 ?>. <?= $e($i['name']) ?></strong><br>
                        <span style="<?= $label ?>">SKU: <span style="<?= $font ?>font-size:12px;color:#111318;"><?= $e($i['sku']) ?></span> &nbsp;·&nbsp; Wersja: <span style="<?= $font ?>font-size:12px;color:#111318;"><?= $e(OrderMail::variantLabel($i['variant'])) ?></span><?php if (!empty($order['productDiscounts'])) : ?> &nbsp;·&nbsp; Rabat: <span style="<?= $font ?>font-size:12px;color:#111318;"><?= $e(OrderMail::percent((float) $i['discountPercent'])) ?></span><?php endif; ?></span>
                      </td>
                    </tr>
                    <tr>
                      <td <?= $num ?> style="<?= $cell ?>"><?= (int) $i['qty'] ?> szt.</td>
                      <?php if ($i['priceOnRequest']) : ?>
                      <td colspan="2" align="right" valign="top" style="<?= $cell ?>font-weight:bold;">Cena na zapytanie</td>
                      <td <?= $num ?> style="<?= $cell ?>"><?= $m($i['unitDeposit']) ?></td>
                      <td colspan="2" align="right" valign="top" style="<?= $font ?>font-size:12px;color:#646669;">nie wliczono do sum</td>
                      <?php else : ?>
                      <td <?= $num ?> style="<?= $cell ?>"><?= $m($i['unitNet']) ?></td>
                      <td <?= $num ?> style="<?= $cell ?>"><?= $m($i['unitGross']) ?></td>
                      <td <?= $num ?> style="<?= $cell ?>"><?= $m($i['unitDeposit']) ?></td>
                      <td <?= $num ?> style="<?= $cell ?>"><?= $m($i['lineNet']) ?></td>
                      <td <?= $num ?> style="<?= $cell ?>font-weight:bold;"><?= $m($i['lineGross']) ?></td>
                      <?php endif; ?>
                    </tr>
                    <?php endforeach; ?>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Podsumowanie -->
        <tr>
          <td class="cdm-pad" align="right" valign="top" style="padding:8px 32px 8px 32px;">
            <table role="presentation" width="320" cellpadding="4" cellspacing="0" border="0">
              <tr>
                <td align="left" style="<?= $font ?>font-size:14px;color:#414246;">Razem netto</td>
                <td align="right" style="<?= $font ?>font-size:14px;color:#111318;"><?= $m($t['net']) ?></td>
              </tr>
              <tr>
                <td align="left" style="<?= $font ?>font-size:14px;color:#414246;">Razem brutto (VAT 23%)</td>
                <td align="right" style="<?= $font ?>font-size:14px;color:#111318;"><?= $m($t['gross']) ?></td>
              </tr>
              <tr>
                <td align="left" style="<?= $font ?>font-size:14px;color:#414246;">Kaucja (VAT 0%)</td>
                <td align="right" style="<?= $font ?>font-size:14px;color:#111318;"><?= $m($t['deposit']) ?></td>
              </tr>
              <tr>
                <td align="left" style="border-top:2px solid #111318;<?= $font ?>font-size:15px;font-weight:bold;color:#111318;">Razem do zapłaty</td>
                <td align="right" style="border-top:2px solid #111318;<?= $font ?>font-size:15px;font-weight:bold;color:#111318;"><?= $m($t['grossWithDeposit']) ?></td>
              </tr>
            </table>
          </td>
        </tr>
        <?php if ($order['hasPriceOnRequest']) : ?>
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:4px 32px 8px 32px;<?= $font ?>font-size:13px;color:#414246;line-height:19px;">
            Zamówienie zawiera pozycje „Cena na zapytanie” — nie są wliczone do sum; cenę trzeba ustalić z klientem.
          </td>
        </tr>
        <?php endif; ?>

        <!-- Uwagi klienta -->
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:16px 32px 28px 32px;">
            <table role="presentation" width="536" cellpadding="14" cellspacing="0" border="0" bgcolor="#f5f6f7">
              <tr>
                <td align="left" valign="top" style="background-color:#f5f6f7;<?= $font ?>font-size:14px;color:#111318;line-height:21px;">
                  <span style="<?= $label ?>font-weight:bold;letter-spacing:1px;">UWAGI KLIENTA</span><br>
                  <?= $note !== '' ? nl2br($e($note)) : '<span style="' . $font . 'font-size:14px;color:#646669;">Brak uwag.</span>' ?>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="cdm-pad" bgcolor="#f5f6f7" align="left" valign="top" style="padding:20px 32px;background-color:#f5f6f7;<?= $font ?>font-size:12px;color:#646669;line-height:18px;">
            Wiadomość wygenerowana automatycznie przez katalog B2B DEMO PARTS — wysyłana tylko na skrzynkę firmy, klient jej nie otrzymuje.
            Odpowiedz klientowi na adres
            <?php if (($c['email'] ?? null) !== null) : ?><a href="mailto:<?= $e($c['email']) ?>" style="<?= $font ?>font-size:12px;color:#111318;"><?= $e($c['email']) ?></a><?php else : ?>—<?php endif; ?>.<br><br>
            DEMO PARTS sp. z o.o., ul. Przykładowa 1, 00-001 Wrocław. Sąd Rejonowy dla Wrocławia-Fabrycznej we Wrocławiu,
            VI Wydział Gospodarczy KRS, KRS 0000000000, NIP 0000000000, REGON 000000000, kapitał zakładowy 5 000,00 zł.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
