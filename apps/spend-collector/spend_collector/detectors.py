"""Phase 0 (read-only) spend anomaly detectors over the ledger.

These are evidence signals, not enforcement. A read-only observer can detect,
alert, and preserve a trail, but blocking spend requires inline controls.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import median

from .store import SpendStore


@dataclass(frozen=True)
class Alert:
    kind: str
    subject: str
    detail: str
    severity: str   # warn | high
    value: float


def _mad(xs: list[float], med: float) -> float:
    return median([abs(x - med) for x in xs]) if xs else 0.0


def _parse_time(value: str) -> datetime | None:
    if not value:
        return None
    try:
        if len(value) == 10:
            value = f"{value}T00:00:00+00:00"
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _rows(store: SpendStore) -> list:
    return store.db.execute(
        "SELECT event_time, rail, provider_name, service_name, billed_cost, "
        "x_agent_id, x_budget_id, x_session_id, x_merchant_id, x_receipt_ref "
        "FROM spend_events ORDER BY event_time"
    ).fetchall()


def _anchor_time(rows) -> datetime | None:
    times = [t for t in (_parse_time(r["event_time"]) for r in rows) if t]
    return max(times) if times else None


def _is_spike(value: float, baseline: list[float], z: float = 3.5, multiple: float = 3.0) -> bool:
    if len(baseline) < 4:
        return False
    med = median(baseline)
    mad = _mad(baseline, med)
    if mad > 0:
        return 0.6745 * abs(value - med) / mad > z
    return med > 0 and value > multiple * med


def spend_spikes(store: SpendStore, z: float = 3.5) -> list[Alert]:
    """Per-(agent, rail) robust z-score on per-event spend."""
    rows = _rows(store)
    groups: dict[tuple[str, str], list[float]] = {}
    for r in rows:
        groups.setdefault((r["x_agent_id"], r["rail"]), []).append(r["billed_cost"])

    alerts: list[Alert] = []
    for (agent, rail), costs in groups.items():
        if len(costs) < 4:
            continue
        med = median(costs)
        for c in costs:
            if _is_spike(c, costs, z=z):
                alerts.append(Alert(
                    "spend_spike", agent,
                    f"{rail} charge ${c:.4f} vs median ${med:.4f}", "high", c,
                ))
    return alerts


def budget_burn(store: SpendStore, caps: dict[str, float], warn: float = 0.8) -> list[Alert]:
    """Per-budget absolute burn. Flags budgets past `warn` fraction of their cap."""
    alerts: list[Alert] = []
    for b in store.budget_burn(caps):
        if b["cap"] and b["spent"] / b["cap"] >= warn:
            sev = "high" if b["spent"] >= b["cap"] else "warn"
            alerts.append(Alert("budget_burn", b["budget"],
                                f"${b['spent']:.2f} / ${b['cap']:.2f} ({b['pct']}%)", sev, b["spent"]))
    return alerts


def multi_window_burn_rate(
    store: SpendStore,
    caps: dict[str, float],
    *,
    short_hours: int = 6,
    long_hours: int = 24,
    fast_threshold: float = 14.4,
    slow_threshold: float = 6.0,
    budget_period_hours: int = 30 * 24,
) -> list[Alert]:
    """SRE-style multi-window budget burn-rate.

    Fires only when short and long windows both breach, which is a cleaner signal
    than a single point-in-time budget percentage.
    """
    rows = _rows(store)
    now = _anchor_time(rows)
    if not now:
        return []

    alerts: list[Alert] = []
    for budget, cap in caps.items():
        if not cap:
            continue
        spends = {}
        for hours in (short_hours, long_hours):
            cutoff = now - timedelta(hours=hours)
            spent = sum(
                r["billed_cost"] for r in rows
                if r["x_budget_id"] == budget
                and (t := _parse_time(r["event_time"]))
                and t >= cutoff
            )
            spends[hours] = spent
        short_rate = (spends[short_hours] / cap) / (short_hours / budget_period_hours)
        long_rate = (spends[long_hours] / cap) / (long_hours / budget_period_hours)
        if short_rate >= fast_threshold and long_rate >= slow_threshold:
            severity = "high" if short_rate >= fast_threshold * 2 else "warn"
            alerts.append(Alert(
                "budget_burn_rate", budget,
                f"{short_hours}h {short_rate:.1f}x / {long_hours}h {long_rate:.1f}x "
                f"budget burn (${spends[short_hours]:.2f} recent)",
                severity, short_rate,
            ))
    return alerts


def spend_per_task(store: SpendStore, z: float = 3.5) -> list[Alert]:
    """Flag task/session costs that spike versus that agent's task baseline."""
    groups: dict[tuple[str, str, str], float] = {}
    for r in _rows(store):
        task = r["x_session_id"] or r["x_receipt_ref"]
        if not task:
            continue
        key = (r["x_agent_id"], r["rail"], task)
        groups[key] = groups.get(key, 0.0) + r["billed_cost"]

    baselines: dict[tuple[str, str], list[float]] = {}
    for (agent, rail, _task), cost in groups.items():
        baselines.setdefault((agent, rail), []).append(cost)

    alerts: list[Alert] = []
    for (agent, rail, task), cost in groups.items():
        baseline = baselines[(agent, rail)]
        if _is_spike(cost, baseline, z=z):
            med = median(baseline)
            alerts.append(Alert(
                "spend_per_task", agent,
                f"{rail} task {task} cost ${cost:.4f} vs median task ${med:.4f}",
                "high", cost,
            ))
    return alerts


