# SubChain

SubChain is a Web3 subscription billing platform: merchants create recurring USDC plans, users subscribe from their wallet, and anyone can trigger due settlement in a keeper-style flow.

It is designed as a portfolio-grade full-stack project rather than a toy demo. The repo shows Solidity contract design, stablecoin payment flows, event indexing, wallet UX, and operational dashboards.

## Features

- Merchant subscription plans with weekly, monthly, or custom billing intervals
- ERC20 stablecoin payments using a local mock USDC token
- Wallet-based subscription, cancellation, and merchant withdrawals
- Keeper-compatible `chargeSubscription` settlement
- On-chain invoices with paid, canceled, and refunded states
- Merchant dashboard for revenue, active subscriptions, churn, and payment history
- User dashboard for current plans, next charge date, and cancellation
- Node/PostgreSQL indexer that listens to contract events

## Tech Stack

- Contracts: Solidity, Foundry, OpenZeppelin
- Frontend: Next.js, TypeScript, Tailwind CSS, wagmi, viem
- Local chain: Anvil
- Indexer: Node.js, TypeScript, PostgreSQL, viem

## Project Structure

```text
contracts/       Solidity contracts, Foundry tests, deploy script
apps/web/        Next.js wallet app and dashboards
apps/indexer/    Event indexer and PostgreSQL schema
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

Install Foundry if you do not have it yet:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 2. Run the local chain

```bash
anvil
```

### 3. Build and test contracts

```bash
npm run contracts:test
```

### 4. Deploy locally

```bash
npm run contracts:deploy:local
```

Copy the deployed addresses into:

```text
apps/web/.env.local
apps/indexer/.env
```

### 5. Run the app

```bash
npm run dev:web
```

### 6. Run the indexer

Create the database and apply the schema:

```bash
createdb subchain
psql subchain < apps/indexer/schema.sql
npm run dev:indexer
```

## Core Contract Flow

1. Merchant creates a plan with `createPlan(token, amount, interval, gracePeriod, metadataURI)`.
2. User approves the SubChain contract to spend mock USDC.
3. User subscribes with `subscribe(planId)`.
4. The first invoice is paid immediately.
5. When the next billing date arrives, anyone can call `chargeSubscription(subscriptionId)`.
6. Funds accrue to the merchant's withdrawable balance.
7. User can cancel before a future renewal with `cancelSubscription(subscriptionId)`.
8. Merchant can issue a refund for a paid invoice if their balance can cover it.

## Demo Positioning

This project is meant to demonstrate:

- Solidity payment-state design and defensive accounting
- Real ERC20 approval and settlement UX
- Event-driven off-chain indexing
- Full-stack Web3 TypeScript integration
- Practical subscription/payment product thinking

