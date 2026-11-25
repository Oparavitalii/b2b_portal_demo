-- Admin product editing (Pilot_Run 2026-10-10): stock and delivery time set in the panel,
-- products added by hand. Every existing product starts with 4 pieces (owner, 2026-10-10).
-- lead_time_hours NULL = automatic (all pieces in stock → 24 h, otherwise 72 h).
-- source 'manual' = added in the panel: the JSON import never hides it.
-- The import never writes stock or lead_time_hours; orders never lower stock.
ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 4 CHECK (stock >= 0);
ALTER TABLE products ADD COLUMN lead_time_hours INTEGER CHECK (lead_time_hours IS NULL OR lead_time_hours IN (24, 48, 72));
ALTER TABLE products ADD COLUMN source TEXT NOT NULL DEFAULT 'import' CHECK (source IN ('import', 'manual'));
ALTER TABLE products ADD COLUMN updated_at TEXT;
-- 1 = hidden by the admin: the import keeps it hidden (otherwise every product in the file is shown).
ALTER TABLE products ADD COLUMN admin_hidden INTEGER NOT NULL DEFAULT 0 CHECK (admin_hidden IN (0, 1));
