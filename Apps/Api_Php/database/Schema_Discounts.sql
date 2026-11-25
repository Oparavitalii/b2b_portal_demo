-- Per-product rabaty and szablony rabatów (Pilot_Run 2026-10-16).
-- A rule gives one % (0–100, step 0.5) to a category (products.category, exact) or a
-- product (SKU). It belongs either to a szablon (template_id) or to one customer
-- (user_id, "custom"). A customer links to at most one szablon, live: editing the
-- szablon moves that customer's prices at once. Resolution (Discount_Policy.php):
-- custom product → custom category → szablon product → szablon category → users.discount_percent.
CREATE TABLE IF NOT EXISTS discount_templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS discount_rules (
  id TEXT PRIMARY KEY NOT NULL,
  template_id TEXT REFERENCES discount_templates (id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('category', 'product')),
  target TEXT NOT NULL,
  percent REAL NOT NULL CHECK (percent >= 0 AND percent <= 100),
  CHECK ((template_id IS NULL) <> (user_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS discount_rules_template_idx ON discount_rules (template_id, target_type, target) WHERE template_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS discount_rules_user_idx ON discount_rules (user_id, target_type, target) WHERE user_id IS NOT NULL;

ALTER TABLE users ADD COLUMN discount_template_id TEXT REFERENCES discount_templates (id) ON DELETE SET NULL;

-- The % each order line was priced with. NULL on orders sent before this file: the order-level % applies.
ALTER TABLE order_items ADD COLUMN discount_percent REAL CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));
