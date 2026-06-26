# SubChain

SubChain is a local Web3 subscription billing demo. Merchants create recurring mUSDC plans, users approve and subscribe from MetaMask, and due subscriptions can be charged through a keeper-style flow.

## What You Need

- Node.js and npm
- Foundry tools: `anvil`, `forge`, `cast`
- Chrome with MetaMask

On this Windows machine, Foundry was installed here:

```powershell
C:\Users\wxd20\.foundry\bin
```

If PowerShell cannot find `anvil`, add Foundry to the current shell:

```powershell
$env:PATH = "$env:USERPROFILE\.foundry\bin;$env:PATH"
```

## Install

```powershell
npm install
```

If contract tests complain about Foundry libraries, install them:

```powershell
npm install forge-std --workspace contracts
cd contracts
forge install dapphub/ds-test --no-git --shallow
cd ..
```

## Start From Zero

Use three terminals.

### Terminal 1: Start Anvil

```powershell
$env:PATH = "$env:USERPROFILE\.foundry\bin;$env:PATH"
anvil
```

Keep this terminal open. The local RPC is:

```text
http://127.0.0.1:8545
Chain ID: 31337
```

Anvil resets all balances and contracts every time it restarts. If you already used Anvil and want the fixed demo addresses below, stop Anvil with `Ctrl + C` and start it again before deploying.

### Terminal 2: Deploy Contracts

```powershell
$env:PATH = "$env:USERPROFILE\.foundry\bin;$env:PATH"
npm run contracts:deploy:local
```

Expected local addresses on a fresh Anvil chain:

```text
MockUSDC: 0x5FbDB2315678afecb367f032d93F642f64180aa3
SubChain: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
```

If Anvil was not fresh, the addresses can be different. Always trust the addresses printed by the deploy command and copy those values into `.env.local`.

Write `apps/web/.env.local`:

```text
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_SUBCHAIN_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
NEXT_PUBLIC_USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

If your deploy output is different, replace `NEXT_PUBLIC_SUBCHAIN_ADDRESS` and `NEXT_PUBLIC_USDC_ADDRESS` with the printed addresses, then restart the frontend.

### Fund Your MetaMask Account

Replace `YOUR_METAMASK_ADDRESS` with the connected account.

```powershell
$env:PATH = "$env:USERPROFILE\.foundry\bin;$env:PATH"

cast send YOUR_METAMASK_ADDRESS --value 10ether --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545

cast send 0x5FbDB2315678afecb367f032d93F642f64180aa3 "mint(address,uint256)" YOUR_METAMASK_ADDRESS 1000000000000 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545
```

`1000000000000` mUSDC units equals `1,000,000 mUSDC` because `MockUSDC` uses 6 decimals.

Check balances:

```powershell
cast balance YOUR_METAMASK_ADDRESS --ether --rpc-url http://127.0.0.1:8545
cast call 0x5FbDB2315678afecb367f032d93F642f64180aa3 "balanceOf(address)(uint256)" YOUR_METAMASK_ADDRESS --rpc-url http://127.0.0.1:8545
```

### Terminal 3: Start Frontend

```powershell
npm run dev:web
```

Open the printed URL, usually:

```text
http://localhost:3000
```

If port `3000` is busy, Next.js may use `3001`. Use whatever URL it prints.

## MetaMask Setup

Add or select this network in MetaMask:

```text
Network name: Localhost 8545
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency symbol: ETH
Block explorer URL: leave blank
```

Important:

- The RPC URL must include `http://`.
- If MetaMask says `Ethereum` in a transaction popup, cancel it.
- Only confirm transactions when the network is `Localhost 8545` or chain id `31337`.
- After switching network, hard refresh the app with `Ctrl + Shift + R`.

The app shows both wallet and app chain IDs. They should both be `31337` before sending transactions.

## Demo Flow

1. Connect MetaMask.
2. Confirm the page shows `Wallet Chain ID: 31337`.
3. Click `Create $10 plan` and confirm in MetaMask.
4. Click `Approve 100 USDC` and confirm in MetaMask.
5. Click `Subscribe to plan #1` and confirm in MetaMask.

Do not expect `Charge subscription #1` to work immediately after subscribing. The plan interval is 30 days, so the contract will reject an early charge with `NotDue`.

For a quick local charge test, advance Anvil time first:

```powershell
cast rpc evm_increaseTime 2592000 --rpc-url http://127.0.0.1:8545
cast rpc evm_mine --rpc-url http://127.0.0.1:8545
```

Then click `Charge subscription #1`.

## Stop Everything

In the Anvil terminal and frontend terminal, press:

```text
Ctrl + C
```

Check no local servers remain:

```powershell
Get-NetTCPConnection -LocalPort 8545,3000,3001 -State Listen -ErrorAction SilentlyContinue
```

If there is no output, everything is stopped.

## Common Anvil Gotchas

- Restarting Anvil wipes all contracts, ETH transfers, mUSDC mints, plans, subscriptions, invoices, and approvals.
- After every Anvil restart, deploy contracts again and fund your MetaMask account again.
- Fixed addresses only hold on a fresh Anvil chain with the default test private key.
- If `planCount` reads fail or stays at `0` after you created a plan, check that `.env.local` matches the latest deploy output.
- If MetaMask shows no ETH on `Localhost 8545`, the current Anvil instance probably restarted after you funded the wallet.

## Useful Checks

```powershell
$env:PATH = "$env:USERPROFILE\.foundry\bin;$env:PATH"

cast chain-id --rpc-url http://127.0.0.1:8545
cast call 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 "planCount()(uint256)" --rpc-url http://127.0.0.1:8545
npm run contracts:test
npm run typecheck --workspace apps/web
npm run build:web
```

## Project Structure

```text
contracts/       Solidity contracts, Foundry tests, deploy script
apps/web/        Next.js wallet app and dashboard
apps/indexer/    Event indexer and PostgreSQL schema
```
