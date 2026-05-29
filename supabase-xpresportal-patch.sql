-- ============================================================
-- ADMUNZ — Schema patch for XpresPortal migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Nothing structural needs to change in the database schema.
-- The 'network' column in orders and agent_prices already stores
-- text values, so 'telecel' works fine without any migration.

-- However, if you have a CHECK constraint on the network column,
-- add telecel to it:

-- Check if any constraint exists (run this first to check):
-- SELECT conname, consrc FROM pg_constraint WHERE conname LIKE '%network%';

-- If you see a constraint, run:
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_network_check;
-- ALTER TABLE agent_prices DROP CONSTRAINT IF EXISTS agent_prices_network_check;
-- ALTER TABLE admin_prices DROP CONSTRAINT IF EXISTS admin_prices_network_check;
-- ALTER TABLE withdrawals DROP CONSTRAINT IF EXISTS withdrawals_network_check;

-- Add Telecel bundles to admin_prices for the existing site
-- (agents can then set their prices on top of these)
-- You should set actual prices via the admin panel,
-- but this inserts defaults for Telecel so the store works immediately.

INSERT INTO admin_prices (bundle_key, network, size, volume, hubnet_cost, selling_price, store_price, admin_profit, validity)
VALUES
  ('tel_5gb',   'telecel', '5GB',   '5000',   19.00, 20.00, 20.00, 1.00, '90 days'),
  ('tel_10gb',  'telecel', '10GB',  '10000',  36.00, 38.00, 38.00, 2.00, '90 days'),
  ('tel_15gb',  'telecel', '15GB',  '15000',  53.00, 55.00, 55.00, 2.00, '90 days'),
  ('tel_20gb',  'telecel', '20GB',  '20000',  71.00, 74.00, 74.00, 3.00, '90 days'),
  ('tel_25gb',  'telecel', '25GB',  '25000',  88.00, 91.00, 91.00, 3.00, '90 days'),
  ('tel_30gb',  'telecel', '30GB',  '30000',  105.00, 109.00, 109.00, 4.00, '90 days'),
  ('tel_40gb',  'telecel', '40GB',  '40000', 140.00,145.00,145.00, 5.00, '90 days'),
  ('tel_50gb',  'telecel', '50GB',  '50000', 175.00,180.00,180.00, 5.00, '90 days'),
  ('tel_100gb', 'telecel', '100GB', '100000',345.00,355.00,355.00, 10.00, '90 days')
ON CONFLICT (bundle_key) DO NOTHING;

-- ============================================================
-- DONE
-- ============================================================
