import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { createPublicClient, getAddress, http, isAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import { foundry } from "viem/chains";
import { subChainAbi, zeroAddress } from "./contracts.js";

const port = Number(process.env.SERVICE_AGENT_PORT ?? 4021);
const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const chainId = Number(process.env.CHAIN_ID ?? 31337);
const subChainAddress = (process.env.SUBCHAIN_ADDRESS ?? zeroAddress) as Address;
const databaseUrl = process.env.DATABASE_URL;
const baseUrl = process.env.SERVICE_AGENT_URL ?? `http://localhost:${port}`;
const killSwitch = process.env.KILL_SWITCH === "true";
const serviceId = (process.env.RESEARCH_FEED_SERVICE_ID as Hex | undefined) ?? keccak256(stringToHex("research-feed"));
const payPerUsePrice = process.env.RESEARCH_FEED_PAY_PER_USE_PRICE ?? "100000";
const subscriptionPrice = process.env.RESEARCH_FEED_SUBSCRIPTION_PRICE ?? "2000000";
const includedUnits = Number(process.env.RESEARCH_FEED_INCLUDED_UNITS ?? 30);

const client = createPublicClient({
  chain: { ...foundry, id: chainId },
  transport: http(rpcUrl)
});
const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;
const memoryPayments = new Set<string>();
const memoryUsage: Array<Record<string, unknown>> = [];
const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "subchain-service-agent", killSwitch, chainId });
});

app.get(["/.well-known/agent.json", "/.well-known/agent-card.json"], (_request, response) => {
  response.json({
    name: "SubChain Research Feed Agent",
    description: "Research feed with x402 pay-per-use and SubChain subscription entitlement.",
    url: baseUrl,
    version: "0.1.0",
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "research-feed",
        name: "Research Feed",
        description: "Returns a metered research feed artifact.",
        tags: ["research", "x402", "subchain"],
        examples: ["Fetch daily AI infrastructure updates"]
      }
    ],
    payments: {
      x402: { endpoint: `${baseUrl}/feed`, price: payPerUsePrice },
      subchain: { serviceId, subscriptionPrice, includedUnits }
    }
  });
});

app.get("/feed", async (request, response) => {
  if (killSwitch) {
    response.status(503).json({ error: "service disabled by kill switch" });
    return;
  }

  const owner = parseAddress(request.query.owner);
  const paymentIdentifier = getPaymentIdentifier(request);
  const traceId = randomUUID();
  let entitlement = false;
  let subscriptionId = "0";
  let remainingUnits = 0;

  if (owner && subChainAddress !== zeroAddress) {
    try {
      entitlement = await client.readContract({
        address: subChainAddress,
        abi: subChainAbi,
        functionName: "hasEntitlement",
        args: [owner, serviceId]
      });
      if (entitlement) {
        const result = await client.readContract({
          address: subChainAddress,
          abi: subChainAbi,
          functionName: "entitlementOf",
          args: [owner, serviceId]
        });
        subscriptionId = result.subscriptionId.toString();
        remainingUnits = Number(result.remainingUnits);
      }
    } catch (error) {
      console.warn("entitlement read failed", error);
    }
  }

  if (!entitlement) {
    if (!paymentIdentifier || !(await hasSettledPayment(paymentIdentifier))) {
      response
        .status(402)
        .setHeader("Payment-Required", JSON.stringify(buildPaymentRequirements(paymentIdentifier)))
        .json({
          error: "payment required",
          x402: buildPaymentRequirements(paymentIdentifier),
          traceId
        });
      return;
    }
  }

  await recordServiceUsage({
    traceId,
    owner: owner ?? zeroAddress,
    serviceId,
    subscriptionId,
    paymentIdentifier: paymentIdentifier ?? "",
    units: 1,
    source: entitlement ? "subscription" : "x402"
  });

  response.json({
    traceId,
    serviceId,
    source: entitlement ? "subscription" : "x402",
    subscriptionId,
    remainingUnits,
    artifact: {
      title: "Research Feed",
      items: [
        "x402 handles request-level payment.",
        "SubChain handles renewable entitlement.",
        "Policy + HITL keeps agents inside budget."
      ]
    }
  });
});

