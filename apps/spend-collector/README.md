# spend-collector

**See — and govern — every dollar your AI agents spend, across every rail.**

A free, read-only, cross-rail **agent spend collector**. It pulls what your agents
spend (LLM token cost + x402 payments today; cards / Stripe / USDC next), normalizes
it into **one [FOCUS](https://focus.finops.org/)-shaped ledger**, and flags anomalies
— runaway loops, cost spikes, budget burn. **It never touches your money** (read-only),
so it clears security review on day one.

> Why this exists: FinOps tools track token cost, payment startups track payments —
> **nobody gives you one neutral book of record across all of it**, and nobody reads
> agent spend as a *security* signal (a cost spike is also how a hijacked key or a
> prompt-injected agent looks). That gap is the product. See
> [docs/ecosystem.md](../../docs/ecosystem.md) and
> [docs/threat-detection.md](../../docs/threat-detection.md).

## Quick start (no dependencies, no keys)

```bash
cd apps/spend-collector
python3 -m spend_collector demo
```

Runs the full loop on mock data — **ingest → one ledger → anomaly detectors → `report.html`** —
and self-checks. Open `report.html` in a browser.

## Real data (read-only)

```bash
export ANTHROPIC_ADMIN_KEY=sk-ant-admin01-...     # admin/usage key, read-only
python3 -m spend_collector pull
```

Pulls your Anthropic cost report (per-API-key = per-agent attribution) into `spend.db`
and runs the detectors. OpenAI / OpenRouter follow the same shape; x402 ingests from
facilitator receipts or Dune/Allium.

## What's inside

| File | Role |
|---|---|
| `schema.py` | FOCUS-shaped `SpendEvent` (one row shape for every rail) |
| `store.py` | append-only, idempotent SQLite ledger + summaries |
| `adapters.py` | normalizers: token usage / x402 settlements → ledger rows |
| `sources.py` | live read-only pulls (Anthropic cost API) |
| `detectors.py` | Phase-0 anomaly signals: per-agent robust z-score, budget burn-rate |
| `report.py` | zero-dep static HTML dashboard |

## The detection ceiling (be honest)

Read-only **detects + alerts + keeps evidence — it cannot block a payment.** Stopping
spend needs *inline* enforcement (LLM gateway / x402 middleware) and the unbypassable
backstop is on-chain caps (ERC-7715 / Spend Permissions). That's the
**detect → inline → on-chain** roadmap in [docs/threat-detection.md](../../docs/threat-detection.md).

## Roadmap

1. ✅ Closed loop on mock data (ingest → ledger → detect → report).
2. ✅ Real Anthropic cost pull (`pull`).
3. Real x402 pull (Dune/Allium) + Stripe Events rail → true cross-rail.
4. Grafana/Metabase on the DB; richer detectors (multi-window burn-rate, the 6
   LLMjacking signals).
5. Inline enforcement (gateway/middleware) — Phase 1.

License: MIT.