def new_key_spikes(store: SpendStore, *, multiple: float = 5.0, min_amount: float = 10.0) -> list[Alert]:
    """Flag a new agent/key identity whose first charge dwarfs prior rail spend."""
    rows = _rows(store)
    alerts: list[Alert] = []
    seen: set[tuple[str, str]] = set()
    rail_history: dict[str, list[float]] = {}

    for r in rows:
        identity = (r["x_agent_id"], r["rail"])
        rail = r["rail"]
        cost = r["billed_cost"]
        baseline = rail_history.get(rail, [])
        if identity not in seen and len(baseline) >= 4:
            med = median(baseline)
            if med > 0 and cost >= max(min_amount, multiple * med):
                alerts.append(Alert(
                    "new_key_spike", r["x_agent_id"],
                    f"first {rail} charge ${cost:.2f} vs rail median ${med:.2f}",
                    "high", cost,
                ))
        seen.add(identity)
        rail_history.setdefault(rail, []).append(cost)
    return alerts


def new_merchant_provider(store: SpendStore, *, lookback_hours: int = 24, min_amount: float = 1.0) -> list[Alert]:
    """Flag recent first-seen merchants/providers for an existing agent."""
    rows = _rows(store)
    now = _anchor_time(rows)
    if not now:
        return []

    seen_by_agent: dict[str, set[str]] = {}
    ever_seen_agent: set[str] = set()
    alerts: list[Alert] = []
    cutoff = now - timedelta(hours=lookback_hours)

    for r in rows:
        agent = r["x_agent_id"]
        merchant = r["x_merchant_id"] or r["service_name"]
        provider_key = f"{r['rail']}:{r['provider_name']}:{merchant}"
        t = _parse_time(r["event_time"])
        first_for_agent = provider_key not in seen_by_agent.get(agent, set())

        if (
            agent in ever_seen_agent
            and first_for_agent
            and t
            and t >= cutoff
            and r["billed_cost"] >= min_amount
        ):
            alerts.append(Alert(
                "new_merchant_provider", agent,
                f"first seen {provider_key} spend ${r['billed_cost']:.2f}",
                "warn", r["billed_cost"],
            ))

        ever_seen_agent.add(agent)
        seen_by_agent.setdefault(agent, set()).add(provider_key)
    return alerts


def run_all(store: SpendStore, caps: dict[str, float]) -> list[Alert]:
    return (
        spend_spikes(store)
        + budget_burn(store, caps)
        + multi_window_burn_rate(store, caps)
        + spend_per_task(store)
        + new_key_spikes(store)
        + new_merchant_provider(store)
    )
