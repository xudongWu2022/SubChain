# Protocol Compatibility

## x402

- Use official x402 packages behind local adapters: `@x402/core`, `@x402/express`, `@x402/fetch`, `@x402/evm`, `@x402/svm`, `@x402/mcp`.
- Service-agent must use real HTTP 402 semantics for protected resources.
- `payment-identifier` is mandatory for retry/idempotency.
- Subscription entitlement bypasses pay-per-use so subscribers are not charged twice.

## A2A

- Discovery uses an Agent Card at `/.well-known/agent.json`.
- Tasks and artifacts are correlated with `taskId`, `artifactId`, `paymentIdentifier`, and `subscriptionId`.

## MCP

- Remote MCP uses Streamable HTTP at `POST /mcp`.
- stdio MCP errors must not be represented as HTTP 402.

## ERC-7715 Direction

- `SubscriptionAllowance` is ERC-7715-inspired and does not claim full ERC-7715 wallet compatibility in v1.
