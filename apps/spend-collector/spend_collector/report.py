"""Render a zero-dependency static HTML report from the ledger + alerts.

ponytail: stdlib string concatenation -> one self-contained .html you open in a
browser. Swap for Grafana/Metabase pointed at the DB when you want live dashboards.
"""
from __future__ import annotations

from html import escape

from .detectors import Alert
from .store import SpendStore

_HEAD = (
    "<!doctype html><meta charset=utf-8><title>Agent Spend</title>"
    "<style>"
    "body{font:14px system-ui;margin:2rem;color:#111}"
    "h1{font-size:1.3rem}h2{font-size:1rem;margin-top:1.5rem}"
    "table{border-collapse:collapse;margin:.4rem 0}"
    "td,th{border:1px solid #ddd;padding:.3rem .6rem;text-align:left}"
    "tr.high{background:#fde8e8}tr.warn{background:#fff7e6}"
    "</style>"
)


def render(store: SpendStore, caps: dict[str, float], alerts: list[Alert]) -> str:
    p = [_HEAD, f"<h1>Agent Spend &mdash; ${store.total():.4f} across all rails</h1>"]

    p.append("<h2>By agent &times; rail</h2><table><tr><th>agent</th><th>rail</th>"
             "<th>spend</th><th>events</th></tr>")
    for r in store.by("x_agent_id", "rail"):
        p.append(f"<tr><td>{escape(r['x_agent_id'])}</td><td>{escape(r['rail'])}</td>"
                 f"<td>${r['spend']:.4f}</td><td>{r['events']}</td></tr>")
    p.append("</table>")

    p.append("<h2>Budget burn</h2><table><tr><th>budget</th><th>spent</th><th>cap</th>"
             "<th>%</th></tr>")
    for b in store.budget_burn(caps):
        p.append(f"<tr><td>{escape(b['budget'])}</td><td>${b['spent']:.2f}</td>"
                 f"<td>${b['cap']:.2f}</td><td>{b['pct']}%</td></tr>")
    p.append("</table>")

    p.append("<h2>Alerts</h2><table><tr><th>kind</th><th>subject</th><th>detail</th>"
             "<th>severity</th></tr>")
    if alerts:
        for a in alerts:
            p.append(f"<tr class='{escape(a.severity)}'><td>{escape(a.kind)}</td>"
                     f"<td>{escape(a.subject)}</td><td>{escape(a.detail)}</td>"
                     f"<td>{escape(a.severity)}</td></tr>")
    else:
        p.append("<tr><td colspan=4>no alerts</td></tr>")
    p.append("</table>")
    return "".join(p)
