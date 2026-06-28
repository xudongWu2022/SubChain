#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { formatResult } from "./lib.mjs";

const paymentIdentifier = `local-canary-${randomUUID()}`;
const seenPayments = new Set();

function settlePayment(identifier) {
  if (seenPayments.has(identifier)) {
    return { status: "duplicate", settled: false };
  }
  seenPayments.add(identifier);
  return { status: "settled", settled: true };
}

const first = settlePayment(paymentIdentifier);
const second = settlePayment(paymentIdentifier);
const agentCard = {
  name: "SubChain Research Feed",
  url: "http://localhost:4021",
  capabilities: { streaming: false },
  skills: [{ id: "research-feed", name: "Research Feed", tags: ["x402", "subchain"] }]
};
const mcpInitialize = {
  jsonrpc: "2.0",
  id: "canary",
  result: { protocolVersion: "2025-11-25", serverInfo: { name: "subchain-service-agent", version: "0.1.0" } }
};

const results = [
  { ok: first.settled && second.status === "duplicate", label: "x402 payment-identifier idempotency canary" },
  { ok: Boolean(agentCard.name && agentCard.url && agentCard.skills[0].id), label: "A2A Agent Card canary" },
  { ok: mcpInitialize.result.protocolVersion === "2025-11-25", label: "MCP Streamable HTTP canary" }
];

for (const result of results) {
  console.log(formatResult(result.ok, result.label));
}

if (results.some((result) => !result.ok)) {
  process.exit(1);
}
