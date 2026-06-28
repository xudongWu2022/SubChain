# Local E2E Runbook

1. Install Node, Foundry, Docker, and Postgres.
2. Copy `.env.local.example` to `.env.local` and fill deployed addresses after contract deploy.
3. Run `node scripts/preflight.mjs`.
4. Start Anvil and deploy contracts.
5. Apply `apps/indexer/schema.sql`.
6. Start indexer, service-agent, agent, and web.
7. Run protocol canaries and agent cycle.
8. For agent chain writes, set `AGENT_PRIVATE_KEY`, `RESEARCH_FEED_PLAN_ID`, and pricing env vars, then run:

```bash
DATABASE_URL= AGENT_PROJECTED_USAGE=35 HITL_COST_THRESHOLD=999999999 pnpm --filter @subchain/agent run cycle
DATABASE_URL= AGENT_LOW_USAGE_STREAK=2 AGENT_ACTIVE_SUBSCRIPTION_ID=<subscriptionId> AGENT_PROJECTED_USAGE=3 pnpm --filter @subchain/agent run cycle
```

9. For visual evidence, run Playwright screenshots:

```bash
pnpm exec playwright screenshot --full-page --viewport-size=1440,1000 http://127.0.0.1:3000 docs/evidence/web-desktop-YYYY-MM-DD.png
pnpm exec playwright screenshot --full-page --viewport-size=390,844 http://127.0.0.1:3000 docs/evidence/web-mobile-YYYY-MM-DD.png
```

Evidence to record in `docs/validation-ledger.md`:

- Command output.
- Local transaction hashes.
- Payment identifiers.
- Trace ids.
- Screenshot paths.
