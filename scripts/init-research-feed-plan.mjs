#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { formatResult, isSet, pathWithBundledRuntime, readEnv } from "./lib.mjs";

const mode = process.argv[2] ?? "testnet";
const extraArgs = process.argv.slice(3).filter((arg) => arg !== "--");
const envPath = extraArgs[0] && !extraArgs[0].startsWith("--") ? extraArgs[0] : `.env.${mode}`;
const shouldForceCreate = process.argv.includes("--force");
const shouldFundAgent = process.argv.includes("--fund-agent") || process.env.FUND_AGENT === "true";
const shouldMintAgent = process.argv.includes("--mint-agent") || process.env.MINT_AGENT_USDC === "true";

if (!existsSync(envPath)) {
  console.error(`${envPath} is missing. Copy from ${envPath}.example and fill launch values first.`);
  process.exit(1);
}

const env = { ...process.env, ...readEnv(envPath), PATH: pathWithBundledRuntime() };
const required = ["RPC_URL", "DEPLOYER_PRIVATE_KEY", "SUBCHAIN_ADDRESS", "USDC_ADDRESS"];
const missing = required.filter((key) => !isSet(env[key]));
if (missing.length > 0) {
  console.error(`Research Feed plan init is blocked by missing input(s): ${missing.join(", ")}`);
  process.exit(1);
}

const subscriptionPrice = env.RESEARCH_FEED_SUBSCRIPTION_PRICE ?? "2000000";
const periodSeconds = env.RESEARCH_FEED_PLAN_PERIOD_SECONDS ?? (mode === "testnet" ? "86400" : "2592000");
const includedUnits = env.RESEARCH_FEED_INCLUDED_UNITS ?? "30";
const gracePeriodSeconds = env.RESEARCH_FEED_GRACE_PERIOD_SECONDS ?? (mode === "testnet" ? "86400" : "259200");
const metadataUri = env.RESEARCH_FEED_METADATA_URI ?? "ipfs://research-feed";
const serviceId = env.RESEARCH_FEED_SERVICE_ID ?? cast(["keccak", cast(["from-utf8", "research-feed"])]);
const metadataHash = env.RESEARCH_FEED_METADATA_HASH ?? cast(["keccak", cast(["from-utf8", metadataUri])]);
const desiredPlanId = BigInt(env.RESEARCH_FEED_PLAN_ID ?? "1");
const beforeCount = BigInt(cast(["call", env.SUBCHAIN_ADDRESS, "planCount()(uint256)", "--rpc-url", env.RPC_URL]));

console.log(formatResult(true, "SubChain contract", env.SUBCHAIN_ADDRESS));
console.log(formatResult(true, "USDC token", env.USDC_ADDRESS));
console.log(formatResult(true, "Current planCount", beforeCount.toString()));

let planId = beforeCount;
if (!shouldForceCreate && beforeCount >= desiredPlanId) {
  planId = desiredPlanId;
  console.log(formatResult(true, `Research Feed plan #${planId.toString()} already exists or is reserved`, "use --force to create another"));
} else {
  const expectedPlanId = beforeCount + 1n;
  console.log(`Creating Research Feed plan #${expectedPlanId.toString()} with period=${periodSeconds}s price=${subscriptionPrice}`);
  cast([
    "send",
    env.SUBCHAIN_ADDRESS,
    "createPlan(address,uint128,uint64,uint32,uint32,bytes32,bytes32,string)(uint256)",
    env.USDC_ADDRESS,
    subscriptionPrice,
    periodSeconds,
    includedUnits,
    gracePeriodSeconds,
    serviceId,
    metadataHash,
    metadataUri,
    "--private-key",
    env.DEPLOYER_PRIVATE_KEY,
    "--rpc-url",
    env.RPC_URL
  ]);
  planId = expectedPlanId;
}

if (shouldFundAgent || shouldMintAgent) {
  if (!isSet(env.AGENT_PRIVATE_KEY)) {
    console.error("Agent funding requested, but AGENT_PRIVATE_KEY is missing.");
    process.exit(1);
  }
  const agentAddress = cast(["wallet", "address", "--private-key", env.AGENT_PRIVATE_KEY]);
  console.log(formatResult(true, "Agent address", agentAddress));

  if (shouldFundAgent) {
    const gasFundWei = env.AGENT_GAS_FUND_WEI ?? "0";
    if (BigInt(gasFundWei) > 0n) {
      cast([
        "send",
        agentAddress,
        "--value",
        gasFundWei,
        "--private-key",
        env.DEPLOYER_PRIVATE_KEY,
        "--rpc-url",
        env.RPC_URL
      ]);
    } else {
      console.log(formatResult(true, "Agent gas funding skipped", "AGENT_GAS_FUND_WEI is 0"));
    }
  }

  if (shouldMintAgent) {
    const mintAmount = env.AGENT_USDC_MINT_AMOUNT ?? "0";
    if (BigInt(mintAmount) > 0n) {
      cast([
        "send",
        env.USDC_ADDRESS,
        "mint(address,uint256)",
        agentAddress,
        mintAmount,
        "--private-key",
        env.DEPLOYER_PRIVATE_KEY,
        "--rpc-url",
        env.RPC_URL
      ]);
    } else {
      console.log(formatResult(true, "Agent USDC mint skipped", "AGENT_USDC_MINT_AMOUNT is 0"));
    }
  }
}

console.log("");
console.log("Backfill these values into the launch env if needed:");
console.log(`RESEARCH_FEED_PLAN_ID=${planId.toString()}`);
console.log(`RESEARCH_FEED_SERVICE_ID=${serviceId}`);
console.log(`RESEARCH_FEED_METADATA_HASH=${metadataHash}`);

function cast(args) {
  const result = spawnSync("cast", args, {
    env,
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  return result.stdout.trim();
}
