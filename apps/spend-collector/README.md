# spend-collector

Read-only, cross-rail **agent spend collector** — the thinnest slice of the Agent
Spend Governance plane (see [docs/ecosystem.md §9–§10](../../docs/ecosystem.md) and
[docs/mvp-spend-ledger.md](../../docs/mvp-spend-ledger.md)).

It normalizes **LLM token cost + x402 payments** into **one FOCUS-shaped ledger**,
queryable by agent / rail / budget. That unification is the thing the research found
nobody ships: FinOps tools cover tokens, payment startups cover payments, none cover
both — and none cross-rail.

## Run

```bash
cd apps/spend-collector
python3 -m spend_collector demo
```

No dependencies — stdlib only (`sqlite3`). The `demo` ingests mock LLM + x402 events
and prints the unified ledger, then runs an assert-based self-check.

## What's real vs stubbed

- **Real:** the FOCUS-shaped schema ([schema.py](spend_collector/schema.py)), the
  append-only idempotent store ([store.py](spend_collector/store.py)), and the two
  normalizers ([adapters.py](spend_collector/adapters.py)).
- **Stubbed:** the adapters take already-fetched records. The `TODO`s mark where to
  wire the real **read-only** pull:
  - LLM: OpenAI `GET /v1/organization/costs` (admin key) / Anthropic `cost_report` / LiteLLM spend API.
  - x402: facilitator `/settle` `PAYMENT-RESPONSE` receipts, or Dune `x402-analytics` / Allium x402 API.

## Reuse vs build

- **Reuse:** `tokencost` (pricing) · Dune/Allium (x402 history) · Grafana/Metabase
  (point at the SQLite/Postgres table — no custom frontend) · FOCUS column spec (schema).
- **Build (the product):** the two ingestion adapters + the FOCUS normalizer. That's it.

## Roadmap (thinnest -> real, ~4–5 days/dev to real)

1. Wire real LLM cost API + x402 receipt pulls (replace mock data).
2. Persist to Postgres/DuckDB; point Grafana at it for the "spend by agent/workflow/team" dashboard.
3. Add the Stripe rail (Events API) for a real-money cross-rail story.
4. Layer anomaly signals on top (spend spike / off-policy merchant / velocity break) —
   the security framing (see ecosystem §10.1).

## Design notes

- **Read-only / no-touch-money** is the architecture, not a feature — clears the
  security veto up front.
- `event_id` is deterministic per source event → re-ingest is idempotent (no double-counting).
- `x_*` columns are FOCUS extension fields carrying the agent graph (agent / session /
  budget / merchant / receipt).
