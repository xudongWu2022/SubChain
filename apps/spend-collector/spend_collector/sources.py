"""Live, read-only pulls from provider cost APIs -> SpendEvent rows.

Today: Anthropic Cost & Usage API (admin key). OpenAI / OpenRouter follow the same
shape (cost already in USD, grouped by api_key_id). Zero deps (stdlib urllib).
Attribution works when each agent holds its own API key (one key = one agent).
"""
from __future__ import annotations

import json
import os
import urllib.request
from datetime import date, timedelta

from .schema import SpendEvent

_ANTHROPIC_URL = "https://api.anthropic.com/v1/organizations/cost_report"


def env_admin_key() -> str | None:
    return os.environ.get("ANTHROPIC_ADMIN_KEY")


def fetch_anthropic_cost_report(admin_key: str, days: int = 7) -> list[dict]:
    """Pull daily cost buckets grouped by api_key_id + model. Returns normalized
    rows: {amount_usd, api_key_id, model, event_time}.

    ponytail: parses the documented bucket->results shape defensively. Verify the
    exact field names against the live response the first time you run it.
    """
    start = (date.today() - timedelta(days=days)).isoformat()
    url = f"{_ANTHROPIC_URL}?starting_at={start}&group_by[]=api_key_id&group_by[]=model"
    req = urllib.request.Request(url, headers={
        "x-api-key": admin_key,
        "anthropic-version": "2023-06-01",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)

    rows: list[dict] = []
    for bucket in data.get("data", []):
        ts = bucket.get("starting_at", start)
        for item in bucket.get("results", []):
            rows.append({
                "amount_usd": float(item.get("amount", item.get("cost", 0)) or 0),
                "api_key_id": item.get("api_key_id") or "unknown",
                "model": item.get("model") or "anthropic",
                "event_time": ts,
            })
    return rows


def from_llm_cost_rows(rows, key_to_agent=None, key_to_budget=None) -> list[SpendEvent]:
    """Cost-API rows (cost already USD) -> SpendEvents. Maps api_key_id to
    agent/budget (default: the api_key_id is the agent, budget 'default').
    """
    key_to_agent = key_to_agent or {}
    key_to_budget = key_to_budget or {}
    out = []
    for r in rows:
        key = r["api_key_id"]
        out.append(SpendEvent(
            event_id=f"llmcost:{key}:{r['model']}:{r['event_time']}",
            event_time=r["event_time"],
            rail="llm_token",
            provider_name="anthropic",
            service_name=r["model"],
            billed_cost=r["amount_usd"],
            billing_currency="USD",
            consumed_quantity=0,
            pricing_unit="usd",
            x_agent_id=key_to_agent.get(key, key),
            x_budget_id=key_to_budget.get(key, "default"),
            x_receipt_ref=key,
        ))
    return out
