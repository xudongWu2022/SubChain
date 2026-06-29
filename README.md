# SubChain

SubChain is a local Web3 subscription billing demo. Merchants create recurring mUSDC plans, users approve and subscribe from MetaMask, and due subscriptions can be charged through a keeper-style flow.

> **Roadmap / vision:** evolving this demo into agent-native subscription infrastructure — x402 pay-per-use plus safe, budget-bounded recurring authorization for AI agents. See **[docs/agent-native-subscription-plan.md](docs/agent-native-subscription-plan.md)**.

## Documentation

Full index in **[docs/README.md](docs/README.md)** — API reference, protocol notes, threat model, launch ledgers, and runbooks.

## Prerequisites

- **Node.js 20+** — the repo pins `pnpm@11.7.0`; enable it with `corepack enable`.
- **Foundry** — `anvil`, `forge`, `cast` (install via [foundryup](https://book.getfoundry.sh/getting-started/installation)).
- **Docker Desktop** — only needed for the Postgres-backed indexer; the basic wallet demo runs without it.
- **Chrome with MetaMask** — for the browser demo.

## Install

```bash
corepack enable
pnpm install
```

`contracts/lib` is gitignored, so vendor the Foundry test library once before running contract tests:

```bash
cd contracts && forge install dapphub/ds-test --no-git --shallow && cd ..
```

## Run the Local Demo

The minimal wallet demo needs three terminals and no database.

### Terminal 1 — Anvil

```bash
anvil
```

Keep it running. The local RPC is `http://127.0.0.1:8545`, chain id `31337`. Anvil wipes all state on restart, so redeploy and refund after every restart.

### Terminal 2 — Deploy contracts and write the web env

```bash
pnpm contracts:deploy:local
```

Copy the env template and paste the **printed** addresses into it:

```bash
cp apps/web/.env.example apps/web/.env.local
```

```text
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_SUBCHAIN_ADDRESS=<printed SubChain address>
NEXT_PUBLIC_USDC_ADDRESS=<printed MockUSDC address>
```

If you use the allowance flow, also set `NEXT_PUBLIC_SUBSCRIPTION_ALLOWANCE_ADDRESS`. Always trust the addresses printed by the deploy command over any fixed values.

Fund your MetaMask account (replace `YOUR_METAMASK_ADDRESS`; the key below is Anvil's default test key):

```bash
cast send YOUR_METAMASK_ADDRESS --value 10ether \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://127.0.0.1:8545

# mint 1,000,000 mUSDC (MockUSDC uses 6 decimals)
cast send <printed MockUSDC address> "mint(address,uint256)" YOUR_METAMASK_ADDRESS 1000000000000 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://127.0.0.1:8545
```

### Terminal 3 — Frontend

```bash
pnpm dev:web
```

Open the printed URL, usually `http://localhost:3000` (Next.js falls back to `3001` if the port is busy).

> `pnpm dev:local:cross` prints this bring-up checklist and runs the preflight check — handy as a reminder, but it does not start Anvil or deploy for you.

## Optional: Database + Indexer

For database-backed history, start Postgres and apply the schema:

```bash
cp .env.local.example .env.local
docker compose up -d postgres
docker compose exec -T postgres psql -U postgres -d subchain < apps/indexer/schema.sql
pnpm dev:indexer
```

The service-agent and consumer agent (the full agent loop) start with `pnpm dev:service` and `pnpm dev:agent`. See [docs/runbooks/local-e2e.md](docs/runbooks/local-e2e.md) for the complete end-to-end flow and canaries.

## MetaMask Setup

Add or select this network in MetaMask:

```text
Network name: Localhost 8545
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency symbol: ETH
Block explorer URL: leave blank
```

- The RPC URL must include `http://`.
- Only confirm transactions when the network is `Localhost 8545` / chain id `31337`. Cancel anything that says `Ethereum`.
- After switching network, hard refresh with `Cmd + Shift + R`.

The app shows both wallet and app chain IDs; both should read `31337` before sending transactions.

## Demo Flow

1. Connect MetaMask and confirm `Wallet Chain ID: 31337`.
2. Click `Create $10 plan` and confirm.
3. Click `Approve 100 USDC` and confirm.
4. Click `Subscribe to plan #1` and confirm.

`Charge subscription #1` will reject with `NotDue` right after subscribing — the plan interval is 30 days. To test a charge locally, advance Anvil time first:

```bash
cast rpc evm_increaseTime 2592000 --rpc-url http://127.0.0.1:8545
cast rpc evm_mine --rpc-url http://127.0.0.1:8545
```

Then click `Charge subscription #1`.

## Common Anvil Gotchas

- Restarting Anvil wipes all contracts, balances, mints, plans, subscriptions, invoices, and approvals.
- After every Anvil restart, redeploy contracts and refund your MetaMask account.
- If `planCount` stays `0` after creating a plan, check that `apps/web/.env.local` matches the latest deploy output.
- If MetaMask shows no ETH on `Localhost 8545`, Anvil probably restarted after you funded the wallet.

## Useful Checks

```bash
cast chain-id --rpc-url http://127.0.0.1:8545
pnpm contracts:test        # Foundry state-machine + allowance tests
pnpm test:all              # preflight + protocol canary + docs gate + validation + forge
pnpm docs:gate             # required docs and Ring 0-10 ledger records
pnpm build:web
```

## Windows

The `pnpm dev:stack`, `pnpm dev:local`, and `pnpm db:local` scripts are PowerShell helpers (`scripts/*.ps1`) for Windows one-command startup. On macOS/Linux, use the manual flow above.

## Project Structure

```text
contracts/           Solidity (SubChain, SubscriptionAllowance, MockUSDC), Foundry tests, deploy script
apps/web/            Next.js wallet app and dashboard
apps/indexer/        Event indexer and PostgreSQL schema
apps/service-agent/  Research Feed service: x402, A2A, MCP
apps/agent/          Consumer economic loop and HITL
scripts/             Cross-platform Node tooling (.mjs) and Windows helpers (.ps1)
docs/                Documentation (start at docs/README.md)
ops/                 Caddy and OpenTelemetry configs
```
