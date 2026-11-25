-- B-22 InPost (R-02, R-03, R-07): one row per ShipX shipment bought for an order.
-- An order may have several. Status + tracking number are refreshed from ShipX
-- (webhook re-fetch, refresh when an order is viewed, cron scripts/Inpost_Refresh.php).
-- Failed create attempts are never stored (R-09).
CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  inpost_id INTEGER NOT NULL UNIQUE,
  service TEXT NOT NULL,
  target_point TEXT,
  target_point_info TEXT CHECK (target_point_info IS NULL OR json_valid(target_point_info)),
  parcel TEXT NOT NULL CHECK (json_valid(parcel)),
  status TEXT NOT NULL,
  tracking_number TEXT,
  events TEXT CHECK (events IS NULL OR json_valid(events)),
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shipments_order_idx ON shipments (order_id, created_at);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON shipments (status, checked_at);
