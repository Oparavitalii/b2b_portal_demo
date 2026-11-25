-- Admin can block a customer account (blind test 2026-10-01, Pilot_Run 2026-10-08).
-- NULL = not blocked. A blocked user does not authenticate (Core/Auth.php isActive).
ALTER TABLE users ADD COLUMN blocked_at TEXT;
