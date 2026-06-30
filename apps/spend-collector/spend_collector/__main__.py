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

    # offline check of the on-chain x402 decoder used by `pull-x402` (no network)
    from .sources import decode_transfer_log
    _log = {"topics": ["0x" + "d" * 64, "0x" + "0" * 24 + "11" * 20, "0x" + "0" * 24 + "22" * 20],
            "data": "0x" + format(2_500_000, "064x"), "transactionHash": "0xabc", "blockNumber": "0x10"}
    _d = decode_transfer_log(_log)
    assert _d["to"] == "0x" + "22" * 20 and _d["amount_raw"] == 2_500_000 and _d["block"] == 16, _d
    print("[self-check] x402 Transfer decoder -- OK")

    # offline check of the Stripe payment mapping used by `pull-stripe`
    from .sources import _stripe_row, from_stripe_payments
    _evt = {"id": "evt_1", "created": 1781740800,
            "data": {"object": {"id": "pi_1", "amount_received": 4200, "currency": "usd",
                                 "metadata": {"agent_id": "ops-bot", "budget_id": "team-ops"}}}}
    _se = from_stripe_payments([_stripe_row(_evt)])[0]
    assert _se.billed_cost == 42.0 and _se.rail == "card" and _se.x_agent_id == "ops-bot", _se
    print("[self-check] Stripe payment mapping -- OK")


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


def pull_x402() -> None:
    """Pull real x402 settlements (USDC into a merchant address on Base, read-only RPC)."""
    from .adapters import from_x402_settlements
    from .sources import env_pay_to, fetch_base_usdc_transfers
    pay_to = env_pay_to() or (sys.argv[2] if len(sys.argv) > 2 else None)
    if not pay_to:
        print("Pass an x402 receiving address (Base USDC):\n"
              "  X402_PAY_TO=0x... python3 -m spend_collector pull-x402\n"
              "  python3 -m spend_collector pull-x402 0x...")
        sys.exit(1)
    store = SpendStore("spend.db")
    n = store.ingest(from_x402_settlements(fetch_base_usdc_transfers(pay_to)))
    print(f"ingested {n} x402 settlements -> spend.db")
    _print_summary(store)
    for a in run_all(store, {}):
        print(f"  [{a.severity}] {a.kind} {a.subject} {a.detail}")


def pull_stripe() -> None:
    """Pull real card payments via the Stripe Events API (read-only, restricted key)."""
    from .sources import env_stripe_key, fetch_stripe_payments, from_stripe_payments
    key = env_stripe_key()
    if not key:
        print("Set STRIPE_API_KEY (restricted read key) to pull card payments:\n"
              "  export STRIPE_API_KEY=rk_live_...\n"
              "  python3 -m spend_collector pull-stripe")
        sys.exit(1)
    store = SpendStore("spend.db")
    n = store.ingest(from_stripe_payments(fetch_stripe_payments(key)))
    print(f"ingested {n} Stripe payments -> spend.db")
    _print_summary(store)
    for a in run_all(store, {}):
        print(f"  [{a.severity}] {a.kind} {a.subject} {a.detail}")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    if cmd == "demo":
        demo()
    elif cmd == "pull":
        pull()
    elif cmd == "pull-x402":
        pull_x402()
    elif cmd == "pull-stripe":
        pull_stripe()
    else:
        print("usage: python3 -m spend_collector [demo|pull|pull-x402|pull-stripe]")
        sys.exit(1)


if __name__ == "__main__":
    main()
