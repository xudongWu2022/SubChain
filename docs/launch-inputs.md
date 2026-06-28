# Launch Inputs

Ring 0 freezes all external inputs. Local and testnet work may proceed when production inputs are absent, but missing values block the corresponding launch ring.

## Local

- `RPC_URL`: local Anvil endpoint.
- `DATABASE_URL`: local Postgres DSN.
- `CHAIN_ID`: local chain id, default `31337`.
- `SUBCHAIN_ADDRESS`, `SUBSCRIPTION_ALLOWANCE_ADDRESS`, `USDC_ADDRESS`: deployment outputs.
- `AGENT_PRIVATE_KEY`: local Anvil key used by the consumer agent for subscription/cancel write tests.
- `RESEARCH_FEED_PLAN_ID`, `RESEARCH_FEED_SUBSCRIPTION_PRICE`, `RESEARCH_FEED_PAY_PER_USE_PRICE`, `RESEARCH_FEED_INCLUDED_UNITS`: service economics frozen before agent execution.
- `HITL_SHARED_SECRET`: local approval token.

## Testnet

- EVM RPC URL and chain id.
- SVM RPC URL for x402 pay-per-use canary.
- Funded deployer, keeper, and agent wallets.
- Testnet USDC or mock token address.
- Research feed plan id and price variables.
- x402 facilitator URL and receiving addresses.
- Public service URLs for web, service-agent, and agent.
- Alert webhook and backup destination.

## Production

- Domain name and DNS control.
- VPS host, user, and SSH key path.
- Production EVM RPC and deployer/keeper/agent key custody plan.
- Production USDC address and funded pilot wallet.
- Research feed plan id, pay-per-use price, subscription price, included units, and pilot spend limits.
- x402 facilitator URL and receiving addresses.
- TLS email/contact, alert webhook, OpenTelemetry endpoint, backup bucket.
- Pilot spend limits and HITL operators.

## Machine Gate

Run:

```bash
node scripts/launch-check-secrets.mjs testnet .env.testnet
node scripts/launch-check-secrets.mjs production .env.production
```

Any missing value keeps that launch ring blocked.
