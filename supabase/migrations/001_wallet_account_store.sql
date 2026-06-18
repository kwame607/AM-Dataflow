-- ============================================================
-- DATAFLOW — Migration: Wallet + Account + Store System
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Agent Profiles (extend existing) ─────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone_number          TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number       TEXT,
  ADD COLUMN IF NOT EXISTS store_name            TEXT,
  ADD COLUMN IF NOT EXISTS store_slug            TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS store_description     TEXT,
  ADD COLUMN IF NOT EXISTS store_logo_url        TEXT,
  ADD COLUMN IF NOT EXISTS store_banner_url      TEXT,
  ADD COLUMN IF NOT EXISTS store_slogan          TEXT,
  ADD COLUMN IF NOT EXISTS store_primary_color   TEXT NOT NULL DEFAULT '#0066CC',
  ADD COLUMN IF NOT EXISTS store_secondary_color TEXT NOT NULL DEFAULT '#FFD700',
  ADD COLUMN IF NOT EXISTS store_whatsapp_link   TEXT,
  ADD COLUMN IF NOT EXISTS store_show_prices     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS store_visible_networks TEXT[] NOT NULL DEFAULT ARRAY['MTN','Telecel','AirtelTigo'];

-- ─── Wallets ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wallets (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  pending_balance  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
  locked_balance   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  total_deposited  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_spent      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_withdrawn  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id)
);

CREATE INDEX IF NOT EXISTS idx_wallets_agent_id ON wallets(agent_id);

-- ─── Wallet Transactions ──────────────────────────────────

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id      UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  agent_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('deposit','purchase','refund','withdrawal','adjustment','bonus','reversal')),
  amount         NUMERIC(12,2) NOT NULL,
  balance_before NUMERIC(12,2) NOT NULL,
  balance_after  NUMERIC(12,2) NOT NULL,
  reference      TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','reversed')),
  description    TEXT NOT NULL,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_agent_id  ON wallet_transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_reference ON wallet_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type      ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_status    ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created   ON wallet_transactions(created_at DESC);

