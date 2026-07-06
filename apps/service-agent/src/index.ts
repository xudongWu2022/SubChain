import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { HTTPFacilitatorClient, type RoutesConfig } from "@x402/core/server";
import type { Network, PaymentPayload, SettleResponse } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddlewareFromHTTPServer, x402HTTPResourceServer, x402ResourceServer } from "@x402/express";
import {
  declarePaymentIdentifierExtension,
  extractAndValidatePaymentIdentifier,
  extractPaymentIdentifier,
  PAYMENT_IDENTIFIER,
  paymentIdentifierResourceServerExtension
} from "@x402/extensions/payment-identifier";
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
const x402Mode = process.env.X402_MODE === "facilitator" ? "facilitator" : "local";
const x402Network = (process.env.X402_NETWORK ?? `eip155:${chainId}`) as Network;
const x402FacilitatorUrl = process.env.X402_FACILITATOR_URL;
const x402ReceivingAddress = process.env.X402_RECEIVING_ADDRESS;

const client = createPublicClient({
  chain: { ...foundry, id: chainId },
  transport: http(rpcUrl)
});
const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;
type PaymentEvidence = {
  paymentIdentifier: string;
  status: "settled";
  amount: string;
  txHash: string | null;
  network: string | null;
  facilitatorUrl: string | null;
  paymentResponse: unknown | null;
};

const memoryPayments = new Map<string, PaymentEvidence>();
const memoryUsage: Array<Record<string, unknown>> = [];
const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "subchain-service-agent", killSwitch, chainId, x402Mode, x402Network });
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
      x402: { endpoint: `${baseUrl}/feed`, price: payPerUsePrice, mode: x402Mode, network: x402Network },
      subchain: { serviceId, subscriptionPrice, includedUnits }
    }
  });
});

const facilitatorPaymentMiddleware = x402Mode === "facilitator" ? createFacilitatorPaymentMiddleware() : null;
if (facilitatorPaymentMiddleware) {
  app.use(facilitatorPaymentMiddleware);
}

app.get("/feed", handleFeed);

async function handleFeed(request: express.Request, response: express.Response) {
  if (killSwitch) {
    response.status(503).json({ error: "service disabled by kill switch" });
    return;
  }

  const owner = parseAddress(request.query.owner);
  const paymentIdentifier = getPaymentIdentifier(request);
  const traceId = randomUUID();
  const entitlement = await resolveEntitlement(owner);

  if (!entitlement.active) {
    if (x402Mode === "facilitator" && !facilitatorPaymentMiddleware) {
      response.status(503).json({ error: "x402 facilitator mode is not fully configured" });
      return;
    }
    if (x402Mode === "local" && (!paymentIdentifier || !(await hasSettledPayment(paymentIdentifier)))) {
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
    subscriptionId: entitlement.subscriptionId,
    paymentIdentifier: paymentIdentifier ?? "",
    units: 1,
    source: entitlement.active ? "subscription" : "x402"
  });

  response.json({
    traceId,
    serviceId,
    source: entitlement.active ? "subscription" : "x402",
    subscriptionId: entitlement.subscriptionId,
    remainingUnits: entitlement.remainingUnits,
    artifact: {
      title: "Research Feed",
      items: [
        "x402 handles request-level payment.",
        "SubChain handles renewable entitlement.",
        "Policy + HITL keeps agents inside budget."
      ]
    }
  });
}

app.post("/x402/settle", async (request, response) => {
  if (x402Mode !== "local") {
    response.status(404).json({ error: "local x402 settlement endpoint is disabled in facilitator mode" });
    return;
  }

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
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string" || !isAddress(candidate)) {
    return null;
  }
  return getAddress(candidate);
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
    network: x402Network,
    asset: process.env.USDC_ADDRESS ?? zeroAddress,
    payTo: process.env.X402_RECEIVING_ADDRESS ?? zeroAddress,
    amount: payPerUsePrice,
    resource: `${baseUrl}/feed`,
    description: "SubChain Research Feed pay-per-use access",
    mimeType: "application/json",
    paymentIdentifier: paymentIdentifier ?? randomUUID()
  };
}

async function settlePayment(paymentIdentifier: string) {
  const existing = await getSettledPayment(paymentIdentifier);
  if (existing) {
    return { status: "duplicate", paymentIdentifier };
  }

  await recordX402Payment({
    paymentIdentifier,
    status: "settled",
    amount: payPerUsePrice,
    txHash: null,
    network: "local",
    facilitatorUrl: null,
    paymentResponse: null
  });

  return { status: "settled", paymentIdentifier };
}

async function hasSettledPayment(paymentIdentifier: string) {
  return Boolean(await getSettledPayment(paymentIdentifier));
}

