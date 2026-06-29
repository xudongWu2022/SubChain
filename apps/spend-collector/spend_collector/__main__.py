"""`python -m spend_collector demo` — end-to-end self-check.

Proves the one thing the research found nobody ships: LLM token cost + x402
payments normalized into ONE cross-rail ledger, queryable by agent / rail / budget.
"""
from __future__ import annotations

import sys

from .adapters import from_llm_usage, from_x402_settlements
from .store import SpendStore

# Mock data with fixed timestamps so the self-check is deterministic.
_LLM = [
    {"model": "claude-opus-4-8", "input_tokens": 200_000, "output_tokens": 50_000,
     "agent_id": "research-bot", "budget_id": "team-research",
     "event_time": "2026-06-29T10:00:00Z", "provider": "anthropic", "request_id": "req-1"},
    {"model": "gpt-5", "input_tokens": 1_000_000, "output_tokens": 200_000,
     "agent_id": "support-bot", "budget_id": "team-support",
     "event_time": "2026-06-29T11:00:00Z", "provider": "openai", "request_id": "req-2"},
]
_X402 = [
    {"transaction": "0xabc", "amount": "0.10", "asset": "USDC", "network": "base",
     "payer": "0xagent", "pay_to": "0xfeed", "resource": "/research-feed",
     "agent_id": "research-bot", "budget_id": "team-research", "event_time": "2026-06-29T10:05:00Z"},
    {"transaction": "0xdef", "amount": "2.50", "asset": "USDC", "network": "base",
     "payer": "0xagent", "pay_to": "0xtool", "resource": "/scrape",
     "agent_id": "support-bot", "budget_id": "team-support", "event_time": "2026-06-29T11:05:00Z"},
]
_BUDGETS = {"team-research": 10.0, "team-support": 20.0}


def _print_summary(store: SpendStore) -> None:
    print(f"\nTotal agent spend: ${store.total():.4f}   (one ledger, all rails)\n")
    print("By agent x rail:")
    for r in store.by("x_agent_id", "rail"):
        print(f"  {r['x_agent_id']:<13} {r['rail']:<10} ${r['spend']:.4f}  ({r['events']} events)")
    print("\nBudget burn:")
    for b in store.budget_burn(_BUDGETS):
        pct = f"{b['pct']}%" if b["pct"] is not None else "-"
        print(f"  {b['budget']:<13} ${b['spent']:.4f} / ${b['cap']:.2f}   ({pct})")


def demo() -> None:
    store = SpendStore()
    store.ingest(from_llm_usage(_LLM))
    store.ingest(from_x402_settlements(_X402))
    _print_summary(store)

    # --- self-check: one ledger sums both rails per budget, idempotent on re-ingest ---
    assert abs(store.total() - 8.10) < 1e-6, store.total()
    research = next(b for b in store.budget_burn(_BUDGETS) if b["budget"] == "team-research")
    assert abs(research["spent"] - 2.35) < 1e-6, research  # 2.25 LLM + 0.10 x402
    store.ingest(from_x402_settlements(_X402))             # re-ingest same receipts
    assert abs(store.total() - 8.10) < 1e-6, "re-ingest double-counted"
    print("\n[self-check] cross-rail sum = $8.10, per-budget split, idempotent re-ingest -- OK")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "demo"
    if cmd != "demo":
        print("usage: python -m spend_collector demo")
        sys.exit(1)
    demo()


if __name__ == "__main__":
    main()
