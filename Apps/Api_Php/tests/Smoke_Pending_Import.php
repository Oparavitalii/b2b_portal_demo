<?php

declare(strict_types=1);

/** PendingImport: a product file pushed over FTP is imported once by the next request. */
require __DIR__ . '/Harness.php';

t_reset();
$sample = json_decode((string) file_get_contents(__DIR__ . '/Fixtures/Products_Data_Sample.json'), true);
$pending = storage_path(PendingImport::PENDING);
$result = storage_path(PendingImport::RESULT);
@mkdir(dirname($pending), 0775, true);

t_ok(PendingImport::run() === null, 'nothing pending → null, no result file');
t_ok(!is_file($result), 'no Last_Import.json without a pending file');

file_put_contents($pending, json_encode($sample, JSON_UNESCAPED_UNICODE));
$r = PendingImport::run();
$count = count($sample['produkty']);
t_ok(is_array($r) && $r['ok'] === true && $r['created'] === $count, "pending file → $count products created");
t_ok((int) Db::val('SELECT count(*) FROM products') === $count, 'products are in the database');
t_ok(!is_file($pending) && !is_file(storage_path(PendingImport::CLAIMED)), 'pending and claimed files are gone');
t_ok(is_file(storage_path(PendingImport::DONE)), 'file kept as Imported_Products.json');
$written = json_decode((string) file_get_contents($result), true);
t_ok($written['ok'] === true && $written['created'] === $count && is_string($written['at']), 'Last_Import.json records the outcome');
t_ok(PendingImport::run() === null, 'second request does not import again');

file_put_contents($pending, json_encode($sample, JSON_UNESCAPED_UNICODE));
$r = PendingImport::run();
t_ok($r['ok'] === true && $r['created'] === 0 && $r['updated'] === $count, 'same file again → updated by SKU, nothing duplicated');

file_put_contents($pending, '{"produkty": []}');
$r = PendingImport::run();
t_ok($r['ok'] === false && $r['error'] === 'invalid_import_file', 'empty produkty → failed result');
t_ok(is_file(storage_path(PendingImport::FAILED)) && (int) Db::val('SELECT count(*) FROM products WHERE active = 1') === $count, 'failed file kept aside, catalogue untouched');

file_put_contents($pending, 'not json');
$r = PendingImport::run();
t_ok($r['ok'] === false && is_string($r['error']), 'broken JSON → failed result, no exception');

