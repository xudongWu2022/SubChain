"""Live, read-only pulls from provider cost APIs and on-chain settlements -> SpendEvent rows.

- LLM token: Anthropic Cost & Usage API (admin key). OpenAI / OpenRouter share the shape.
- x402: USDC Transfer events into a merchant address on Base, via a public RPC (no key).
- card: Stripe succeeded PaymentIntents via the Events API (restricted read key).
Zero deps (stdlib urllib). Attribution works when each agent holds its own key/wallet.
"""
from __future__ import annotations

import json
import os
import urllib.request
from datetime import date, datetime, timedelta, timezone

from .schema import SpendEvent

# --- LLM token cost (Anthropic) ---
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
    """Decode an ERC-20 Transfer log -> {from, to, amount_raw, tx, block}.

    Pure function (no network) so the non-trivial hex decoding is unit-checkable
    offline. ERC-20 Transfer(address indexed from, address indexed to, uint256 value):
    from/to are in indexed topics[1]/[2] (last 20 bytes), value is the data word.
    """
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
    """Read-only: USDC Transfer events INTO `pay_to` on Base (the x402 settlement
    leg), returned as x402 receipt rows ready for adapters.from_x402_settlements.
    No API key — a public RPC. ponytail: single getLogs window; page the block
    range when you need more than `lookback_blocks` of history.
    """
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


# --- card / Stripe payments, read-only via the Events API ---
_STRIPE_URL = "https://api.stripe.com/v1/events"


def env_stripe_key() -> str | None:
    return os.environ.get("STRIPE_API_KEY")


def _unix_iso(ts) -> str:
    return datetime.fromtimestamp(int(ts or 0), tz=timezone.utc).isoformat()


def _stripe_row(event: dict) -> dict:
    """Map a raw Stripe `payment_intent.succeeded` event -> normalized row. Pure."""
    pi = event.get("data", {}).get("object", {})
    meta = pi.get("metadata") or {}
    return {
        "id": pi.get("id") or event.get("id", ""),
        "amount_usd": (pi.get("amount_received") or pi.get("amount") or 0) / 100.0,
        "currency": (pi.get("currency") or "usd").upper(),
        "agent_id": meta.get("agent_id", "unknown"),
        "budget_id": meta.get("budget_id", "default"),
        "merchant": pi.get("on_behalf_of") or meta.get("merchant", "stripe"),
        "event_time": _unix_iso(event.get("created", 0)),
    }


def fetch_stripe_payments(api_key: str, limit: int = 100) -> list[dict]:
    """Read-only: recent succeeded PaymentIntents via the Stripe Events API. Use a
    restricted read key. ponytail: single page; paginate with starting_after for
    >limit. Events retain 30 days — persist what you pull.
    """
    url = f"{_STRIPE_URL}?type=payment_intent.succeeded&limit={limit}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    return [_stripe_row(e) for e in data.get("data", [])]


def from_stripe_payments(rows: list[dict]) -> list[SpendEvent]:
    """Stripe payment rows -> SpendEvents (card rail; amount already in major units)."""
    out = []
    for r in rows:
        out.append(SpendEvent(
            event_id=f"stripe:{r['id']}",
            event_time=r["event_time"],
            rail="card",
            provider_name="stripe",
            service_name=r["merchant"],
            billed_cost=r["amount_usd"],
            billing_currency=r["currency"],
            consumed_quantity=1,
            pricing_unit="charge",
            x_agent_id=r["agent_id"],
            x_budget_id=r["budget_id"],
            x_merchant_id=r["merchant"],
            x_receipt_ref=r["id"],
            charge_category="Purchase",
        ))
    return out
