# agent-spend-collector

**See and govern every dollar your AI agents spend, across every rail.**

A free, read-only, cross-rail **agent spend collector**. It pulls what your agents
spend (LLM token cost + x402 payments + Stripe card payments today; USDC next),
normalizes it into **one [FOCUS](https://focus.finops.org/)-shaped ledger**, and
flags anomalies: runaway loops, cost spikes, budget burn. **It never touches your
money** (read-only), so it clears security review on day one.

> Why this exists: FinOps tools track token cost, payment startups track payments.
> Nobody gives you one neutral book of record across all of it, and nobody reads
> agent spend as a security signal. A cost spike is also how a hijacked key or a
> prompt-injected agent can look. That gap is the product.

## Quick start (no dependencies, no keys)

```bash
python3 -m spend_collector demo
```

Runs the full loop on mock data:

```text
fixtures -> one ledger -> anomaly detectors -> report.html
```

Open `report.html` in a browser.

## What the demo proves

The demo is a small product story, not random sample data. It reads public fixtures
from `fixtures/`:

| Fixture | Purpose |
|---|---|
| `llm_usage.json` | LLM token baseline, runaway token spike, and a new high-spend key |
| `x402_settlements.json` | Paid API calls settled in USDC on the x402 rail |
| `stripe_events.json` | Stripe card payments with agent/budget metadata |
| `budgets.json` | Team caps used by the budget detectors |

Those fixtures intentionally trigger the core Phase-0 signals:

| Signal | Why it fires |
|---|---|
| `spend_spike` | `research-bot` has four tiny LLM calls, then one runaway token-heavy call |
| `spend_per_task` | The same runaway request is expensive versus the agent's task baseline |
| `budget_burn` | `team-support` crosses its budget after x402 + Stripe + token spend |
| `budget_burn_rate` | Recent spend is burning monthly budgets too quickly |
| `new_key_spike` | `new-key-bot` appears for the first time with a large LLM charge |
| `new_merchant_provider` | `support-bot` spends at a first-seen paid API/card merchant |

The point is to prove the wedge: token cost, paid API spend, and card payments can
land in one neutral ledger, and abnormal spend can become a security signal.

## Dashboard

Every command that ingests data runs the detectors. The `demo` command also writes
the static dashboard:

```bash
python3 -m spend_collector demo
open report.html
```

On Windows, open `report.html` from Explorer or run:

```powershell
start report.html
```

The dashboard shows total spend, alert counts, rail mix, budget burn, Phase-0
security signals, agent-by-rail totals, and recent ledger events. It is a local
HTML file with no server and no external assets.

## Real data (read-only)

```bash
# LLM token cost (admin/usage key, read-only)
export ANTHROPIC_ADMIN_KEY=sk-ant-admin01-...
python3 -m spend_collector pull

# x402 payments: USDC settlements into your merchant address on Base
python3 -m spend_collector pull-x402 0xYourReceivingAddress

# card payments: Stripe succeeded PaymentIntents (restricted read key)
export STRIPE_SECRET_KEY=rk_live_...
python3 -m spend_collector pull-stripe
```

All commands write to `spend.db` and run the detectors. Attribution:

- LLM: one API key per agent.
- x402: payer wallet.
- Stripe: `PaymentIntent.metadata.agent_id` and `metadata.budget_id`.

OpenAI and OpenRouter can follow the Anthropic cost-report shape.

## What's inside

| File | Role |
|---|---|
| `schema.py` | FOCUS-shaped `SpendEvent` (one row shape for every rail) |
| `store.py` | Append-only, idempotent SQLite ledger + summaries |
| `adapters.py` | Normalizers: token usage / x402 settlements / Stripe events -> ledger rows |
| `sources.py` | Live read-only pulls: Anthropic cost API, Base USDC logs, Stripe Events API |
| `detectors.py` | Phase-0 anomaly signals: spend spikes, burn-rate, task cost, new keys, new merchants |
| `report.py` | Zero-dependency static HTML dashboard |

## The detection ceiling

Read-only detects, alerts, and keeps evidence. It cannot block a payment. Stopping
spend needs inline enforcement (LLM gateway / x402 middleware), and the unbypassable
backstop is on-chain caps (ERC-7715 / Coinbase Spend Permissions). That's the
roadmap:

```text
detect -> inline -> on-chain
```

## Roadmap

1. Done: closed loop on mock data (ingest -> ledger -> detect -> report).
2. Done: real Anthropic cost pull (`pull`).
3. Done: real x402 pull, on-chain USDC on Base (`pull-x402`).
4. Done: Stripe Events rail, token + crypto + card in one ledger (`pull-stripe`).
5. Done: richer Phase-0 detectors (multi-window burn-rate, spend-per-task, new key, new merchant/provider).
6. Next: Grafana/Metabase on the DB; LLMjacking-specific enrichments.
7. Later: inline enforcement (gateway/middleware), Phase 1.

Requires Python 3.10+. No dependencies. License: MIT.
