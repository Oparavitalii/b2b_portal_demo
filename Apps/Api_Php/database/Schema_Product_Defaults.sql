-- Default stock and delivery time per category (owner, 2026-10-12):
-- pumps and AdBlue tanks 1 piece / 72 h, injectors 4 pieces / 24 h (the earlier default:
-- 4 pieces, automatic time). New products get them from ProductsService::stockDefaults().
-- Only rows still on the old default change: what the admin set in the panel stays.
UPDATE products SET stock = 1, lead_time_hours = 72
WHERE category IN ('Pompy CR', 'Zbiorniki AdBlue') AND stock = 4 AND lead_time_hours IS NULL;
