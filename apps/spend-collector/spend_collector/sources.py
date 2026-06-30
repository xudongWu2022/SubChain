"""Live, read-only pulls from provider cost APIs and settlement rails.

- LLM token: Anthropic Cost & Usage API (admin key).
- Stripe: succeeded PaymentIntents via the Events API (restricted read key).
- x402: USDC Transfer events into a merchant address on Base, via public RPC.
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

from .schema import SpendEvent

# --- LLM token cost (Anthropic) ---
_ANTHROPIC_URL = "https://api.anthropic.com/v1/organizations/cost_report"


def env_admin_key() -> str | None:
    return os.environ.get("ANTHROPIC_ADMIN_KEY")


def fetch_anthropic_cost_report(admin_key: str, days: int = 7) -> list[dict]:
    """Pull daily cost buckets grouped by api_key_id + model."""
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
    """Cost-API rows (cost already USD) -> SpendEvents."""
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


# --- Stripe card / PaymentIntent rail (read-only Events API) ---
_STRIPE_EVENTS_URL = "https://api.stripe.com/v1/events"


def env_stripe_key() -> str | None:
    return os.environ.get("STRIPE_SECRET_KEY") or os.environ.get("STRIPE_API_KEY")


def fetch_stripe_payment_intent_events(secret_key: str, days: int = 7, limit: int = 100) -> list[dict]:
    """Pull successful PaymentIntent events from Stripe's read-only Events API.

    Stripe Events have limited retention, so production use should poll frequently
    and persist rows locally. Use a restricted read key when possible.
    """
    created_gte = int((datetime.now(tz=timezone.utc) - timedelta(days=days)).timestamp())
    params = {
        "type": "payment_intent.succeeded",
        "created[gte]": str(created_gte),
        "limit": str(min(max(limit, 1), 100)),
    }
    rows: list[dict] = []
    starting_after = None
    while True:
        if starting_after:
            params["starting_after"] = starting_after
        url = f"{_STRIPE_EVENTS_URL}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {secret_key}"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
        batch = data.get("data", [])
        rows.extend(batch)
        if not data.get("has_more") or not batch:
            return rows
        starting_after = batch[-1]["id"]


# --- x402 / on-chain USDC settlements (Base), read-only via public RPC ---
BASE_RPC = "https://mainnet.base.org"
USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"


def env_pay_to() -> str | None:
    return os.environ.get("X402_PAY_TO")


def _rpc(method: str, params: list, rpc_url: str) -> object:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(rpc_url, data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        out = json.load(resp)
    if out.get("error"):
        raise RuntimeError(out["error"])
    return out["result"]


def decode_transfer_log(log: dict) -> dict:
    """Decode an ERC-20 Transfer log -> {from, to, amount_raw, tx, block}."""
    topics = log["topics"]
    return {
        "from": "0x" + topics[1][-40:],
        "to": "0x" + topics[2][-40:],
        "amount_raw": int(log["data"], 16),
        "tx": log["transactionHash"],
        "block": int(log["blockNumber"], 16),
    }


def fetch_base_usdc_transfers(pay_to: str, *, rpc_url: str = BASE_RPC, usdc: str = USDC_BASE,
                              lookback_blocks: int = 2000, decimals: int = 6) -> list[dict]:
    """Read-only: USDC Transfer events into `pay_to` on Base."""
    latest = int(_rpc("eth_blockNumber", [], rpc_url), 16)
    from_block = max(0, latest - lookback_blocks)
    pad_to = "0x" + "0" * 24 + pay_to.lower().replace("0x", "")
    logs = _rpc("eth_getLogs", [{
        "address": usdc, "fromBlock": hex(from_block), "toBlock": "latest",
        "topics": [_TRANSFER_TOPIC, None, pad_to],
    }], rpc_url)

    ts_cache: dict[int, str] = {}
    rows = []
    for log in logs:
        d = decode_transfer_log(log)
        if d["block"] not in ts_cache:
            blk = _rpc("eth_getBlockByNumber", [hex(d["block"]), False], rpc_url)
            ts_cache[d["block"]] = datetime.fromtimestamp(
                int(blk["timestamp"], 16), tz=timezone.utc).isoformat()
        rows.append({
            "transaction": d["tx"], "amount": f"{d['amount_raw'] / 10 ** decimals:.6f}",
            "asset": "USDC", "network": "base", "payer": d["from"], "pay_to": d["to"],
            "resource": "onchain:transfer", "event_time": ts_cache[d["block"]],
            "agent_id": d["from"], "budget_id": "default",
        })
    return rows
