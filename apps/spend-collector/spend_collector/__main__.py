"""CLI for the read-only cross-rail agent spend collector."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from .adapters import from_llm_usage, from_stripe_events, from_x402_settlements
from .detectors import run_all
from .report import render
from .store import SpendStore

_ROOT = Path(__file__).resolve().parent.parent
_FIXTURES = _ROOT / "fixtures"


def _load_fixture(name: str):
    with open(_FIXTURES / name, encoding="utf-8") as f:
        return json.load(f)


def _print_summary(store: SpendStore) -> None:
    print(f"\nTotal agent spend: ${store.total():.4f}   (one ledger, all rails)\n")
    print("By agent x rail:")
    for r in store.by("x_agent_id", "rail"):
        print(f"  {r['x_agent_id']:<13} {r['rail']:<10} ${r['spend']:.4f}  ({r['events']} events)")


def demo() -> None:
    """Run the product demo: LLM + x402 + Stripe -> ledger -> security signals."""
    llm = _load_fixture("llm_usage.json")
    x402 = _load_fixture("x402_settlements.json")
    stripe = _load_fixture("stripe_events.json")
    budgets = _load_fixture("budgets.json")

    store = SpendStore()
    store.ingest(from_llm_usage(llm))
    store.ingest(from_x402_settlements(x402))
    store.ingest(from_stripe_events(stripe))
    _print_summary(store)

    alerts = run_all(store, budgets)
    print("\nAlerts:")
    for a in alerts:
        print(f"  [{a.severity:<4}] {a.kind:<22} {a.subject:<13} {a.detail}")

    with open("report.html", "w", encoding="utf-8") as f:
        f.write(render(store, budgets, alerts))
    print("\nWrote report.html  (open in a browser)")

    kinds = {a.kind for a in alerts}
    expected = {
        "spend_spike",
        "budget_burn",
        "budget_burn_rate",
        "spend_per_task",
        "new_key_spike",
        "new_merchant_provider",
    }
    assert 27.10 < store.total() < 27.12, store.total()
    assert expected <= kinds, kinds
    assert any(a.kind == "spend_spike" and a.subject == "research-bot" for a in alerts), alerts
    assert any(a.kind == "new_key_spike" and a.subject == "new-key-bot" for a in alerts), alerts
    assert any(a.kind == "new_merchant_provider" and a.subject == "support-bot" for a in alerts), alerts
    print("[self-check] cross-rail ledger + Phase-0 security demo -- OK")

    from .sources import decode_transfer_log
    log = {"topics": ["0x" + "d" * 64, "0x" + "0" * 24 + "11" * 20, "0x" + "0" * 24 + "22" * 20],
           "data": "0x" + format(2_500_000, "064x"), "transactionHash": "0xabc", "blockNumber": "0x10"}
    decoded = decode_transfer_log(log)
    assert decoded["to"] == "0x" + "22" * 20 and decoded["amount_raw"] == 2_500_000
    print("[self-check] x402 Transfer decoder -- OK")

    event = {"id": "evt_1", "created": 1781740800, "type": "payment_intent.succeeded",
             "data": {"object": {"id": "pi_1", "amount_received": 4200, "currency": "usd",
                                  "metadata": {"agent_id": "ops-bot", "budget_id": "team-ops"}}}}
    stripe_event = from_stripe_events([event])[0]
    assert stripe_event.billed_cost == 42.0 and stripe_event.rail == "card"
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
    from .sources import env_stripe_key, fetch_stripe_payment_intent_events
    key = env_stripe_key()
    if not key:
        print("Set STRIPE_SECRET_KEY (restricted read key) to pull card payments:\n"
              "  export STRIPE_SECRET_KEY=rk_live_...\n"
              "  python3 -m spend_collector pull-stripe")
        sys.exit(1)
    store = SpendStore("spend.db")
    n = store.ingest(from_stripe_events(fetch_stripe_payment_intent_events(key)))
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
