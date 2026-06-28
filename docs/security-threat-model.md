# Security Threat Model

## Funding Layer

- Duplicate subscription charge: mitigated by on-chain `invoiceKey`, DB unique constraints, and idempotent retry behavior.
- Unauthorized spender: allowance is purpose-bound to owner, token, SubChain contract, merchant, plan, caps, interval, expiry, and revoke state.
- Keeper key leak: keeper can only trigger validated subscription charge paths; it cannot receive arbitrary token transfer approval.
- Plan silent price change: subscriptions lock `planVersion`, price, token, period, merchant, and service id at activation.
- x402 duplicate settlement: payment attempts are keyed by `paymentIdentifier`.

## Agent Layer

- Prompt injection from merchant metadata, A2A payloads, MCP responses, or feed artifacts is treated as untrusted data.
- LLM proposals do not execute funds. Policy and HITL gates must approve structured actions.
- Budget exhaustion stops purchases. Infinite minting is forbidden outside local dev fixtures.

## Ops Layer

- Kill switch must be persisted in environment/config and checked by service-agent and consumer agent.
- Chain cursors must survive restarts and support replay without duplicate invoice records.
- Production launch is blocked unless secrets, alerting, backup, and rollback paths are present.