async function getSettledPayment(paymentIdentifier: string): Promise<PaymentEvidence | null> {
  const memoryPayment = memoryPayments.get(paymentIdentifier);
  if (memoryPayment) {
    return memoryPayment;
  }

  if (!pool) {
    return null;
  }

  const result = await pool.query(
    `SELECT payment_identifier, status, amount::text, tx_hash, network, facilitator_url, payment_response
     FROM x402_payments
     WHERE payment_identifier = $1 AND status = 'settled'`,
    [paymentIdentifier]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    paymentIdentifier: row.payment_identifier,
    status: "settled",
    amount: row.amount,
    txHash: row.tx_hash ?? null,
    network: row.network ?? null,
    facilitatorUrl: row.facilitator_url ?? null,
    paymentResponse: row.payment_response ?? null
  };
}

async function recordX402Payment(evidence: PaymentEvidence) {
  if (!memoryPayments.has(evidence.paymentIdentifier)) {
    memoryPayments.set(evidence.paymentIdentifier, evidence);
  }

  if (!pool) {
    return;
  }

  await pool.query(
    `INSERT INTO x402_payments
      (payment_identifier, status, amount, settled_at, network, facilitator_url, tx_hash, payment_response)
     VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
     ON CONFLICT (payment_identifier) DO NOTHING`,
    [
      evidence.paymentIdentifier,
      evidence.status,
      evidence.amount,
      evidence.network,
      evidence.facilitatorUrl,
      evidence.txHash,
      JSON.stringify(evidence.paymentResponse)
    ]
  );
}

function createFacilitatorPaymentMiddleware() {
  if (!x402FacilitatorUrl || !isLaunchAddress(x402ReceivingAddress) || !isLaunchAddress(process.env.USDC_ADDRESS)) {
    console.warn("x402 facilitator mode is enabled but X402_FACILITATOR_URL, X402_RECEIVING_ADDRESS, or USDC_ADDRESS is missing.");
    return null;
  }
  const receivingAddress = x402ReceivingAddress as string;
  const tokenAddress = process.env.USDC_ADDRESS as string;

  const routes: RoutesConfig = {
    "GET /feed": {
      accepts: [
        {
          scheme: "exact",
          price: { amount: payPerUsePrice, asset: tokenAddress },
          network: x402Network,
          payTo: receivingAddress
        }
      ],
      resource: `${baseUrl}/feed`,
      description: "SubChain Research Feed pay-per-use access",
      mimeType: "application/json",
      extensions: {
        [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true)
      },
      unpaidResponseBody: () => ({
        contentType: "application/json",
        body: { error: "payment required", traceId: randomUUID() }
      })
    }
  };

  const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: x402FacilitatorUrl }))
    .register(x402Network, new ExactEvmScheme())
    .registerExtension(paymentIdentifierResourceServerExtension)
    .onBeforeSettle(async (context) => {
      const { id, validation } = extractAndValidatePaymentIdentifier(context.paymentPayload as PaymentPayload);
      if (!validation.valid) {
        return { abort: true, reason: validation.errors?.join("; ") ?? "invalid payment identifier" };
      }
      if (!id) {
        return { abort: true, reason: "payment identifier is required" };
      }

      const existing = await getSettledPayment(id);
      if (!existing) {
        return;
      }

      return {
        skip: true,
        result: {
          success: true,
          transaction: existing.txHash ?? "",
          network: (existing.network ?? x402Network) as Network,
          amount: existing.amount,
          extra: { idempotency: "duplicate" }
        }
      };
    })
    .onAfterSettle(async (context) => {
      const paymentIdentifier = extractPaymentIdentifier(context.paymentPayload as PaymentPayload);
      if (!paymentIdentifier) {
        return;
      }

      const result = context.result as SettleResponse;
      await recordX402Payment({
        paymentIdentifier,
        status: "settled",
        amount: result.amount ?? context.requirements.amount,
        txHash: result.transaction || null,
        network: result.network ?? context.requirements.network,
        facilitatorUrl: x402FacilitatorUrl,
        paymentResponse: result
      });
  });

  const httpServer = new x402HTTPResourceServer(resourceServer, routes).onProtectedRequest(async (context) => {
    const ownerValue = context.adapter.getQueryParam?.("owner");
    const owner = parseAddress(ownerValue);
    const entitlement = await resolveEntitlement(owner);
    return entitlement.active ? { grantAccess: true } : undefined;
  });

  return paymentMiddlewareFromHTTPServer(httpServer);
}

async function resolveEntitlement(owner: Address | null) {
  const empty = { active: false, subscriptionId: "0", remainingUnits: 0 };
  if (!owner || subChainAddress === zeroAddress) {
    return empty;
  }

  try {
    const active = await client.readContract({
      address: subChainAddress,
      abi: subChainAbi,
      functionName: "hasEntitlement",
      args: [owner, serviceId]
    });

    if (!active) {
      return empty;
    }

    const result = await client.readContract({
      address: subChainAddress,
      abi: subChainAbi,
      functionName: "entitlementOf",
      args: [owner, serviceId]
    });

    return {
      active: true,
      subscriptionId: result.subscriptionId.toString(),
      remainingUnits: Number(result.remainingUnits)
    };
  } catch (error) {
    console.warn("entitlement read failed", error);
    return empty;
  }
}

function isLaunchAddress(value: string | undefined) {
  return Boolean(value && isAddress(value) && value.toLowerCase() !== zeroAddress.toLowerCase());
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
