"""Phase 0 (read-only) spend anomaly detectors over the ledger.

The two highest-value, lowest-false-positive signals to start (per
docs/threat-detection.md): per-(agent, rail) robust z-score (MAD) on spend, and
per-budget burn-rate. These DETECT + ALERT only — a read-only observer cannot
block a payment; that needs inline enforcement (threat-detection.md Phase 1/2).
"""
from __future__ import annotations

from dataclasses import dataclass
from statistics import median

from .store import SpendStore


@dataclass(frozen=True)
class Alert:
    kind: str       # spend_spike | budget_burn
    subject: str    # agent_id or budget_id
    detail: str
    severity: str   # warn | high
    value: float


def _mad(xs: list[float], med: float) -> float:
    return median([abs(x - med) for x in xs]) if xs else 0.0


def spend_spikes(store: SpendStore, z: float = 3.5) -> list[Alert]:
    """Per-(agent, rail) robust z-score on per-event spend. Flags outlier charges
    vs that agent's own history on that rail — catches runaway loops and the
    cost-spike signature of a hijacked key. Segmenting by rail avoids flagging a
    normal payment just because it dwarfs per-call token costs.
    """
    rows = store.db.execute("SELECT x_agent_id, rail, billed_cost FROM spend_events").fetchall()
    groups: dict[tuple[str, str], list[float]] = {}
    for r in rows:
        groups.setdefault((r["x_agent_id"], r["rail"]), []).append(r["billed_cost"])

    alerts: list[Alert] = []
    for (agent, rail), costs in groups.items():
        if len(costs) < 4:  # ponytail: too few points to baseline -> skip (cold-start)
            continue
        med = median(costs)
        mad = _mad(costs, med)
        for c in costs:
            # MAD==0 (identical history) -> robust-z is undefined; fall back to a 3x-median rule.
            spike = (0.6745 * abs(c - med) / mad > z) if mad > 0 else (med > 0 and c > 3 * med)
            if spike:
                alerts.append(Alert(
                    "spend_spike", agent,
                    f"{rail} charge ${c:.4f} vs median ${med:.4f}", "high", c,
                ))
    return alerts


def budget_burn(store: SpendStore, caps: dict[str, float], warn: float = 0.8) -> list[Alert]:
    """Per-budget burn-rate. Flags budgets past `warn` fraction of their cap.

    ponytail: single-window threshold. Upgrade to multi-window multi-burn-rate
    (fast 14.4x / slow 6x, both windows must breach) for lower false positives.
    """
    alerts: list[Alert] = []
    for b in store.budget_burn(caps):
        if b["cap"] and b["spent"] / b["cap"] >= warn:
            sev = "high" if b["spent"] >= b["cap"] else "warn"
            alerts.append(Alert("budget_burn", b["budget"],
                                f"${b['spent']:.2f} / ${b['cap']:.2f} ({b['pct']}%)", sev, b["spent"]))
    return alerts


def run_all(store: SpendStore, caps: dict[str, float]) -> list[Alert]:
    return spend_spikes(store) + budget_burn(store, caps)
