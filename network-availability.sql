-- ============================================================
-- Global network on/off switch (maintenance mode per telecom)
-- Run once in Supabase SQL Editor
-- ============================================================

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS disabled_networks text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS network_messages  jsonb   NOT NULL DEFAULT '{}'::jsonb;

-- Optional: switch MTN off right now with a message
-- UPDATE app_settings
-- SET disabled_networks = ARRAY['mtn'],
--     network_messages  = '{"mtn":"MTN is under maintenance. Back on 1st December."}'
-- WHERE id = 1;
