<?php

declare(strict_types=1);

/**
 * Password reset (R-24). Rendered by Mail::render('reset_password', ...) from
 * Core/Password_Reset. Vars: $resetUrl (string), $email (string), $validMinutes (int).
 *
 * Channel: SMTP (PHPMailer) — HTML goes out byte for byte, so the <style> block
 * may carry a phone tweak, but every visual rule is also inline on the cell.
 * Layout: nested tables + attributes, 600 px, button = table with bgcolor.
 */
$e = static fn(mixed $v): string => htmlspecialchars((string) $v, ENT_QUOTES | ENT_HTML5, 'UTF-8');
$font = "font-family:Arial,Helvetica,sans-serif;";
?>
<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Ustaw nowe hasło — DEMO PARTS Katalog B2B</title>
<style>
  @media (max-width: 620px) {
    .cdm-container { width: 100% !important; }
    .cdm-pad { padding-left: 20px !important; padding-right: 20px !important; }
  }
</style>
</head>
<body bgcolor="#f5f6f7" marginwidth="0" marginheight="0" leftmargin="0" topmargin="0" style="margin:0;padding:0;background-color:#f5f6f7;">
<span style="<?= $font ?>font-size:1px;color:#f5f6f7;line-height:1px;">Ustaw nowe hasło do katalogu B2B DEMO PARTS — link jest ważny <?= (int) $validMinutes ?> minut.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f6f7">
  <tr>
    <td align="center" valign="top" style="padding:24px 8px;">
      <table role="presentation" class="cdm-container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff">
        <tr>
          <td class="cdm-pad" bgcolor="#111318" align="left" valign="middle" height="64" style="padding:0 32px;background-color:#111318;<?= $font ?>font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:2px;">
            DEMO PARTS<span style="<?= $font ?>font-size:13px;font-weight:normal;color:#bcbdbf;letter-spacing:0;">&nbsp;&nbsp;Katalog B2B</span>
          </td>
        </tr>
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:32px 32px 8px 32px;<?= $font ?>font-size:24px;font-weight:bold;color:#111318;line-height:30px;">
            Ustaw nowe hasło
          </td>
        </tr>
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:8px 32px 0 32px;<?= $font ?>font-size:15px;color:#24262a;line-height:23px;">
            <p style="margin:0 0 12px 0;<?= $font ?>font-size:15px;color:#24262a;">Dzień dobry!</p>
            <p style="margin:0 0 12px 0;<?= $font ?>font-size:15px;color:#24262a;">
              otrzymaliśmy prośbę o ustawienie nowego hasła do konta
              <strong style="color:#111318;"><?= $e($email) ?></strong> w katalogu B2B DEMO PARTS.
              Kliknij przycisk poniżej i wpisz nowe hasło.
            </p>
          </td>
        </tr>
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:16px 32px 24px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="#e30613" align="center" valign="middle" style="padding:14px 28px;background-color:#e30613;border-radius:2px;">
                  <a href="<?= $e($resetUrl) ?>" target="_blank" style="<?= $font ?>font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:1px;">USTAW NOWE HASŁO</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:0 32px 8px 32px;<?= $font ?>font-size:14px;color:#414246;line-height:21px;">
            Link jest ważny <?= (int) $validMinutes ?> minut i działa tylko raz. Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:
          </td>
        </tr>
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:0 32px 24px 32px;<?= $font ?>font-size:13px;color:#111318;line-height:19px;word-break:break-all;">
            <a href="<?= $e($resetUrl) ?>" target="_blank" style="<?= $font ?>font-size:13px;color:#111318;"><?= $e($resetUrl) ?></a>
          </td>
        </tr>
        <tr>
          <td class="cdm-pad" align="left" valign="top" style="padding:0 32px 32px 32px;<?= $font ?>font-size:14px;color:#414246;line-height:21px;">
            Jeśli to nie Ty prosiłeś o zmianę hasła — zignoruj tę wiadomość. Dotychczasowe hasło pozostaje bez zmian.
          </td>
        </tr>
        <tr>
          <td class="cdm-pad" bgcolor="#f5f6f7" align="left" valign="top" style="padding:20px 32px;background-color:#f5f6f7;<?= $font ?>font-size:12px;color:#646669;line-height:18px;">
            Wiadomość wysłana automatycznie — prosimy na nią nie odpowiadać. Pytania:
            <a href="mailto:office@catalog-demo.example" style="<?= $font ?>font-size:12px;color:#111318;">office@catalog-demo.example</a>,
            tel. <a href="tel:+48000000001" style="<?= $font ?>font-size:12px;color:#111318;">000 000 001</a>.<br><br>
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
