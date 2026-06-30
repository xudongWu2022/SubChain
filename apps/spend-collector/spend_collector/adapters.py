"""Per-rail ingestion adapters: raw provider data -> FOCUS-shaped SpendEvent rows.

The adapters are the thin differentiated layer — nobody else normalizes LLM token
cost AND x402 payments into one row shape. For the scaffold they take already-
fetched records; the TODOs mark where to wire the real read-only pull.
"""
from __future__ import annotations

import base64
import json
from datetime import datetime, timezone

from .schema import SpendEvent

# ponytail: tiny static price book (USD per 1M tokens: input, output). Swap for
# `tokencost` (MIT, 400+ models) when you need real/maintained pricing.
_PRICES = {
    "gpt-5": (1.25, 10.0),
    "claude-opus-4-8": (5.0, 25.0),
    "claude-haiku-4-5": (0.8, 4.0),
}


def _price(model: str, input_tokens: int, output_tokens: int) -> float:
    pin, pout = _PRICES.get(model, (0.0, 0.0))
    return (input_tokens * pin + output_tokens * pout) / 1_000_000


def from_llm_usage(records: list[dict]) -> list[SpendEvent]:
    """LLM token rail. records keys: model, input_tokens, output_tokens, agent_id,
    budget_id, event_time, session_id?, request_id?, provider?.

    TODO real pull (read-only): OpenAI GET /v1/organization/costs (admin key) or
    Anthropic /v1/organizations/cost_report, or LiteLLM /user/daily/activity.
    Attribution works when each agent holds its own API key.
    """
    out = []
    for r in records:
        toks = r["input_tokens"] + r["output_tokens"]
        out.append(SpendEvent(
            event_id=f"llm:{r.get('request_id') or r['agent_id']}:{r['event_time']}",
            event_time=r["event_time"],
            rail="llm_token",
            provider_name=r.get("provider", "llm"),
            service_name=r["model"],
            billed_cost=_price(r["model"], r["input_tokens"], r["output_tokens"]),
            billing_currency="USD",
            consumed_quantity=toks,
            pricing_unit="token",
            x_agent_id=r["agent_id"],
            x_budget_id=r["budget_id"],
            x_session_id=r.get("session_id", ""),
            x_receipt_ref=r.get("request_id", ""),
        ))
    return out


def decode_payment_response(header: str) -> dict:
    """x402 settlement receipt = base64(JSON) carried in the PAYMENT-RESPONSE header."""
    return json.loads(base64.b64decode(header))


def from_x402_settlements(receipts: list[dict]) -> list[SpendEvent]:
    """x402 payment rail. receipts keys: transaction, amount, asset, network, payer,
    pay_to, resource?, event_time, agent_id, budget_id.

    TODO real pull (read-only): facilitator /settle responses (PAYMENT-RESPONSE),
    or query Dune `x402-analytics` / Allium x402 API for historical settlements.
    """
    out = []
    for r in receipts:
        out.append(SpendEvent(
            event_id=f"x402:{r['transaction']}",
            event_time=r["event_time"],
            rail="api_x402",
            provider_name="x402",
            service_name=r.get("resource", r["pay_to"]),
            billed_cost=float(r["amount"]),
            billing_currency=r.get("asset", "USDC"),
            consumed_quantity=1,
            pricing_unit="call",
            x_agent_id=r["agent_id"],
            x_budget_id=r["budget_id"],
            x_merchant_id=r["pay_to"],
            x_receipt_ref=r["transaction"],
            charge_category="Purchase",
        ))
    return out


_STRIPE_ZERO_DECIMAL = {
    "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
    "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
}


def _stripe_amount(amount: int | float | None, currency: str) -> float:
    if amount is None:
        return 0.0
    return float(amount) if currency.lower() in _STRIPE_ZERO_DECIMAL else float(amount) / 100


def _stripe_time(value) -> str:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()
    return value or ""


def from_stripe_events(events: list[dict]) -> list[SpendEvent]:
    """Stripe card/payment rail. Accepts Events API rows for payment_intent.succeeded.

    Attribution is best-effort: set PaymentIntent metadata keys agent_id, budget_id,
    session_id, merchant_id, service_name/resource to get clean agent ledger joins.
    """
    out = []
    for e in events:
        if e.get("type") != "payment_intent.succeeded":
            continue
        pi = (e.get("data") or {}).get("object") or {}
        meta = pi.get("metadata") or {}
        currency = (pi.get("currency") or "usd").upper()
        amount = pi.get("amount_received", pi.get("amount"))
        service = (
            meta.get("service_name") or meta.get("resource") or pi.get("description")
            or pi.get("statement_descriptor") or "stripe_payment"
        )
        customer = pi.get("customer") or "unknown"
        out.append(SpendEvent(
            event_id=f"stripe:{e['id']}",
            event_time=_stripe_time(e.get("created") or pi.get("created")),
            rail="card",
            provider_name="stripe",
            service_name=str(service),
            billed_cost=_stripe_amount(amount, currency),
            billing_currency=currency,
            consumed_quantity=1,
            pricing_unit="payment",
            x_agent_id=meta.get("agent_id") or meta.get("x_agent_id") or str(customer),
            x_budget_id=meta.get("budget_id") or meta.get("x_budget_id") or "default",
            x_session_id=meta.get("session_id") or meta.get("x_session_id") or "",
            x_merchant_id=meta.get("merchant_id") or meta.get("x_merchant_id") or "stripe",
            x_receipt_ref=pi.get("id") or e["id"],
            charge_category="Purchase",
        ))
    return out
