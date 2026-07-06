# Testnet Runbook

1. Copy `.env.testnet.example` to `.env.testnet`.
2. Fill RPC, deployer/keeper/agent keys, USDC/mock token, research feed economics, `X402_MODE=facilitator`, `X402_NETWORK=eip155:84532`, x402 facilitator, receiving addresses, alerting, and backup values.
3. Run `node scripts/launch-check-secrets.mjs testnet .env.testnet`.
4. Deploy contracts with `pnpm deploy:testnet` or `node scripts/deploy-network.mjs testnet`.
5. Backfill `.env.testnet` with the printed `SUBCHAIN_ADDRESS`, `SUBSCRIPTION_ALLOWANCE_ADDRESS`, and selected `USDC_ADDRESS`.
6. Apply `apps/indexer/schema.sql`, then create the 1-day Research Feed plan:
   ```bash
   psql "$DATABASE_URL" -f apps/indexer/schema.sql
   pnpm ring9:init
   ```
7. If using mock USDC, mint to the agent with:
   ```bash
   AGENT_USDC_MINT_AMOUNT=1000000000 pnpm ring9:init -- --mint-agent
   ```
   If the deployer should also send gas to the agent, set `AGENT_GAS_FUND_WEI` and add `--fund-agent`.
8. Start indexer, service-agent, consumer agent, and web with `.env.testnet` loaded.
9. Run the HTTP/protocol canary:
   ```bash
   pnpm ring9:canary
   ```
10. Run remaining chain scenarios covering subscribe, renew, cancel, revoke, HITL approval, and allowance-gated renewal.

Do not mark Ring 9 complete without tx hashes, payment ids, trace ids, DB rows, and wallet balance deltas. If only MockUSDC works with SubChain while the facilitator requires canonical testnet USDC, mark x402 evidence separately and do not claim a single-asset full closure.
