-- ============================================================
-- Auto-populate Telecel prices for ALL existing active agents
-- Uses admin floor prices as the starting agent_price
-- Agents earn zero Telecel profit until they adjust in dashboard
-- Run once in Supabase SQL Editor
-- ============================================================

INSERT INTO agent_prices (
  agent_id,
  bundle_key,
  network,
  size,
  volume,
  hubnet_cost,
  admin_price,
  agent_price,
  agent_profit,
  validity,
  updated_at
)
SELECT
  a.id                   AS agent_id,
  ap.bundle_key,
  ap.network,
  ap.size,
  ap.volume,
  ap.hubnet_cost,
  ap.selling_price       AS admin_price,
  ap.selling_price       AS agent_price,   -- starts at floor, zero profit
  0                      AS agent_profit,
  ap.validity,
  now()                  AS updated_at
FROM agents a
CROSS JOIN admin_prices ap
WHERE
  a.status = 'active'
  AND ap.network = 'telecel'
  -- Skip if this agent already has a Telecel price saved
  AND NOT EXISTS (
    SELECT 1 FROM agent_prices existing
    WHERE existing.agent_id  = a.id
      AND existing.bundle_key = ap.bundle_key
  )
ORDER BY a.id, ap.bundle_key;

-- Show what was inserted
SELECT
  a.name       AS agent_name,
  ap2.bundle_key,
  ap2.agent_price,
  ap2.agent_profit
FROM agent_prices ap2
JOIN agents a ON a.id = ap2.agent_id
WHERE ap2.network = 'telecel'
ORDER BY a.name, ap2.bundle_key;
