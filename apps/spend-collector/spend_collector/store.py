"""Append-only SQLite ledger + read-only summaries.

ponytail: SQLite (stdlib) is the thinnest store that works. Swap to DuckDB or
Postgres when you outgrow one file or need concurrent writers.
ponytail: total() sums mixed currencies 1:1 (USDC approx USD); add FX
normalization to a reporting currency before real use.
"""
from __future__ import annotations

import sqlite3
from collections.abc import Iterable

from .schema import COLUMNS, _NUMERIC, SpendEvent

_DDL = (
    "CREATE TABLE IF NOT EXISTS spend_events ("
    + ", ".join(f"{c} REAL" if c in _NUMERIC else f"{c} TEXT" for c in COLUMNS)
    + ", PRIMARY KEY (event_id))"
)


class SpendStore:
    def __init__(self, path: str = ":memory:"):
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute(_DDL)

    def ingest(self, events: Iterable[SpendEvent]) -> int:
        rows = [tuple(e.as_row()[c] for c in COLUMNS) for e in events]
        # INSERT OR IGNORE => idempotent on event_id (re-ingest never double-counts).
        self.db.executemany(
            f"INSERT OR IGNORE INTO spend_events ({', '.join(COLUMNS)}) "
            f"VALUES ({', '.join('?' for _ in COLUMNS)})",
            rows,
        )
        self.db.commit()
        return len(rows)

    def total(self) -> float:
        return self.db.execute("SELECT COALESCE(SUM(billed_cost), 0) FROM spend_events").fetchone()[0]

    def by(self, *dims: str) -> list[sqlite3.Row]:
        cols = ", ".join(dims)
        return self.db.execute(
            f"SELECT {cols}, ROUND(SUM(billed_cost), 6) AS spend, COUNT(*) AS events "
            f"FROM spend_events GROUP BY {cols} ORDER BY spend DESC"
        ).fetchall()

    def budget_burn(self, caps: dict[str, float]) -> list[dict]:
        out = []
        for row in self.by("x_budget_id"):
            cap = caps.get(row["x_budget_id"])
            out.append({
                "budget": row["x_budget_id"],
                "spent": row["spend"],
                "cap": cap,
                "pct": round(100 * row["spend"] / cap, 1) if cap else None,
            })
        return out
