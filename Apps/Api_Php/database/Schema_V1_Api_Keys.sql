-- Named Schema_V1_* so it sorts after Schema_Product_Admin.sql (adds products.updated_at); Schema::apply runs files in name order.
-- Client API keys (B-21, owner 2026-10-14): read-only /api/v1, one customer may hold up to 5 active keys.
-- Only sha256(key) and a short prefix are stored; the plain key is shown once, when it is created.
-- scope 'all' = whole catalogue; 'list' = only skus (JSON array) and/or categories (JSON array).
-- created_by: 'customer' (Moje konto) or 'admin' (panel). revoked_at set = the key no longer works.
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'list')),
  skus TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(skus)),
  categories TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(categories)),
  created_by TEXT NOT NULL CHECK (created_by IN ('customer', 'admin')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT,
  request_count INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys (user_id);

-- updatedSince in /api/v1 reads products.updated_at. Until now the import left it NULL;
-- from here on the import sets it on a real change, so every product starts from its import time.
UPDATE products SET updated_at = imported_at WHERE updated_at IS NULL;
CREATE INDEX IF NOT EXISTS products_updated_at_idx ON products (updated_at);
