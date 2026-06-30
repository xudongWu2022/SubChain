"""Render a zero-dependency static HTML report from the ledger + alerts."""
from __future__ import annotations

from html import escape

from .detectors import Alert
from .store import SpendStore

_HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Spend</title>
<style>
:root{
  color-scheme:light;
  --bg:#f6f7f9;--panel:#ffffff;--ink:#111827;--muted:#667085;--line:#d9dee7;
  --green:#0f766e;--blue:#2563eb;--amber:#b45309;--red:#b91c1c;--soft:#eef2f7;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
.shell{max-width:1180px;margin:0 auto;padding:28px 20px 40px}
header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:22px}
h1{margin:0;font-size:26px;letter-spacing:0;font-weight:760}
h2{margin:0 0 12px;font-size:15px;font-weight:720}
.sub{margin:6px 0 0;color:var(--muted)}
.badge{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:#fff;padding:7px 10px;border-radius:999px;color:#344054;white-space:nowrap}
.dot{width:8px;height:8px;border-radius:999px;background:var(--green)}
.grid{display:grid;gap:14px}
.metrics{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:18px}
.metric{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:15px 16px;min-height:92px}
.label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.value{font-size:28px;font-weight:760;margin-top:8px}
.value.small{font-size:22px}
.two{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start;margin-bottom:18px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px;min-width:0}
.row{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(140px,2fr) auto;gap:12px;align-items:center;padding:9px 0;border-top:1px solid #edf0f5}
.row:first-of-type{border-top:0}
.name{font-weight:650;overflow-wrap:anywhere}
.meta{color:var(--muted);font-size:12px}
.bar{height:9px;background:var(--soft);border-radius:999px;overflow:hidden}
.fill{height:100%;background:var(--blue);border-radius:999px}
.fill.warn{background:var(--amber)}
.fill.high{background:var(--red)}
.money{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
table{width:100%;border-collapse:collapse}
th,td{padding:10px 8px;border-top:1px solid #edf0f5;text-align:left;vertical-align:top}
th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em;font-weight:680}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.pill{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:12px;font-weight:680}
.pill.high{background:#fee2e2;color:var(--red)}
.pill.warn{background:#fef3c7;color:var(--amber)}
.pill.ok{background:#dcfce7;color:var(--green)}
.alerts{margin-bottom:18px}
.alert{display:grid;grid-template-columns:86px 150px minmax(0,1fr) auto;gap:12px;align-items:start;border-top:1px solid #edf0f5;padding:11px 0}
.alert:first-of-type{border-top:0}
.detail{overflow-wrap:anywhere}
.footer{color:var(--muted);font-size:12px;margin-top:18px}
@media (max-width:860px){
  header{display:block}.badge{margin-top:12px}.metrics,.two{grid-template-columns:1fr}
  .alert{grid-template-columns:1fr}.row{grid-template-columns:1fr}.money{text-align:left}
  th:nth-child(4),td:nth-child(4){display:none}
}
</style>
</head>
<body><div class="shell">
"""

_TAIL = "</div></body></html>"


def _money(value: float) -> str:
    return f"${value:,.2f}"


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.1f}%"


def _bar_width(value: float | None, cap: float | None = None) -> float:
    if value is None:
        return 0.0
    if cap:
        return max(0.0, min(100.0, value / cap * 100))
    return max(0.0, min(100.0, value))


def _severity_class(severity: str) -> str:
    return "high" if severity == "high" else "warn" if severity == "warn" else "ok"


def _pretty_kind(kind: str) -> str:
    return kind.replace("_", " ")


def _event_rows(store: SpendStore, limit: int = 12) -> list:
    return store.db.execute(
        "SELECT event_time, x_agent_id, rail, provider_name, service_name, billed_cost, "
        "billing_currency, x_budget_id, x_receipt_ref "
        "FROM spend_events ORDER BY event_time DESC LIMIT ?",
        (limit,),
    ).fetchall()


def _top_alert(alerts: list[Alert]) -> str:
    if not alerts:
        return "No alerts"
    high = sum(1 for a in alerts if a.severity == "high")
    warn = sum(1 for a in alerts if a.severity == "warn")
    return f"{high} high / {warn} warn"


def _section_metrics(store: SpendStore, alerts: list[Alert]) -> str:
    total = store.total()
    events = store.db.execute("SELECT COUNT(*) FROM spend_events").fetchone()[0]
    agents = store.db.execute("SELECT COUNT(DISTINCT x_agent_id) FROM spend_events").fetchone()[0]
    rails = store.db.execute("SELECT COUNT(DISTINCT rail) FROM spend_events").fetchone()[0]
    return (
        "<section class='grid metrics'>"
        f"<div class='metric'><div class='label'>Total spend</div><div class='value'>{_money(total)}</div>"
        "<div class='meta'>Across all observed rails</div></div>"
        f"<div class='metric'><div class='label'>Alerts</div><div class='value small'>{escape(_top_alert(alerts))}</div>"
        "<div class='meta'>Phase-0 detection only</div></div>"
        f"<div class='metric'><div class='label'>Agents</div><div class='value'>{agents}</div>"
        f"<div class='meta'>{events} spend events</div></div>"
        f"<div class='metric'><div class='label'>Rails</div><div class='value'>{rails}</div>"
        "<div class='meta'>Token, API, card, stablecoin</div></div>"
        "</section>"
    )


def _section_rail_mix(store: SpendStore) -> str:
    total = store.total() or 1.0
    rows = store.by("rail")
    p = ["<section class='panel'><h2>Rail Mix</h2>"]
    if not rows:
        p.append("<div class='meta'>No spend events yet.</div>")
    for r in rows:
        pct = r["spend"] / total * 100
        p.append(
            "<div class='row'>"
            f"<div><div class='name'>{escape(r['rail'])}</div><div class='meta'>{r['events']} events</div></div>"
            f"<div class='bar'><div class='fill' style='width:{pct:.1f}%'></div></div>"
            f"<div class='money'>{_money(r['spend'])}</div>"
            "</div>"
        )
    p.append("</section>")
    return "".join(p)


def _section_budgets(store: SpendStore, caps: dict[str, float]) -> str:
    rows = store.budget_burn(caps)
    p = ["<section class='panel'><h2>Budget Burn</h2>"]
    if not rows:
        p.append("<div class='meta'>No budgets observed yet.</div>")
    for b in rows:
        cap = b["cap"]
        pct = b["pct"]
        klass = "high" if pct is not None and pct >= 100 else "warn" if pct is not None and pct >= 80 else ""
        cap_text = "uncapped" if cap is None else _money(cap)
        p.append(
            "<div class='row'>"
            f"<div><div class='name'>{escape(b['budget'])}</div><div class='meta'>cap {cap_text}</div></div>"
            f"<div class='bar'><div class='fill {klass}' style='width:{_bar_width(pct):.1f}%'></div></div>"
            f"<div class='money'>{_money(b['spent'])}<div class='meta'>{_pct(pct)}</div></div>"
            "</div>"
        )
    p.append("</section>")
    return "".join(p)


def _section_alerts(alerts: list[Alert]) -> str:
    p = ["<section class='panel alerts'><h2>Security Signals</h2>"]
    if not alerts:
        p.append("<span class='pill ok'>clear</span><div class='meta' style='margin-top:8px'>No alerts.</div>")
    else:
        ordered = sorted(alerts, key=lambda a: (0 if a.severity == "high" else 1, -a.value))
        for a in ordered:
            klass = _severity_class(a.severity)
            p.append(
                "<div class='alert'>"
                f"<div><span class='pill {klass}'>{escape(a.severity)}</span></div>"
                f"<div><div class='name'>{escape(_pretty_kind(a.kind))}</div><div class='meta'>{escape(a.subject)}</div></div>"
                f"<div class='detail'>{escape(a.detail)}</div>"
                f"<div class='money'>{a.value:.2f}</div>"
                "</div>"
            )
    p.append("</section>")
    return "".join(p)


def _section_agent_rail(store: SpendStore) -> str:
    p = ["<section class='panel'><h2>Agent x Rail</h2><table><tr>"
         "<th>Agent</th><th>Rail</th><th>Events</th><th class='num'>Spend</th></tr>"]
    rows = store.by("x_agent_id", "rail")
    if not rows:
        p.append("<tr><td colspan='4'>No spend events yet.</td></tr>")
    for r in rows:
        p.append(
            f"<tr><td>{escape(r['x_agent_id'])}</td><td>{escape(r['rail'])}</td>"
            f"<td>{r['events']}</td><td class='num'>{_money(r['spend'])}</td></tr>"
        )
    p.append("</table></section>")
    return "".join(p)


def _section_events(store: SpendStore) -> str:
    p = ["<section class='panel'><h2>Recent Ledger Events</h2><table><tr>"
         "<th>Time</th><th>Agent</th><th>Rail</th><th>Service</th><th class='num'>Cost</th></tr>"]
    rows = _event_rows(store)
    if not rows:
        p.append("<tr><td colspan='5'>No spend events yet.</td></tr>")
    for r in rows:
        p.append(
            f"<tr><td>{escape(r['event_time'])}</td><td>{escape(r['x_agent_id'])}</td>"
            f"<td>{escape(r['rail'])}</td><td>{escape(r['provider_name'])} / {escape(r['service_name'])}</td>"
            f"<td class='num'>{_money(r['billed_cost'])} {escape(r['billing_currency'])}</td></tr>"
        )
    p.append("</table></section>")
    return "".join(p)


def render(store: SpendStore, caps: dict[str, float], alerts: list[Alert]) -> str:
    p = [_HEAD]
    p.append(
        "<header><div><h1>Agent Spend Console</h1>"
        "<p class='sub'>Read-only cross-rail ledger and Phase-0 security signals.</p></div>"
        "<div class='badge'><span class='dot'></span>observer mode</div></header>"
    )
    p.append(_section_metrics(store, alerts))
    p.append("<section class='grid two'>")
    p.append(_section_rail_mix(store))
    p.append(_section_budgets(store, caps))
    p.append("</section>")
    p.append(_section_alerts(alerts))
    p.append("<section class='grid two'>")
    p.append(_section_agent_rail(store))
    p.append(_section_events(store))
    p.append("</section>")
    p.append("<p class='footer'>This report is generated locally from the append-only ledger. "
             "It does not move funds or enforce policy.</p>")
    p.append(_TAIL)
    return "".join(p)
