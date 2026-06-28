#!/usr/bin/env node
import { existsSync } from "node:fs";
import { formatResult, isSet, readEnv } from "./lib.mjs";

const mode = process.argv[2] ?? "production";
const envPath = process.argv[3] ?? `.env.${mode}`;
const requiredByMode = {
  local: ["RPC_URL", "DATABASE_URL", "CHAIN_ID", "HITL_SHARED_SECRET"],
  testnet: ["APP_BASE_URL", "SERVICE_AGENT_URL", "RPC_URL", "DATABASE_URL", "CHAIN_ID", "DEPLOYER_PRIVATE_KEY", "KEEPER_PRIVATE_KEY", "AGENT_PRIVATE_KEY", "X402_FACILITATOR_URL", "X402_RECEIVING_ADDRESS", "HITL_SHARED_SECRET", "ALERT_WEBHOOK_URL"],
  production: ["APP_BASE_URL", "SERVICE_AGENT_URL", "RPC_URL", "DATABASE_URL", "CHAIN_ID", "DEPLOYER_PRIVATE_KEY", "KEEPER_PRIVATE_KEY", "AGENT_PRIVATE_KEY", "X402_FACILITATOR_URL", "X402_RECEIVING_ADDRESS", "DOMAIN_NAME", "VPS_HOST", "VPS_USER", "VPS_SSH_KEY_PATH", "HITL_SHARED_SECRET", "ALERT_WEBHOOK_URL", "BACKUP_BUCKET"]
};

const required = requiredByMode[mode];
if (!required) {
  console.error(`Unknown launch mode: ${mode}`);
  process.exit(1);
}

if (!existsSync(envPath)) {
  console.log(formatResult(false, `${envPath} exists`, "copy from example and fill values"));
  process.exit(1);
}

const env = readEnv(envPath);
const missing = required.filter((key) => !isSet(env[key]));

for (const key of required) {
  console.log(formatResult(!missing.includes(key), key, missing.includes(key) ? "missing or placeholder" : "set"));
}

if (missing.length > 0) {
  console.error(`${mode} launch is blocked by ${missing.length} missing input(s): ${missing.join(", ")}`);
  process.exit(1);
}
