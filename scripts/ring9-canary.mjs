#!/usr/bin/env node
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { formatResult, isSet, readEnv } from "./lib.mjs";

const mode = process.argv[2] ?? "testnet";
const extraArgs = process.argv.slice(3).filter((arg) => arg !== "--");
const envPath = extraArgs[0] && !extraArgs[0].startsWith("--") ? extraArgs[0] : `.env.${mode}`;

if (!existsSync(envPath)) {
  console.error(`${envPath} is missing. Copy from ${envPath}.example and fill launch values first.`);
  process.exit(1);
}

const env = { ...process.env, ...readEnv(envPath) };
const serviceUrl = env.SERVICE_AGENT_URL;
const agentUrl = env.AGENT_BASE_URL;
const required = ["SERVICE_AGENT_URL", "AGENT_BASE_URL", "X402_MODE"];
const missing = required.filter((key) => !isSet(env[key]));
if (missing.length > 0) {
  console.error(`Ring 9 canary is blocked by missing input(s): ${missing.join(", ")}`);
  process.exit(1);
}

const results = [];
let failed = 0;

await check("A2A Agent Card", async () => {
  const body = await json(`${serviceUrl}/.well-known/agent.json`);
  return Boolean(body.name && body.payments?.x402?.endpoint && body.skills?.[0]?.id);
});

await check("A2A task artifact", async () => {
  const body = await json(`${serviceUrl}/a2a/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ goal: "Fetch daily AI infrastructure updates" })
  });
  return Boolean(body.taskId && body.artifacts?.[0]?.content?.endpoint);
});

await check("MCP initialize", async () => {
  const body = await json(`${serviceUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "ring9", method: "initialize", params: {} })
  });
  return body.result?.serverInfo?.name === "subchain-service-agent";
});

await check("Unpaid feed returns HTTP 402", async () => {
  const response = await fetch(`${serviceUrl}/feed`);
  return response.status === 402;
});

if (env.X402_MODE === "local") {
  const paymentIdentifier = `ring9-local-${randomUUID()}`;
  await check("Local x402 settle", async () => {
    const body = await json(`${serviceUrl}/x402/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentIdentifier })
    });
    return body.status === "settled";
  });

  await check("Local x402 duplicate idempotency", async () => {
    const body = await json(`${serviceUrl}/x402/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentIdentifier })
    });
    return body.status === "duplicate";
  });

  await check("Local paid feed returns artifact", async () => {
    const body = await json(`${serviceUrl}/feed?paymentIdentifier=${encodeURIComponent(paymentIdentifier)}`);
    return body.source === "x402" && Boolean(body.traceId);
  });
}

await check("Consumer low-usage cycle", async () => {
  const body = await json(`${agentUrl}/cycle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: { projectedUsage: 8 } })
  });
  return body.proposal?.action === "pay_per_use" && body.execution?.paymentIdentifier;
});

await check("Consumer high-usage HITL gate", async () => {
  const body = await json(`${agentUrl}/cycle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: { projectedUsage: 35 } })
  });
  return body.proposal?.action === "subscribe" && body.policy?.violations?.includes("hitl_required");
});

for (const result of results) {
  console.log(formatResult(result.ok, result.label, result.detail));
}

if (failed > 0) {
  console.error(`Ring 9 canary failed with ${failed} issue(s).`);
  process.exit(1);
}

async function check(label, fn) {
  try {
    const ok = await fn();
    if (!ok) {
      failed += 1;
    }
    results.push({ label, ok });
  } catch (error) {
    failed += 1;
    results.push({ label, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

async function json(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}
