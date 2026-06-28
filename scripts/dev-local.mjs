#!/usr/bin/env node
import { commandExists, run } from "./lib.mjs";

const missing = ["anvil", "forge"].filter((command) => !commandExists(command));
if (missing.length > 0) {
  console.error(`Local dev stack is blocked until these tools are installed or on PATH: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Start Anvil in terminal 1: anvil");
console.log("Deploy contracts in terminal 2: npm run contracts:deploy:local");
console.log("Start services in separate terminals: npm run dev:indexer, npm run dev:service, npm run dev:agent, npm run dev:web");
const result = run("node", ["scripts/preflight.mjs"], { stdio: "inherit" });
process.exit(result.status ?? 1);
