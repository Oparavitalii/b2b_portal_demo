-- DEMO PARTS Katalog B2B — SQLite schema (PHP 8.2 + SQLite on the Crm_Demo core).
-- Applied once by Core/Schema.php (tracked in schema_files). Later changes go into
-- database/Schema_<Module>.sql — never edit this file after it has been deployed.
-- Timestamps: ISO 8601 UTC text ('YYYY-MM-DDTHH:MM:SS.sssZ'). Money: INTEGER grosze.
-- JSON columns hold JSON text (checked with json_valid).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin','customer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active')),
  company_name TEXT,
  nip TEXT,
  contact_name TEXT,
  phone TEXT,
  discount_percent REAL NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

-- One delivery address per customer.
CREATE TABLE IF NOT EXISTS addresses (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  street TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Polska',
  phone TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  rotated_at TEXT,
  replaced_by_id TEXT REFERENCES sessions (id) ON DELETE SET NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS sessions_refresh_token_hash_idx ON sessions (refresh_token_hash);
CREATE INDEX IF NOT EXISTS sessions_replaced_by_id_idx ON sessions (replaced_by_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);

-- E-mail confirmation after registration (valid 24 h).
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_token_hash_idx ON email_verification_tokens (token_hash);
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx ON email_verification_tokens (user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_value TEXT CHECK (old_value IS NULL OR json_valid(old_value)),
  new_value TEXT CHECK (new_value IS NULL OR json_valid(new_value)),
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at);

-- Products imported from Products_Data.json (source of truth, upsert by SKU).
-- price_gross: brutto in grosze, NULL when price_on_request = 1.
-- variants: {"oryginalne":{"price_gross":...},"zamienne":{"price_gross":...}} or NULL.
-- oe_search: normalised OE numbers + SKU (lowercase, no spaces/dashes), space-joined.
-- make_search: lowercase makes joined with '|'.
CREATE TABLE IF NOT EXISTS products (
  sku TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  type TEXT,
  producer TEXT,
  oe_numbers TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(oe_numbers)),
  oe_search TEXT NOT NULL DEFAULT '',
  makes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(makes)),
  make_search TEXT NOT NULL DEFAULT '',
  engine_codes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(engine_codes)),
  applications TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(applications)),
  price_gross INTEGER CHECK (price_gross IS NULL OR price_gross >= 0),
  price_on_request INTEGER NOT NULL DEFAULT 0 CHECK (price_on_request IN (0,1)),
  deposit_gross INTEGER NOT NULL DEFAULT 0 CHECK (deposit_gross >= 0),
  variants TEXT CHECK (variants IS NULL OR json_valid(variants)),
  image TEXT,
  description TEXT,
  attributes TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(attributes)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS products_active_idx ON products (active);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sku TEXT NOT NULL REFERENCES products (sku),
  variant TEXT CHECK (variant IS NULL OR variant IN ('oryginalne','zamienne')),
  qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 999),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, sku, variant)
);
-- SQLite treats NULLs as distinct in UNIQUE: this index also makes (user, sku, no variant) unique.
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_line_idx ON cart_items (user_id, sku, ifnull(variant, ''));

-- Orders keep snapshots so they survive account deletion (user_id → NULL).
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY NOT NULL,
  number TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  customer_snapshot TEXT NOT NULL CHECK (json_valid(customer_snapshot)),
  address_snapshot TEXT NOT NULL CHECK (json_valid(address_snapshot)),
  discount_percent REAL NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  total_net INTEGER NOT NULL DEFAULT 0,
  total_gross INTEGER NOT NULL DEFAULT 0,
  total_deposit INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders (user_id, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  variant TEXT CHECK (variant IS NULL OR variant IN ('oryginalne','zamienne')),
  qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 999),
  unit_net INTEGER,
  unit_gross INTEGER,
  unit_deposit INTEGER NOT NULL DEFAULT 0,
  price_on_request INTEGER NOT NULL DEFAULT 0 CHECK (price_on_request IN (0,1))
);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);

-- Infrastructure: fixed-window rate limiter state (Core/RateLimit.php). key = '<bucket>|<ip>'.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

-- Infrastructure: write probe used by GET /health (rows are inserted and deleted at once).
CREATE TABLE IF NOT EXISTS health_probe (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL
);
