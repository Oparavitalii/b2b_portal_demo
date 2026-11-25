<?php

declare(strict_types=1);

/** Smoke: GET /api/admin/products/export — the catalogue as .xlsx, admin only. */
require __DIR__ . '/Harness.php';
require __DIR__ . '/Fixtures/products_fixture.php';

/** Files of a zip written by Xlsx (no ext-zip needed): name → bytes. */
function t_unzip(string $zip): array
{
    $out = [];
    for ($p = 0; substr($zip, $p, 4) === "PK\x03\x04";) {
        $h = unpack('vver/vflags/vmethod/vtime/vdate/Vcrc/Vcsize/Vsize/vnlen/velen', substr($zip, $p + 4, 26));
        $name = substr($zip, $p + 30, $h['nlen']);
        $packed = substr($zip, $p + 30 + $h['nlen'] + $h['elen'], $h['csize']);
        $bytes = $h['method'] === 8 ? (string) gzinflate($packed) : $packed;
        $out[$name] = crc32($bytes) === $h['crc'] && strlen($bytes) === $h['size'] ? $bytes : null;
        $p += 30 + $h['nlen'] + $h['elen'] + $h['csize'];
    }
    return $out;
}

t_reset();
t_products_fixture();
$admin = t_user('admin');
$customer = t_user('customer');
$total = (int) Db::val('SELECT COUNT(*) FROM products');

$req = t_request('GET', '/api/admin/products/export');
$req->headers['authorization'] = 'Bearer ' . t_token($customer);
t_ok(Router::dispatch($req)->status === 403, 'customer → 403');

$req = t_request('GET', '/api/admin/products/export');
$req->headers['authorization'] = 'Bearer ' . t_token($admin);
$res = Router::dispatch($req);
t_ok($res->status === 200 && $res->headers['Content-Type'] === Xlsx::MIME, 'admin → 200 xlsx');
t_ok(preg_match('/^attachment; filename="Katalog_Catalog_\d{4}_\d{2}_\d{2}\.xlsx"$/', $res->headers['Content-Disposition'] ?? '') === 1, 'download file name');

$files = t_unzip($res->body);
t_ok(count($files) === 6 && !in_array(null, $files, true), 'zip: 6 parts, CRC and sizes match');
$sheet = $files['xl/worksheets/sheet1.xml'] ?? '';
$xml = simplexml_load_string($sheet);
t_ok($xml !== false && simplexml_load_string($files['xl/workbook.xml'] ?? '') !== false && simplexml_load_string($files['xl/styles.xml'] ?? '') !== false, 'sheet, workbook, styles are valid XML');
t_ok(count($xml->sheetData->row) === $total + 1, "header + $total product rows");
t_ok(str_contains($sheet, '>SKU<') && str_contains($sheet, '>Cena brutto (zł)<') && str_contains($sheet, '>Kody silników<'), 'Polish headers');
t_ok(str_contains($sheet, '>R00002D<') && str_contains($sheet, '<v>808</v>') && str_contains($sheet, '<v>605</v>'), 'variant prices in złoty');
t_ok(str_contains($sheet, '<v>588</v>') && str_contains($sheet, '<v>' . (round(58800 / 1.23) / 100) . '</v>'), 'gross and net price in złoty');
t_ok((int) Db::val("SELECT COUNT(*) FROM audit_log WHERE action = 'products_export'") === 1, 'export is in the audit log');
