import { NextResponse } from "next/server";
import pg from "pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const limit = 5;

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
    return NextResponse.json({
      configured: false,
      lastIndexedBlock: null,
      plans: [],
      subscriptions: [],
      invoices: [],
      error: "DATABASE_URL is not configured."
    });
  }

  try {
    const [stateResult, plansResult, subscriptionsResult, invoicesResult] = await Promise.all([
      db.query("SELECT last_block FROM indexer_state WHERE id = $1", ["subchain"]),
      db.query(
        `SELECT plan_id::text, merchant, amount::text, active, metadata_uri
         FROM plans
         ORDER BY plan_id DESC
         LIMIT $1`,
        [limit]
      ),
      db.query(
        `SELECT subscription_id::text, plan_id::text, subscriber, canceled, next_charge_at::text
         FROM subscriptions
         ORDER BY subscription_id DESC
         LIMIT $1`,
        [limit]
      ),
      db.query(
        `SELECT invoice_id::text, subscription_id::text, merchant, subscriber, amount::text, status
         FROM invoices
         ORDER BY invoice_id DESC
         LIMIT $1`,
        [limit]
      )
    ]);

    return NextResponse.json({
      configured: true,
      lastIndexedBlock: stateResult.rows[0]?.last_block?.toString() ?? null,
      plans: plansResult.rows,
      subscriptions: subscriptionsResult.rows,
      invoices: invoicesResult.rows
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indexer database query failed.";

    return NextResponse.json(
      {
        configured: true,
        lastIndexedBlock: null,
        plans: [],
        subscriptions: [],
        invoices: [],
        error: message
      },
      { status: 503 }
    );
  }
}
