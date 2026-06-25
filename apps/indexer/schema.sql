CREATE TABLE IF NOT EXISTS indexer_state (
  id TEXT PRIMARY KEY,
  last_block BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  plan_id NUMERIC PRIMARY KEY,
  merchant TEXT NOT NULL,
  token TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  interval_seconds NUMERIC NOT NULL,
  grace_period_seconds NUMERIC NOT NULL,
  metadata_uri TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_block BIGINT NOT NULL,
  created_tx TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id NUMERIC PRIMARY KEY,
  plan_id NUMERIC NOT NULL REFERENCES plans(plan_id),
  subscriber TEXT NOT NULL,
  next_charge_at NUMERIC NOT NULL,
  canceled BOOLEAN NOT NULL DEFAULT FALSE,
  created_block BIGINT NOT NULL,
  created_tx TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  invoice_id NUMERIC PRIMARY KEY,
  subscription_id NUMERIC NOT NULL,
  plan_id NUMERIC NOT NULL,
  subscriber TEXT NOT NULL,
  merchant TEXT NOT NULL,
  token TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  paid_at NUMERIC NOT NULL,
  next_charge_at NUMERIC NOT NULL,
  status TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber ON subscriptions (subscriber);
CREATE INDEX IF NOT EXISTS idx_plans_merchant ON plans (merchant);
CREATE INDEX IF NOT EXISTS idx_invoices_merchant ON invoices (merchant);
CREATE INDEX IF NOT EXISTS idx_invoices_subscriber ON invoices (subscriber);

