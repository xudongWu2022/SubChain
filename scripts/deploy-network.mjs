#!/usr/bin/env node
import { existsSync } from "node:fs";
import { commandExists, readEnv, run } from "./lib.mjs";

const mode = process.argv[2];
if (!["testnet", "production"].includes(mode)) {
  console.error("Usage: node scripts/deploy-network.mjs <testnet|production>");
  process.exit(1);
}

const envPath = `.env.${mode}`;
if (!existsSync(envPath)) {
  console.error(`${envPath} is missing. Copy from ${envPath}.example first.`);
  process.exit(1);
}

const env = readEnv(envPath);
if (!commandExists("forge")) {
  console.error("forge is required for deployment and is not on PATH.");
  process.exit(1);
}

const result = run(
  "forge",
  ["script", "script/Deploy.s.sol", "--rpc-url", env.RPC_URL, "--broadcast", "--private-key", env.DEPLOYER_PRIVATE_KEY],
  { cwd: "contracts", env: { ...process.env, ...env } }
);
process.exit(result.status ?? 1);
