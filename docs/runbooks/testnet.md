# Testnet Runbook

1. Copy `.env.testnet.example` to `.env.testnet`.
2. Fill RPC, deployer/keeper/agent keys, USDC/mock token, research feed economics, x402 facilitator, receiving addresses, alerting, and backup values.
3. Run `node scripts/launch-check-secrets.mjs testnet .env.testnet`.
4. Deploy contracts with `pnpm deploy:testnet` or `node scripts/deploy-network.mjs testnet`.
5. Run 10 end-to-end cycles covering subscribe, renew, cancel, revoke, x402 pay-per-use, A2A discovery, MCP canary, and HITL approval.

Do not mark Ring 9 complete without tx hashes, payment ids, trace ids, and wallet balance deltas.