-- ─── Deposit Claims ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS deposit_claims (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  network        TEXT NOT NULL CHECK (network IN ('MTN','Telecel','AirtelTigo')),
  sender_number  TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  proof_url      TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  admin_note     TEXT,
  reviewed_by    UUID REFERENCES auth.users(id),
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_claims_tx_id ON deposit_claims(transaction_id);
CREATE INDEX IF NOT EXISTS idx_deposit_claims_agent   ON deposit_claims(agent_id);
CREATE INDEX IF NOT EXISTS idx_deposit_claims_status  ON deposit_claims(status);

-- ─── Wallet auto-create trigger ───────────────────────────

CREATE OR REPLACE FUNCTION create_wallet_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO wallets (agent_id)
  VALUES (NEW.id)
  ON CONFLICT (agent_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_wallet ON auth.users;
CREATE TRIGGER on_auth_user_created_wallet
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_wallet_for_new_user();

-- ─── Updated_at trigger ───────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Atomic wallet deduction (prevents double-spend) ──────

CREATE OR REPLACE FUNCTION deduct_wallet_balance(
  p_agent_id    UUID,
  p_amount      NUMERIC,
  p_reference   TEXT,
  p_description TEXT,
  p_metadata    JSONB DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, transaction_id UUID, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet        wallets%ROWTYPE;
  v_transaction   wallet_transactions%ROWTYPE;
BEGIN
  -- Lock the wallet row
  SELECT * INTO v_wallet
  FROM wallets
  WHERE agent_id = p_agent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Wallet not found';
    RETURN;
  END IF;

  IF v_wallet.balance < p_amount THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Insufficient balance';
    RETURN;
  END IF;

  -- Check for duplicate reference
  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE reference = p_reference) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Duplicate transaction reference';
    RETURN;
  END IF;

  -- Deduct and lock
  UPDATE wallets
  SET
    balance        = balance - p_amount,
    locked_balance = locked_balance + p_amount,
    updated_at     = NOW()
  WHERE agent_id = p_agent_id;

  -- Create transaction record
  INSERT INTO wallet_transactions
    (wallet_id, agent_id, type, amount, balance_before, balance_after, reference, status, description, metadata)
  VALUES
    (v_wallet.id, p_agent_id, 'purchase', p_amount, v_wallet.balance, v_wallet.balance - p_amount, p_reference, 'pending', p_description, p_metadata)
  RETURNING * INTO v_transaction;

  RETURN QUERY SELECT TRUE, v_transaction.id, NULL::TEXT;
END;
$$;

-- ─── Confirm wallet deduction (after successful order) ────

CREATE OR REPLACE FUNCTION confirm_wallet_deduction(
  p_reference TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tx wallet_transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_tx FROM wallet_transactions WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND OR v_tx.status != 'pending' THEN RETURN FALSE; END IF;

  UPDATE wallets
  SET
    locked_balance = locked_balance - v_tx.amount,
    total_spent    = total_spent + v_tx.amount,
    updated_at     = NOW()
  WHERE id = v_tx.wallet_id;

  UPDATE wallet_transactions SET status = 'success' WHERE reference = p_reference;
  RETURN TRUE;
END;
$$;

-- ─── Refund wallet (on failed order) ─────────────────────

CREATE OR REPLACE FUNCTION refund_wallet_balance(
  p_original_reference TEXT,
  p_description        TEXT DEFAULT 'Order failed - refund'
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tx wallet_transactions%ROWTYPE;
  v_wallet wallets%ROWTYPE;
BEGIN
  SELECT * INTO v_tx
  FROM wallet_transactions
  WHERE reference = p_original_reference AND type = 'purchase'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT * INTO v_wallet FROM wallets WHERE id = v_tx.wallet_id FOR UPDATE;

  -- Unlock and restore
  UPDATE wallets
  SET
    balance        = balance + v_tx.amount,
    locked_balance = GREATEST(locked_balance - v_tx.amount, 0),
    updated_at     = NOW()
  WHERE id = v_tx.wallet_id;

  UPDATE wallet_transactions SET status = 'reversed' WHERE reference = p_original_reference;

  -- Create refund record
  INSERT INTO wallet_transactions
    (wallet_id, agent_id, type, amount, balance_before, balance_after, reference, status, description, metadata)
  VALUES
    (v_wallet.id, v_tx.agent_id, 'refund', v_tx.amount, v_wallet.balance, v_wallet.balance + v_tx.amount,
     'REFUND-' || p_original_reference, 'success', p_description,
     jsonb_build_object('original_reference', p_original_reference));

  RETURN TRUE;
END;
$$;

-- ─── Credit wallet (deposit / admin) ─────────────────────

CREATE OR REPLACE FUNCTION credit_wallet_balance(
  p_agent_id    UUID,
  p_amount      NUMERIC,
  p_reference   TEXT,
  p_type        TEXT,  -- 'deposit', 'bonus', 'adjustment', 'reversal'
  p_description TEXT,
  p_metadata    JSONB DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
BEGIN
  SELECT * INTO v_wallet FROM wallets WHERE agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE reference = p_reference) THEN
    RETURN FALSE;
  END IF;

  UPDATE wallets
  SET
    balance         = balance + p_amount,
    total_deposited = CASE WHEN p_type = 'deposit' THEN total_deposited + p_amount ELSE total_deposited END,
    updated_at      = NOW()
  WHERE agent_id = p_agent_id;

  INSERT INTO wallet_transactions
    (wallet_id, agent_id, type, amount, balance_before, balance_after, reference, status, description, metadata)
  VALUES
    (v_wallet.id, p_agent_id, p_type, p_amount, v_wallet.balance, v_wallet.balance + p_amount, p_reference, 'success', p_description, p_metadata);

  RETURN TRUE;
END;
$$;

-- ─── Monthly spend helper ─────────────────────────────────

CREATE OR REPLACE FUNCTION get_monthly_spend(p_agent_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM wallet_transactions
  WHERE agent_id = p_agent_id
    AND type = 'purchase'
    AND status = 'success'
    AND date_trunc('month', created_at) = date_trunc('month', NOW());
$$;

-- ─── RLS ──────────────────────────────────────────────────

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_claims ENABLE ROW LEVEL SECURITY;

-- Wallets
CREATE POLICY "agents_select_own_wallet" ON wallets
  FOR SELECT USING (auth.uid() = agent_id);

CREATE POLICY "admin_all_wallets" ON wallets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Wallet Transactions
CREATE POLICY "agents_select_own_transactions" ON wallet_transactions
  FOR SELECT USING (auth.uid() = agent_id);

CREATE POLICY "admin_all_transactions" ON wallet_transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Deposit Claims
CREATE POLICY "agents_manage_own_claims" ON deposit_claims
  FOR ALL USING (auth.uid() = agent_id);

CREATE POLICY "admin_all_claims" ON deposit_claims
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── Storage buckets ─────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('store-assets', 'store-assets', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('deposit-proofs', 'deposit-proofs', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "agents_upload_store_assets" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'store-assets' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "public_read_store_assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'store-assets');

CREATE POLICY "agents_upload_deposit_proofs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'deposit-proofs' AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "admin_read_deposit_proofs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'deposit-proofs' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