app.post("/x402/settle", async (request, response) => {
  const paymentIdentifier = String(request.body?.paymentIdentifier ?? "");
  if (!paymentIdentifier) {
    response.status(400).json({ error: "paymentIdentifier is required" });
    return;
  }

  const result = await settlePayment(paymentIdentifier);
  response.json(result);
});

app.post("/a2a/tasks", async (request, response) => {
  const taskId = randomUUID();
  const artifactId = randomUUID();
  response.json({
    taskId,
    status: "completed",
    artifacts: [
      {
        artifactId,
        type: "application/json",
        content: {
          skill: "research-feed",
          endpoint: `${baseUrl}/feed`,
          serviceId,
          pricing: { payPerUsePrice, subscriptionPrice, includedUnits },
          input: request.body ?? {}
        }
      }
    ]
  });
});

app.post("/mcp", async (request, response) => {
  const id = request.body?.id ?? null;
  const method = request.body?.method;

  if (method === "initialize") {
    response.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-11-25",
        serverInfo: { name: "subchain-service-agent", version: "0.1.0" },
        capabilities: { tools: {} }
      }
    });
    return;
  }

  if (method === "tools/list") {
    response.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "get_research_feed",
            description: "Fetch the SubChain research feed through entitlement or x402 payment.",
            inputSchema: {
              type: "object",
              properties: {
                owner: { type: "string" },
                paymentIdentifier: { type: "string" }
              }
            }
          }
        ]
      }
    });
    return;
  }

  response.json({ jsonrpc: "2.0", id, result: { ok: true, note: "Use GET /feed for payment-gated resources." } });
});

app.listen(port, () => {
  console.log(`SubChain service-agent listening on ${baseUrl}`);
});

function parseAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !isAddress(value)) {
    return null;
  }
  return getAddress(value);
}

function getPaymentIdentifier(request: express.Request) {
  const header = request.header("x-payment-identifier") ?? request.header("payment-identifier");
  const query = request.query.paymentIdentifier;
  if (header) {
    return header;
  }
  return typeof query === "string" ? query : null;
}

function buildPaymentRequirements(paymentIdentifier: string | null) {
  return {
    scheme: "exact",
    network: process.env.X402_NETWORK ?? "local",
    asset: process.env.USDC_ADDRESS ?? zeroAddress,
    payTo: process.env.X402_RECEIVING_ADDRESS ?? zeroAddress,
    maxAmountRequired: payPerUsePrice,
    resource: `${baseUrl}/feed`,
    description: "SubChain Research Feed pay-per-use access",
    mimeType: "application/json",
        paymentIdentifier: paymentIdentifier ?? randomUUID()
  };
}

async function settlePayment(paymentIdentifier: string) {
  if (!pool) {
    const duplicate = memoryPayments.has(paymentIdentifier);
    memoryPayments.add(paymentIdentifier);
    return { status: duplicate ? "duplicate" : "settled", paymentIdentifier };
  }

  const result = await pool.query(
    `INSERT INTO x402_payments (payment_identifier, status, amount, settled_at)
     VALUES ($1, 'settled', $2, NOW())
     ON CONFLICT (payment_identifier) DO NOTHING`,
    [paymentIdentifier, payPerUsePrice]
  );
  return { status: result.rowCount === 0 ? "duplicate" : "settled", paymentIdentifier };
}

async function hasSettledPayment(paymentIdentifier: string) {
  if (!pool) {
    return memoryPayments.has(paymentIdentifier);
  }

  const result = await pool.query("SELECT 1 FROM x402_payments WHERE payment_identifier = $1 AND status = 'settled'", [
    paymentIdentifier
  ]);
  return (result.rowCount ?? 0) > 0;
}

async function recordServiceUsage(row: Record<string, unknown>) {
  if (!pool) {
    memoryUsage.push(row);
    return;
  }

  await pool.query(
    `INSERT INTO service_usage
      (trace_id, owner, service_id, subscription_id, payment_identifier, units, source, success, latency_ms, artifact_hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,0,$8,NOW())`,
    [
      row.traceId,
      row.owner,
      row.serviceId,
      row.subscriptionId,
      row.paymentIdentifier,
      row.units,
      row.source,
      keccak256(stringToHex(JSON.stringify(row)))
    ]
  );
}
