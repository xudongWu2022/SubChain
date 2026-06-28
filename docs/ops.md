# Operations

## Services

- `web`: Next.js console.
- `service-agent`: Research Feed, x402, A2A, MCP.
- `agent`: consumer economic loop and HITL.
- `indexer`: chain event ingestion.
- `postgres`: source for indexed chain data, service usage, agent actions, and metrics.

## Health Checks

- `/api/indexer/summary` for web/indexer visibility.
- `/health` on service-agent and agent.
- Postgres `pg_isready`.

## Kill Switch

`KILL_SWITCH=true` blocks agent purchases and service settlement paths while allowing read-only diagnostics.

## Backups

Production requires daily Postgres dumps to `BACKUP_BUCKET` and a restore rehearsal before mainnet pilot.

## Rollback

Rollback requires preserving contract addresses and DB backups. Service deploys roll back independently; contracts are append-only and should be paused or disabled by plan status when needed.
