# Codex Execution Ledger

This file is the persistent execution ledger for the one-shot SubChain launch plan. Codex must read it before resuming work and update it whenever a ring changes state.

| Ring | Scope | Status | Implementation record | Next action |
|---|---|---|---|---|
| Ring 0 | One-shot startup package | DONE | Cross-platform scripts, env templates, workspace config, protocol canary, docs gate, validation summary, Foundry, Docker CLI path, and local env are in place. | None for local execution. |
| Ring 1 | Contract state machine | DONE | `SubChain.sol` has versioned plans, status, period index, invoice key idempotency, grace, cancellation semantics, entitlement, usage, and allowance-gated charge path. | None. |
| Ring 2 | Security allowance | DONE | `SubscriptionAllowance.sol` enforces owner/token/SubChain/plan/merchant/cap/interval/expiry/revoke and is tested. | None. |
| Ring 3 | Entitlement + Research Feed | DONE | Local service-agent proved subscription entitlement feed access against Anvil-deployed contracts. | None for local; repeat on testnet after env is filled. |
| Ring 4 | x402 dual mode | DONE_LOCAL | Local service-agent proved HTTP 402, settlement, and pay-per-use access with payment identifier idempotency. Facilitator-mode seller/buyer code is implemented behind `X402_MODE=facilitator` with payment policy checks and evidence columns. | `@xudong`: capture real facilitator tx/payment evidence on Base Sepolia before marking Ring 9 complete. |
| Ring 5 | A2A + MCP | DONE_LOCAL | Agent Card, A2A task/artifact, and MCP initialize endpoints passed local canaries. | Repeat against public testnet URL. |
| Ring 6 | Consumer Agent | DONE_LOCAL_CHAIN | Agent now executes pay-per-use settlement plus real EVM `approve`, `subscribe`, and `cancelSubscription` transactions when launch env is present; DB write failure degrades to in-memory evidence instead of failing completed chain actions. | Repeat against testnet once `.env.testnet` is filled. |
| Ring 7 | Indexer/DB/Web | DONE_LOCAL | Indexer backfilled chain events; DB captured plans/subscriptions/invoices/usage/payments/actions; web typecheck/build passed; Playwright desktop/mobile screenshots captured. | Repeat with live testnet database and public URL. |
| Ring 8 | Docker VPS + Ops | DONE_CONFIG | Docker config passes and local Postgres ran; Compose defines web, agent, service-agent, indexer, Postgres, OTel, Caddy; containers use pnpm lockfile and container-safe RPC defaults. | Remote VPS rehearsal after production host inputs. |
| Ring 9 | Testnet total validation | BLOCKED_EXTERNAL | Testnet runbook/env template/secret gate exist. Local ignored `.env.testnet` was generated with Base Sepolia defaults, testnet wallets, x402 facilitator settings, Circle Base Sepolia USDC, and local Postgres; `node scripts/launch-check-secrets.mjs testnet .env.testnet` passes locally. Ring 9 helper scripts exist for plan init and canary. | `@xudong`: fund deployer/keeper/agent with Base Sepolia ETH, fund agent with Base Sepolia USDC, replace localhost URLs/webhook with public endpoints, deploy contracts, backfill contract addresses, run Ring 9 canary, and capture tx hashes/payment ids/trace ids/DB rows/balance deltas. |
| Ring 10 | Mainnet small pilot | BLOCKED_EXTERNAL | Production runbook, env template, and secret gate exist. | Create `.env.production` with domain, VPS/SSH, RPC, deployer/keeper/agent keys, USDC funds, facilitator, alerts, backup. |

## Resume Protocol

1. Read this file and `docs/ledgers/validation-ledger.md`.
2. Run `git status --short`.
3. Check the latest failed validation output.
4. Continue Ring 9 after `@xudong` provides testnet funds/public URLs/alert webhook and captures real facilitator evidence; continue Ring 10 only after Ring 9 is complete.

## Open External Inputs

- Ring 9 no longer blocks on the local secret gate; it remains blocked on external testnet funds, public service URLs, alert delivery, real x402 facilitator evidence, renewal evidence, and balance-delta proof. Current handoff owner: `@xudong`.
- Ring 10 remains blocked until `.env.production` exists and passes `node scripts/launch-check-secrets.mjs production .env.production`.
- Remote VPS TLS, backup restore, alert delivery, key rotation, Base mainnet pilot, and real x402/SVM facilitator settlement must not be marked complete without their required external credentials, URLs, funds, and evidence.
