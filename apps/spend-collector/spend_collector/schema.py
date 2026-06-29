"""FOCUS-shaped spend event — the one row shape every rail normalizes into.

FOCUS = FinOps Open Cost & Usage Spec (v1.4). We reuse its column names so the
ledger is portable across tools; agent-graph keys ride in FOCUS `x_` extensions.
See docs/mvp-spend-ledger.md for the full design.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, fields

RAILS = ("llm_token", "api_x402", "card", "stablecoin")


@dataclass(frozen=True)
class SpendEvent:
    # --- FOCUS core (no defaults) ---
    event_id: str            # idempotency key
    event_time: str          # ISO-8601 (FOCUS ChargePeriodStart)
    rail: str                # one of RAILS
    provider_name: str       # FOCUS ServiceProviderName (openai / anthropic / x402)
    service_name: str        # model / endpoint / merchant
    billed_cost: float       # FOCUS BilledCost, in billing_currency
    billing_currency: str    # USD | USDC
    consumed_quantity: float  # tokens / calls / units
    pricing_unit: str        # token | call | item
    # --- agent-graph join keys (FOCUS x_ extensions, no defaults) ---
    x_agent_id: str
    x_budget_id: str
    # --- optional ---
    x_session_id: str = ""
    x_merchant_id: str = ""
    x_receipt_ref: str = ""   # tx hash | request id | span id
    charge_category: str = "Usage"  # FOCUS: Usage | Purchase | Tax

    def as_row(self) -> dict:
        return asdict(self)


COLUMNS = [f.name for f in fields(SpendEvent)]
_NUMERIC = {"billed_cost", "consumed_quantity"}
