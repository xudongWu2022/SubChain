# SubChain Docs

Index of project documentation. Start with the plan for the vision, the runbooks to operate the stack, and the ledgers for current launch status.

## Planning
- [agent-native-subscription-plan.md](agent-native-subscription-plan.md) — Vision and integrated design: agent-native subscription infra (x402 pay-per-use + budget-bounded recurring authorization), 7-layer architecture, phased roadmap, and macOS end-to-end verification.

## Reference
- [api.md](reference/api.md) — Contract methods (`SubChain`, `SubscriptionAllowance`) and service/consumer agent HTTP endpoints.
- [protocol-compatibility.md](reference/protocol-compatibility.md) — How x402, A2A, MCP, and ERC-7715 are used and scoped in v1.
- [security-threat-model.md](reference/security-threat-model.md) — Threats and mitigations across the funding, agent, and ops layers.
- [launch-inputs.md](reference/launch-inputs.md) — Required env inputs per environment (local / testnet / production) and the secret gate.
- [ops.md](reference/ops.md) — Services, health checks, kill switch, backups, rollback.

## Launch ledgers
- [codex-execution-ledger.md](ledgers/codex-execution-ledger.md) — Ring 0–10 status and next actions (read before resuming work).
- [validation-ledger.md](ledgers/validation-ledger.md) — Per-ring command output and evidence.

## Runbooks
- [runbooks/local-e2e.md](runbooks/local-e2e.md) — Local end-to-end bring-up and canaries.
- [runbooks/testnet.md](runbooks/testnet.md) — Testnet deploy and validation (Ring 9).
- [runbooks/production.md](runbooks/production.md) — Mainnet pilot deploy and validation (Ring 10).

## Evidence
- [evidence/](evidence/) — Playwright desktop/mobile screenshots referenced by the validation ledger.
