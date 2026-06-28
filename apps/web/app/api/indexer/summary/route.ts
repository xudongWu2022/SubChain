import { NextResponse } from "next/server";
import pg from "pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const limit = 8;
let pool: pg.Pool | null = null;

function getPool() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function GET() {
  const db = getPool();

  if (!db) {
    return NextResponse.json(emptySummary("DATABASE_URL is not configured."));
  }

  try {
    const [
      stateResult,
      plansResult,
      subscriptionsResult,
      invoicesResult,
      usageResult,
      actionsResult,
      paymentsResult
    ] = await Promise.all([
      db.query("SELECT last_block FROM indexer_state WHERE id = $1", ["subchain"]),
      db.query(
        `SELECT chain_id::text, plan_id::text, merchant, price::text, active, service_id, included_units::text, metadata_uri
         FROM plans
         ORDER BY plan_id DESC
         LIMIT $1`,
        [limit]
      ),
      db.query(
        `SELECT chain_id::text, subscription_id::text, plan_id::text, owner, status, next_charge_at::text, used_units::text
         FROM subscriptions
         ORDER BY subscription_id DESC
         LIMIT $1`,
        [limit]
      ),
      db.query(
        `SELECT chain_id::text, invoice_id::text, invoice_key, subscription_id::text, merchant, subscriber, amount::text, status
         FROM invoices
         ORDER BY invoice_id DESC
         LIMIT $1`,
        [limit]
      ),
      db.query(
        `SELECT trace_id, owner, service_id, subscription_id::text, payment_identifier, units::text, source, success, created_at
         FROM service_usage
         ORDER BY id DESC
         LIMIT $1`,
        [limit]
      ),
      db.query(
        `SELECT cycle_id, action, target_id, expected_cost::text, expected_value::text, policy_result, execution_result, created_at
         FROM agent_actions
         ORDER BY id DESC
         LIMIT $1`,
        [limit]
      ),
      db.query(
        `SELECT payment_identifier, status, amount::text, settled_at
         FROM x402_payments
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      )
    ]);

    return NextResponse.json({
      configured: true,
      lastIndexedBlock: stateResult.rows[0]?.last_block?.toString() ?? null,
      plans: plansResult.rows,
      subscriptions: subscriptionsResult.rows,
      invoices: invoicesResult.rows,
      serviceUsage: usageResult.rows,
      agentActions: actionsResult.rows,
      x402Payments: paymentsResult.rows
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indexer database query failed.";
    return NextResponse.json(emptySummary(message, true), { status: 503 });
  }
}

function emptySummary(error: string, configured = false) {
  return {
    configured,
    lastIndexedBlock: null,
    plans: [],
    subscriptions: [],
    invoices: [],
    serviceUsage: [],
    agentActions: [],
    x402Payments: [],
    error
  };
}
