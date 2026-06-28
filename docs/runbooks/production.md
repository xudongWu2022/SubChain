# Production Runbook

1. Copy `.env.production.example` to `.env.production`.
2. Fill domain, VPS, SSH key, RPC, deployer/keeper/agent key custody, USDC, research feed economics, x402 facilitator, alerts, OTel, and backup settings.
3. Run `node scripts/launch-check-secrets.mjs production .env.production`.
4. Deploy Docker VPS stack.
5. Verify TLS, health checks, logs, alerts, backup restore, kill switch, and key rotation rehearsal.
6. Deploy Base mainnet contracts with small spend limits and HITL enabled.
7. Execute one small real USDC pay-per-use request, one first subscription payment, one renewal, one cancellation, and one merchant withdrawal.

Do not mark Ring 10 complete without mainnet tx hashes, monitoring screenshots, alert evidence, and a written pilot recap.
