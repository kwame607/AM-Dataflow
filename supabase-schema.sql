-- ============================================================
-- DataFlow GH — Supabase Database Setup
-- Run this entire file in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ykmptuwoxqcwhqbovpvb/sql/new
-- ============================================================

-- ─────────────────────────────────────────
-- PATCH: run these if you already ran the schema once
-- ─────────────────────────────────────────
ALTER TABLE agents ADD COLUMN IF NOT EXISTS store_name text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status text not null default 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- 1. AGENTS
-- ─────────────────────────────────────────
create table if not exists agents (
  id              uuid primary key default uuid_generate_v4(),
  auth_user_id    uuid references auth.users(id) on delete cascade,
  name            text not null,
  email           text not null unique,
  phone           text not null,
  whatsapp        text,
  slug            text not null unique,
  store_name      text,
  status          text not null default 'pending',  -- pending | active | suspended
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

-- ─────────────────────────────────────────
-- 2. ORDERS
-- ─────────────────────────────────────────
create table if not exists orders (
  id                    uuid primary key default uuid_generate_v4(),
  reference             text not null unique,
  phone                 text not null,
  network               text not null,
  bundle_key            text not null,
  size                  text not null,
  volume                text not null,
  hubnet_cost           numeric(10,2) not null default 0,
  admin_price           numeric(10,2) not null default 0,
  agent_price           numeric(10,2) not null default 0,
  admin_profit          numeric(10,2) not null default 0,
  agent_profit          numeric(10,2) not null default 0,
  agent_id              uuid references agents(id) on delete set null,
  agent_slug            text,
  source                text not null default 'main',  -- main | agent
  status                text not null default 'processing',  -- processing | success | failed
  paystack_ref          text,
  hubnet_transaction_id text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);

-- ─────────────────────────────────────────
-- 3. ADMIN PRICES
-- ─────────────────────────────────────────
create table if not exists admin_prices (
  id            uuid primary key default uuid_generate_v4(),
  bundle_key    text not null unique,
  network       text not null,
  size          text not null,
  volume        text not null,
  hubnet_cost   numeric(10,2) not null,
  selling_price numeric(10,2) not null,
  admin_profit  numeric(10,2) not null default 0,
  validity      text not null default '90 days',
  updated_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- 4. AGENT PRICES
-- ─────────────────────────────────────────
create table if not exists agent_prices (
  id           uuid primary key default uuid_generate_v4(),
  agent_id     uuid not null references agents(id) on delete cascade,
  bundle_key   text not null,
  network      text not null,
  size         text not null,
  volume       text not null,
  hubnet_cost  numeric(10,2) not null,
  admin_price  numeric(10,2) not null,
  agent_price  numeric(10,2) not null,
  agent_profit numeric(10,2) not null default 0,
  validity     text not null default '90 days',
  updated_at   timestamptz default now(),
  unique (agent_id, bundle_key)
);

-- ─────────────────────────────────────────
-- 5. WITHDRAWALS
-- ─────────────────────────────────────────
create table if not exists withdrawals (
  id           uuid primary key default uuid_generate_v4(),
  type         text not null default 'agent',  -- agent | admin
  agent_id     uuid references agents(id) on delete set null,
  amount       numeric(10,2) not null,
  momo_number  text not null,
  momo_name    text not null,
  network      text not null,
  status       text not null default 'pending',  -- pending | approved | paid | rejected
  note         text,
  requested_at timestamptz not null default now(),
  resolved_at  timestamptz
);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY (disable for admin client)
-- The app uses the service_role key server-side which bypasses RLS.
-- Enable RLS but add no policies — the anon key cannot read/write directly.
-- ─────────────────────────────────────────
alter table agents       enable row level security;
alter table orders       enable row level security;
alter table admin_prices enable row level security;
alter table agent_prices enable row level security;
alter table withdrawals  enable row level security;

-- Allow public read on admin_prices (store pages fetch prices without auth)
drop policy if exists "Public read admin_prices" on admin_prices;
create policy "Public read admin_prices"
  on admin_prices for select using (true);

-- ─────────────────────────────────────────
-- DONE — all tables created.
-- ─────────────────────────────────────────
