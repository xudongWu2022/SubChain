"""`python -m spend_collector demo` — end-to-end closed loop + self-check.

ingest (mock LLM + x402) -> one FOCUS ledger -> anomaly detectors -> HTML report.
Proves the wedge: token cost + x402 payments in one cross-rail ledger, with the
Phase-0 (read-only) detection that turns "a dashboard" into "spend governance".
"""
from __future__ import annotations

import sys

from .adapters import from_llm_usage, from_x402_settlements
from .detectors import run_all
from .report import render
from .store import SpendStore

# Mock data, fixed timestamps -> deterministic self-check. research-bot has a small
# token baseline plus one cost spike; support-bot's budget is driven near its cap.
_LLM = (
    [{"model": "claude-haiku-4-5", "input_tokens": 10_000, "output_tokens": 5_000,
      "agent_id": "research-bot", "budget_id": "team-research", "provider": "anthropic",
      "event_time": f"2026-06-29T0{i}:00:00Z", "request_id": f"r-{i}"} for i in range(1, 5)]
    + [{"model": "claude-haiku-4-5", "input_tokens": 1_000_000, "output_tokens": 500_000,
        "agent_id": "research-bot", "budget_id": "team-research", "provider": "anthropic",
        "event_time": "2026-06-29T05:00:00Z", "request_id": "r-spike"}]
    + [{"model": "gpt-5", "input_tokens": 100_000, "output_tokens": 20_000,
        "agent_id": "support-bot", "budget_id": "team-support", "provider": "openai",
        "event_time": f"2026-06-29T0{i}:00:00Z", "request_id": f"s-{i}"} for i in range(1, 5)]
)
_X402 = [
    {"transaction": "0xr1", "amount": "0.10", "asset": "USDC", "network": "base", "payer": "0xa",
     "pay_to": "0xfeed", "resource": "/feed", "agent_id": "research-bot",
     "budget_id": "team-research", "event_time": "2026-06-29T01:05:00Z"},
    {"transaction": "0xr2", "amount": "0.10", "asset": "USDC", "network": "base", "payer": "0xa",
     "pay_to": "0xfeed", "resource": "/feed", "agent_id": "research-bot",
     "budget_id": "team-research", "event_time": "2026-06-29T02:05:00Z"},
    {"transaction": "0xs1", "amount": "3.00", "asset": "USDC", "network": "base", "payer": "0xb",
     "pay_to": "0xtool", "resource": "/scrape", "agent_id": "support-bot",
     "budget_id": "team-support", "event_time": "2026-06-29T03:05:00Z"},
]
_BUDGETS = {"team-research": 10.0, "team-support": 5.0}


def _print_summary(store: SpendStore) -> None:
    print(f"\nTotal agent spend: ${store.total():.4f}   (one ledger, all rails)\n")
    print("By agent x rail:")
    for r in store.by("x_agent_id", "rail"):
        print(f"  {r['x_agent_id']:<13} {r['rail']:<10} ${r['spend']:.4f}  ({r['events']} events)")


def demo() -> None:
    store = SpendStore()
    store.ingest(from_llm_usage(_LLM))
    store.ingest(from_x402_settlements(_X402))
    _print_summary(store)

    alerts = run_all(store, _BUDGETS)
    print("\nAlerts:")
    for a in alerts:
        print(f"  [{a.severity:<4}] {a.kind:<12} {a.subject:<13} {a.detail}")

    with open("report.html", "w") as f:
        f.write(render(store, _BUDGETS, alerts))
    print("\nWrote report.html  (open in a browser)")

    # --- self-check: full closed loop (ledger sums + both detectors fire) ---
    spikes = [a for a in alerts if a.kind == "spend_spike"]
    burns = [a for a in alerts if a.kind == "budget_burn"]
    assert 7.40 < store.total() < 7.45, store.total()
    assert len(spikes) == 1 and spikes[0].subject == "research-bot", spikes
    assert any(b.subject == "team-support" for b in burns), burns
    print("[self-check] ledger + spend-spike + budget-burn alert + report -- OK")


def pull() -> None:
    """Pull real cost data from the Anthropic Cost API (read-only, admin key)."""
    from .sources import env_admin_key, fetch_anthropic_cost_report, from_llm_cost_rows
    key = env_admin_key()
    if not key:
        print("Set ANTHROPIC_ADMIN_KEY to pull real cost data:\n"
              "  export ANTHROPIC_ADMIN_KEY=sk-ant-admin01-...\n"
              "  python3 -m spend_collector pull")
        sys.exit(1)
    store = SpendStore("spend.db")
    n = store.ingest(from_llm_cost_rows(fetch_anthropic_cost_report(key, days=7)))
    print(f"ingested {n} cost rows -> spend.db")
    _print_summary(store)
    for a in run_all(store, {}):
        print(f"  [{a.severity}] {a.kind} {a.subject} {a.detail}")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    if cmd == "demo":
        demo()
    elif cmd == "pull":
        pull()
    else:
        print("usage: python3 -m spend_collector [demo|pull]")
        sys.exit(1)


if __name__ == "__main__":
    main()
