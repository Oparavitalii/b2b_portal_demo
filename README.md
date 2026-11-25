# B2B ordering portal demo

[![CI](https://github.com/Oparavitalii/b2b_portal_demo/actions/workflows/ci.yml/badge.svg)](https://github.com/Oparavitalii/b2b_portal_demo/actions/workflows/ci.yml)

Public copy of a real system that I (Vitalii Opara) built in 2026 and that runs in production for an auto-parts company in Poland (client name withheld). Wholesale customers register, log in, browse the catalogue at their own negotiated discount and send order requests; every order reaches the company by e-mail and the admin can buy an InPost shipment for it from the panel. In this copy the brand is replaced with the fictional "Demo Parts" and `portal.catalog-demo.example`; the code, structure and engineering decisions are the production ones.

The company's WooCommerce shop (OE-number and vehicle part finder, catalogue import pipeline) is in the companion repo [catalog_shop_demo](https://github.com/Oparavitalii/catalog_shop_demo).

- `Apps/Web`: SPA (React 19, Vite, TypeScript, Mantine, TanStack Query, Zustand), served at `/`
- `Apps/Api_Php`: API (PHP 8.2, SQLite, no framework), served at `/api` on the same origin
- `Packages/Shared`: Zod schemas and types (`@catalog/shared`), mirrored by the PHP validators

## Architecture

```
 React SPA (Vite build) ──/api/*──▶ api/index.php ─▶ Api_Php (outside the web root)
   TanStack Query, Zustand          Router ─▶ Auth (JWT / API key) ─▶ Services ─▶ SQLite (WAL)
   Zod schemas ◀── Packages/Shared ──▶ mirrored by PHP validation       │
                                                      order e-mail (SMTP), InPost ShipX API
```

## Engineering highlights

- **Same-origin SPA + API.** The SPA is served at `/` and the API at `/api`, so CORS is not needed. Apache rewrites `/api/*` to a 2-line `index.php` that requires the API, which lives outside the web root. Security headers (CSP, HSTS, nosniff, frame-deny) are set on every response.
- **Framework-free PHP 8.2 API.** A small router with per-route `auth` / `roles` options, a declarative validator, and `ApiError` → JSON errors. SQLite runs with WAL, `foreign_keys` and `busy_timeout`. New `Schema_*.sql` files are applied on the first request after a deploy, because the host has no SSH.
- **Auth.** A 15-minute HS256 access JWT (Bearer) plus a 7-day refresh token in an `HttpOnly` cookie scoped to `/api/auth`. Only the sha256 of the refresh token is stored. It rotates on every use, with a 60-second grace window for parallel tabs. Passwords use bcrypt. An unknown e-mail still costs one bcrypt compare, so response timing gives nothing away. Failed logins and password resets are rate-limited (state kept in SQLite). Also included: e-mail verification and password reset with hashed single-use tokens, and an audit log.
- **Money and pricing.** All amounts are integer grosze. `PricingService` is the only place prices are computed. Catalogue prices are gross (23 % VAT). The discount applies to the product price, never to the core deposit. Rounding is per unit, and line total = unit × qty, so totals never drift. "Price on request" lines are flagged and left out of totals.
- **Layered discounts.** `DiscountPolicy` checks, in order: the customer's own SKU rule → their own category rule → template SKU rule → template category rule → their global %.
- **Orders.** Inside one transaction, the cart is frozen into `order_items`. Customer and address data are stored as JSON snapshots, so an order survives later price changes and account deletion. Orders are numbered `CDM-YYYY-NNNN` per year, then e-mailed to the company. There is no online payment by design.
- **Search by OE number.** The import precomputes a normalised `oe_search` column, so `0950005801`, `095000-5801` and `095000 5801` all find the same product.
- **Catalogue import.** A JSON file is the source of truth: it is upserted by SKU in one transaction. Products missing from the file are deactivated, never deleted, so old orders keep their SKU. Deploy-time imports work by dropping the file over FTP; the next request claims it with an atomic `rename` so it is imported only once.
- **Client API v1.** Read-only product endpoints with the key owner's prices, described in OpenAPI (`templates/Openapi_V1.yaml`). Keys are prefixed and stored as sha256 hashes. Each key gets its own budget of 120 requests/min.
- **InPost ShipX.** The admin buys a parcel-locker or courier shipment for an order and downloads the A6 label. Status updates come in three ways: a webhook (the payload is never trusted; the shipment is re-fetched with our token), an on-view refresh, and a cron script.
- **XLSX export** with its own minimal zip/xlsx writer, so it does not depend on `ext-zip` being installed on the host.
- **Shared contracts.** Zod schemas in `Packages/Shared` type the SPA, and the PHP validators mirror them.
- **No built-in credentials.** The seed reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` (and the optional `DEMO_PASSWORD`) from the environment and refuses to run when the admin password is missing or shorter than 12 characters. Tests generate throwaway passwords per run.

## Stack

- **Frontend:** React 19, TypeScript, Vite 7, Mantine 7, TanStack Query 5, React Router 7, Zustand, Zod, ofetch
- **Backend:** PHP 8.2 (no framework), SQLite (PDO, WAL), JWT (HS256), PHPMailer (SMTP), InPost ShipX REST API
- **Tooling:** npm workspaces, ESLint 9, Prettier, Vitest, Playwright, a PHP smoke-test harness, GitHub Actions

## Requirements

Node 20+, PHP 8.2 CLI with `pdo_sqlite` (and `openssl` for SMTP) on `PATH` as `php`.

## Quick start

```bash
npm ci
cp Apps/Api_Php/.env.example Apps/Api_Php/.env
# set ADMIN_PASSWORD (12+ characters, required) and DEMO_PASSWORD (optional) in Apps/Api_Php/.env
npm run db:reset
php Apps/Api_Php/database/Import_Products.php Apps/Api_Php/tests/Fixtures/Products_Data_Sample.json
npm run dev        # API on :8080, SPA on :5173
```

## Configuration

- API: copy `Apps/Api_Php/.env.example` to `Apps/Api_Php/.env`. In development only `ADMIN_PASSWORD` is required (at least 12 characters); `DEMO_PASSWORD` is optional. There are no built-in passwords.
- Root scripts: see `.env.example` for `CATALOG_PATH` and `DB_PATH`.
- Mail in development goes to `Apps/Api_Php/storage/mail.log`, one JSON line per message (`MAIL_DRIVER=log`).
- SMTP mode loads PHPMailer from `Apps/Api_Php/vendor/phpmailer/phpmailer` (vendored, not in this repo).

## Development

- `npm install`, then `npm run dev`: runs `scripts/Dev_Start.mjs`. If the database is missing it builds one first, then starts the API on `127.0.0.1:8080` and Vite on `5173`. Vite proxies `/api` to the API. Ctrl+C stops both.
- Sample products: `php Apps/Api_Php/database/Import_Products.php Apps/Api_Php/tests/Fixtures/Products_Data_Sample.json` (4 products).
- `npm run db:reset`: deletes the database and recreates it with seed data (`php database/Migrate.php --fresh && php database/Seed.php`).
- Logins created by the seed come from the environment (or `Apps/Api_Php/.env`):
  - admin: `ADMIN_EMAIL` (default `admin@catalog-demo.local` outside production) / `ADMIN_PASSWORD`. The seed stops with a clear error when `ADMIN_PASSWORD` is missing or shorter than 12 characters.
  - customer `demo@catalog-demo.local` / `DEMO_PASSWORD` (10 % discount): created only outside production and only when `DEMO_PASSWORD` is set (also 12+ characters).

## Products

- `npm run products:sync`: copies `Products_Data.json` from the shop's catalog pipeline (`CATALOG_PATH`, e.g. `../Catalog_Shop_Demo` — a clone of catalog_shop_demo) into `Apps/Api_Php/storage/import/` and the WebP photos into `Apps/Web/public/img/products/`. The real catalogue file is not part of this repo.
- An admin can also upload the JSON in the panel at `/admin/produkty`.

## Tests and checks

- `npm run test:api`: `php tests/Lint.php` and the `tests/Smoke_*.php` files (`php tests/Run.php [filter]`). Each run uses a temporary database and random throwaway admin / demo passwords.
- `npm run test:web`: Vitest. `npm run test:e2e`: Playwright (temporary database, random passwords; override with `E2E_ADMIN_PASSWORD` / `E2E_DEMO_PASSWORD`).
- `npm run typecheck`, `npm run lint`, `npm run format`.

## Backup

- `php Apps/Api_Php/scripts/Backup.php`: writes `storage/backups/katalog_YYYYmmdd_His.sqlite` (`VACUUM INTO`), keeps the newest 7 copies. Run it daily from cron.
- `GET /api/health` reports the SQLite `journalMode` (expected `wal`) and whether the database is writable.

## Deploy

- `npm run deploy`: builds the web app and uploads it together with the API (`Apps/Web/scripts/Deploy.ts`, credentials in `Apps/Web/.env.deploy`, see `.env.deploy.example`).
- In production, set `APP_ENV=production`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ORDER_EMAIL` and `MAIL_*` (`MAIL_DRIVER=smtp`).

## What was removed for the public version

- The client's name, logo, domains, company contact and registry data; replaced with "Demo Parts", `*.catalog-demo.example` hosts and fake data.
- All secrets and server environment files (only `.env.example` placeholders are included), private hosting details, runtime data (database, logs, backups, the real catalogue) and product images.
- The git history: this copy starts from a single commit.

Built by Vitalii Opara · Full Stack Developer, Wrocław · https://u2use.com
