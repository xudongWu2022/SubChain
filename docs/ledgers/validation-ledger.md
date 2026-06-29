# Validation Ledger

Every ring records command output, deterministic evidence, and retest results. External launch rings can be marked `BLOCKED` only when the missing input is explicitly listed.

| Ring | Check | Status | Evidence |
|---|---|---|---|
| Ring 0 | Dependency install | PASS | `pnpm install` succeeded with bundled Node PATH. |
| Ring 0 | Preflight | PASS | `node scripts/preflight.mjs` passed after installing Foundry and adding Docker.app CLI path to scripts. |
| Ring 0 | Docker compose config | PASS | `docker compose config` passed with local ports `55432`, `8080`, `8444`. |
| Ring 0 | Protocol canary | PASS | `node scripts/protocol-canary.mjs`: x402 payment identifier idempotency, A2A Agent Card, MCP Streamable HTTP canary all passed. |
| Ring 0 | Docs gate | PASS | `node scripts/docs-gate.mjs` found required docs and Ring 0-10 records in both ledgers. |
| Ring 0 | TypeScript | PASS | `pnpm -r run typecheck` passed for web, indexer, service-agent, and agent. |
| Ring 0 | Web build | PASS | `pnpm --filter @subchain/web run build` completed successfully. |
| Ring 0 | Unified gate | PASS | `node scripts/test-all.mjs` passed preflight, protocol, docs, validation summary, and Foundry tests. |
| Ring 1 | Foundry state machine tests | PASS | `forge test -vvv`: 12 tests passed, including first payment, renewal, duplicate charge, past due, grace, suspend, cancel, and usage caps. |
| Ring 2 | Foundry allowance security tests | PASS | `forge test -vvv`: allowance tests passed for purpose-bound consume, wrong token/merchant/plan, cap, expiry, too-early, and revoke. |
| Ring 3 | Service entitlement canary | PASS | Local Anvil + service-agent: subscribed owner `0xf39F...2266` received `/feed` 200 with `source=subscription` and `subscriptionId=1`. |
| Ring 4 | x402 402/payment/idempotency canary | PASS | Unpaid `/feed` returned HTTP 402; `POST /x402/settle` with `local-e2e-1782608461` returned `settled`; retrying `/feed` returned 200 with `source=x402`. |
| Ring 5 | A2A/MCP discovery canary | PASS | `GET /.well-known/agent.json`, `POST /a2a/tasks`, and `POST /mcp initialize` returned valid responses with task/artifact and MCP protocol data. |
| Ring 6 | Consumer economic cycle canary | PASS | `AGENT_PROJECTED_USAGE=8` chose pay-per-use and settled `agent-0ba4d4ff-99d8-47d8-8878-2b1f8f8e4445`; `AGENT_PROJECTED_USAGE=35` chose subscribe and was blocked by HITL. |
| Ring 6 | Consumer chain-write canary | PASS | Local Anvil tx `0xf96094387272ab0eac0baf65e0bb7a834b1d7cdb30241d0e5bde274eca0264c1` created plan 1. Agent subscribe executed `approve=0xe94dd8bc36a50d97b66f1fa5b308c13a1a7207e7caf9987d2fa03c6dac3677d8`, `subscribe=0x8a5235331604850fad7b5c04691f9ef7ebede572617eeb4c9dac4aa58552d428`, `subscriptionId=2`; low-usage cancel executed `0xfbc5f5dca93a01077e2d29f1693eecb9e21c4b3147f9fb5fd587cb97583ae2e0`; `getSubscription(2)` returned status `4` (`Cancelled`). |
| Ring 7 | Indexer/DB/UI consistency | PASS | Indexer backfilled 5 logs. DB counts: 1 plan, 1 subscription, 1 invoice, 2 service usage rows, 2 x402 payments, 4 agent actions. Web production build passed. |
| Ring 7 | Playwright visual check | PASS | `pnpm exec playwright screenshot` captured desktop and mobile UI evidence at `docs/evidence/web-desktop-2026-06-27.png` and `docs/evidence/web-mobile-2026-06-27.png`; both screenshots are nonblank and readable with no obvious overlap. |
| Ring 8 | Docker VPS ops rehearsal | PASS_CONFIG | Docker CLI/daemon and `docker compose config` passed. Local Postgres ran on port 55432. Compose now uses `corepack enable && pnpm install --frozen-lockfile`; indexer, service-agent, and agent use `DOCKER_RPC_URL` fallback `http://host.docker.internal:8545`. Full remote VPS rehearsal requires remote VPS inputs. |
| Ring 9 | Testnet total validation | BLOCKED | `node scripts/launch-check-secrets.mjs testnet .env.testnet` failed because `.env.testnet` is absent. |
| Ring 10 | Mainnet small pilot | BLOCKED | `node scripts/launch-check-secrets.mjs production .env.production` failed because `.env.production` is absent. |
