CREATE TABLE IF NOT EXISTS indexer_state (
  id TEXT PRIMARY KEY,
  last_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chain_cursors (
  chain_id NUMERIC NOT NULL,
  cursor_name TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, cursor_name)
);

CREATE TABLE IF NOT EXISTS plans (
  chain_id NUMERIC NOT NULL DEFAULT 31337,
  plan_id NUMERIC NOT NULL,
  merchant TEXT NOT NULL,
  token TEXT NOT NULL,
  price NUMERIC NOT NULL,
  period_seconds NUMERIC NOT NULL,
  included_units NUMERIC NOT NULL,
  grace_period_seconds NUMERIC NOT NULL,
  version NUMERIC NOT NULL,
  service_id TEXT NOT NULL,
  service_metadata_hash TEXT NOT NULL,
  metadata_uri TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_block BIGINT NOT NULL,
  created_tx TEXT NOT NULL,
  PRIMARY KEY (chain_id, plan_id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  chain_id NUMERIC NOT NULL DEFAULT 31337,
  subscription_id NUMERIC NOT NULL,
  plan_id NUMERIC NOT NULL,
  owner TEXT NOT NULL,
  plan_version NUMERIC NOT NULL,
  status TEXT NOT NULL,
  current_period_start NUMERIC NOT NULL DEFAULT 0,
  next_charge_at NUMERIC NOT NULL,
  grace_ends_at NUMERIC NOT NULL DEFAULT 0,
  period_index NUMERIC NOT NULL DEFAULT 0,
  used_units NUMERIC NOT NULL DEFAULT 0,
  service_id TEXT NOT NULL,
  created_block BIGINT NOT NULL,
  created_tx TEXT NOT NULL,
  PRIMARY KEY (chain_id, subscription_id)
);

CREATE TABLE IF NOT EXISTS invoices (
  chain_id NUMERIC NOT NULL DEFAULT 31337,
  invoice_id NUMERIC NOT NULL,
  invoice_key TEXT NOT NULL,
  subscription_id NUMERIC NOT NULL,
  plan_id NUMERIC NOT NULL,
  period_index NUMERIC NOT NULL,
  subscriber TEXT NOT NULL,
  merchant TEXT NOT NULL,
  token TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  due_at NUMERIC NOT NULL,
  paid_at NUMERIC NOT NULL DEFAULT 0,
  next_charge_at NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  PRIMARY KEY (chain_id, invoice_id),
  UNIQUE (chain_id, invoice_key)
);

CREATE TABLE IF NOT EXISTS x402_payments (
  payment_identifier TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_usage (
  id BIGSERIAL PRIMARY KEY,
  trace_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  service_id TEXT NOT NULL,
  subscription_id NUMERIC,
  payment_identifier TEXT,
  units NUMERIC NOT NULL,
  source TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  latency_ms NUMERIC NOT NULL DEFAULT 0,
  artifact_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_actions (
  id BIGSERIAL PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  expected_cost NUMERIC NOT NULL,
  expected_value NUMERIC NOT NULL,
  policy_result JSONB NOT NULL,
  execution_result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_cycles (
  cycle_id TEXT PRIMARY KEY,
  trigger_reason TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS economic_metrics (
  id BIGSERIAL PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  pay_per_use_cost NUMERIC NOT NULL,
  subscription_cost NUMERIC NOT NULL,
  projected_savings NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduler_jobs (
  id BIGSERIAL PRIMARY KEY,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  attempt NUMERIC NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON subscriptions (owner);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_plans_merchant ON plans (merchant);
CREATE INDEX IF NOT EXISTS idx_invoices_merchant ON invoices (merchant);
CREATE INDEX IF NOT EXISTS idx_invoices_subscriber ON invoices (subscriber);
CREATE INDEX IF NOT EXISTS idx_service_usage_trace ON service_usage (trace_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_cycle ON agent_actions (cycle_id);
