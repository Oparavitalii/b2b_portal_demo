#!/usr/bin/env node
// npm run products:sync — copies the product data and photos from the shop
// project (Wp_Shop, R-16, R-20). Read-only on the source; never edits its files.
//   Products_Data.json -> Apps/Api_Php/storage/import/Products_Data.json
//   *.webp photos      -> Apps/Web/public/img/products/
// Source root: CATALOG_PATH (default ../Wp_Shop).
// Exit 1 with a clear message when a source is missing.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = path.resolve(
  process.env.CATALOG_PATH || path.join(root, '..', 'Wp_Shop'),
);

const jsonSource = path.join(
  catalog,
  'data',
  'catalog',
  'Main',
  'Products_Data.json',
);
const imagesSource = path.join(
  catalog,
  'wp-content',
  'themes',
  'woodmart-child',
  'assets',
  'img',
  'products',
);
const jsonTarget = path.join(
  root,
  'Apps',
  'Api_Php',
  'storage',
  'import',
  'Products_Data.json',
);
const imagesTarget = path.join(
  root,
  'Apps',
  'Web',
  'public',
  'img',
  'products',
);

function fail(message) {
  console.error(`[products:sync] ${message}`);
  process.exit(1);
}

if (!existsSync(catalog)) {
  fail(`Shop project not found at ${catalog}. Set CATALOG_PATH to its folder.`);
}
if (!existsSync(jsonSource)) {
  fail(`Products_Data.json not found: ${jsonSource}`);
}
if (!existsSync(imagesSource) || !statSync(imagesSource).isDirectory()) {
  fail(`Product photo folder not found: ${imagesSource}`);
}

// Validate before copying: a broken file must not replace a good one.
let products;
try {
  const parsed = JSON.parse(readFileSync(jsonSource, 'utf8'));
  products = parsed.produkty;
} catch (err) {
  fail(`Products_Data.json is not valid JSON: ${err.message}`);
}
if (!Array.isArray(products) || products.length === 0) {
  fail('Products_Data.json has no "produkty" list.');
}

mkdirSync(path.dirname(jsonTarget), { recursive: true });
copyFileSync(jsonSource, jsonTarget);
console.log(
  `[products:sync] JSON: 1 file (${products.length} produktów) -> ${path.relative(root, jsonTarget)}`,
);

const photos = readdirSync(imagesSource).filter((name) =>
  name.toLowerCase().endsWith('.webp'),
);
if (photos.length === 0) {
  fail(`No .webp files in ${imagesSource}`);
}
mkdirSync(imagesTarget, { recursive: true });
for (const name of photos) {
  copyFileSync(path.join(imagesSource, name), path.join(imagesTarget, name));
}
console.log(
  `[products:sync] Zdjęcia: ${photos.length} plików .webp -> ${path.relative(root, imagesTarget)}`,
);

const available = new Set(photos);
const missing = products
  .filter((p) => p && p.obraz && !available.has(p.obraz))
  .map((p) => p.sku);
if (missing.length > 0) {
  console.warn(
    `[products:sync] Uwaga: ${missing.length} produktów bez pliku zdjęcia: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}`,
  );
}
console.log(
  '[products:sync] Gotowe. Import do bazy: php Apps/Api_Php/database/Import_Products.php (lub panel admina).',
);
