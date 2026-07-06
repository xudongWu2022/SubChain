import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { x402Client, x402HTTPClient, type PaymentPolicy } from "@x402/core/client";
import type { Network, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { appendPaymentIdentifierToExtensions } from "@x402/extensions/payment-identifier";
import { wrapFetchWithPayment } from "@x402/fetch";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  isAddress,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { erc20Abi, subChainAbi, zeroAddress } from "./contracts.js";
import { proposeAction, evaluatePolicy, type ActionProposal, type EconomicState } from "./decision.js";

const port = Number(process.env.AGENT_PORT ?? 4022);
const serviceUrl = process.env.SERVICE_AGENT_URL ?? "http://localhost:4021";
const databaseUrl = process.env.DATABASE_URL;
const hitlThreshold = Number(process.env.HITL_COST_THRESHOLD ?? 2_000_000);
const x402Mode = process.env.X402_MODE === "facilitator" ? "facilitator" : "local";
const x402Network = (process.env.X402_NETWORK ?? `eip155:${Number(process.env.CHAIN_ID ?? 31337)}`) as Network;
const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;
const memoryActions: Array<Record<string, unknown>> = [];
const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "subchain-consumer-agent", killSwitch: process.env.KILL_SWITCH === "true" });
});

app.get("/state", (_request, response) => {
  response.json(defaultState());
});

app.post("/cycle", async (request, response) => {
  const state = { ...defaultState(), ...(request.body?.state ?? {}) } as EconomicState;
  const proposal = proposeAction(state, { hitlThreshold, killSwitch: process.env.KILL_SWITCH === "true" });
  const policy = evaluatePolicy(state, proposal);
  const execution = policy.allowed && !proposal.requiresHitl ? await executeProposal(proposal) : { status: "not_executed" };
  const result = { cycleId: randomUUID(), state, proposal, policy, execution };

  await recordAction(result);
  response.json(result);
});

app.post("/hitl/approve", async (request, response) => {
  const approvalId = randomUUID();
  response.json({ approvalId, approved: true, request: request.body ?? {} });
});

if (process.argv.includes("--once")) {
  const state = defaultState();
  const proposal = proposeAction(state, { hitlThreshold, killSwitch: process.env.KILL_SWITCH === "true" });
  const policy = evaluatePolicy(state, proposal);
  const execution = policy.allowed && !proposal.requiresHitl ? await executeProposal(proposal) : { status: "dry_run" };
  const result = { cycleId: randomUUID(), state, proposal, policy, execution };
  await recordAction(result);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

app.listen(port, () => {
  console.log(`SubChain consumer agent listening on http://localhost:${port}`);
});

function defaultState(): EconomicState {
  return {
    monthlyBudget: Number(process.env.AGENT_MONTHLY_BUDGET ?? 5_000_000),
    committedRecurringSpend: Number(process.env.AGENT_COMMITTED_SPEND ?? 0),
    projectedUsage: Number(process.env.AGENT_PROJECTED_USAGE ?? 35),
    payPerUsePrice: Number(process.env.RESEARCH_FEED_PAY_PER_USE_PRICE ?? 100_000),
    subscriptionPrice: Number(process.env.RESEARCH_FEED_SUBSCRIPTION_PRICE ?? 2_000_000),
    includedUnits: Number(process.env.RESEARCH_FEED_INCLUDED_UNITS ?? 30),
    lowUsageStreak: Number(process.env.AGENT_LOW_USAGE_STREAK ?? 0),
    activeSubscriptionId: process.env.AGENT_ACTIVE_SUBSCRIPTION_ID ?? null
  };
}

async function executeProposal(proposal: ActionProposal) {
  if (proposal.action === "stop") {
    return { status: "stopped", reason: proposal.targetId };
  }

  if (proposal.action === "pay_per_use") {
    return executePayPerUse(proposal);
  }

  if (proposal.action === "subscribe") {
    return executeSubscribe(proposal);
  }

  return executeCancel(proposal);
}

async function executePayPerUse(proposal: ActionProposal) {
  const paymentIdentifier = `agent-${randomUUID()}`;
  if (x402Mode === "facilitator") {
    return executeFacilitatorPayPerUse(proposal, paymentIdentifier);
  }

  const settlement = await fetch(`${serviceUrl}/x402/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentIdentifier })
  })
    .then((response) => response.json())
    .catch((error) => ({ status: "settle_failed", error: error instanceof Error ? error.message : String(error) }));

  const feedUrl = new URL("/feed", serviceUrl);
  feedUrl.searchParams.set("paymentIdentifier", paymentIdentifier);
  const feed = await fetch(feedUrl)
    .then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }))
    .catch((error) => ({ status: 0, body: { error: error instanceof Error ? error.message : String(error) } }));

  return {
    status: "settled",
    mode: "local",
    paymentIdentifier,
    settlement,
    feedStatus: feed.status,
    traceId: readString((feed.body as Record<string, unknown> | null)?.traceId),
    source: readString((feed.body as Record<string, unknown> | null)?.source)
  };
}

async function executeFacilitatorPayPerUse(proposal: ActionProposal, paymentIdentifier: string) {
  const privateKey = process.env.AGENT_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY ?? process.env.KEEPER_PRIVATE_KEY;
  const receivingAddress = process.env.X402_RECEIVING_ADDRESS;
  const tokenAddress = process.env.USDC_ADDRESS;
  const missing = [
    !privateKey ? "AGENT_PRIVATE_KEY" : null,
    !isLaunchAddress(receivingAddress) ? "X402_RECEIVING_ADDRESS" : null,
    !isLaunchAddress(tokenAddress) ? "USDC_ADDRESS" : null
  ].filter(Boolean);

  if (missing.length > 0) {
    return { status: "blocked", missing };
  }

  const account = privateKeyToAccount(privateKey as Hex);
  const expectedAmount = BigInt(process.env.RESEARCH_FEED_PAY_PER_USE_PRICE ?? String(proposal.expectedCost));
  const client = new x402Client();
  client
    .register(x402Network, new ExactEvmScheme(account))
    .registerPolicy(createPaymentPolicy(x402Network, receivingAddress as Address, tokenAddress as Address, expectedAmount))
    .onBeforePaymentCreation(async ({ paymentRequired }) => {
      paymentRequired.extensions ??= {};
      appendPaymentIdentifierToExtensions(paymentRequired.extensions, paymentIdentifier);
    });

  const httpClient = new x402HTTPClient(client);
  const fetchWithPayment = wrapFetchWithPayment(fetch, httpClient);
  const feedUrl = new URL("/feed", serviceUrl);
  feedUrl.searchParams.set("paymentIdentifier", paymentIdentifier);
  feedUrl.searchParams.set("owner", account.address);

  const response = await fetchWithPayment(feedUrl);
  const result = await httpClient.processResponse(response);
  const body = result.body as Record<string, unknown> | null;
  const header = result.header as Partial<SettleResponse> | undefined;

  return {
    status: result.paymentStatus,
    mode: "facilitator",
    paymentIdentifier,
    httpStatus: result.status,
    traceId: readString(body?.traceId),
    source: readString(body?.source),
    txHash: typeof header?.transaction === "string" ? header.transaction : null,
    network: typeof header?.network === "string" ? header.network : x402Network,
    amount: typeof header?.amount === "string" ? header.amount : expectedAmount.toString()
  };
}

function createPaymentPolicy(network: Network, receivingAddress: Address, tokenAddress: Address, maxAmount: bigint): PaymentPolicy {
  return (_version: number, requirements: PaymentRequirements[]) =>
    requirements.filter((requirement) => {
      if (requirement.scheme !== "exact" || requirement.network !== network) {
        return false;
      }
      if (requirement.payTo.toLowerCase() !== receivingAddress.toLowerCase()) {
        return false;
      }
      if (requirement.asset.toLowerCase() !== tokenAddress.toLowerCase()) {
        return false;
      }
      return BigInt(requirement.amount) <= maxAmount;
    });
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function executeSubscribe(proposal: ActionProposal) {
  const executor = getChainExecutor(["SUBCHAIN_ADDRESS", "USDC_ADDRESS"]);
  if ("missing" in executor) {
    return { status: "blocked", missing: executor.missing };
  }

  const planId = BigInt(process.env.RESEARCH_FEED_PLAN_ID ?? "1");
  const amount = BigInt(process.env.RESEARCH_FEED_SUBSCRIPTION_PRICE ?? String(proposal.expectedCost));
  const approveHash = await executor.wallet.writeContract({
    address: executor.usdcAddress,
    abi: erc20Abi,
    functionName: "approve",
    args: [executor.subChainAddress, amount]
  });
  await executor.publicClient.waitForTransactionReceipt({ hash: approveHash });

  const subscribeHash = await executor.wallet.writeContract({
    address: executor.subChainAddress,
    abi: subChainAbi,
    functionName: "subscribe",
    args: [planId]
  });
  const receipt = await executor.publicClient.waitForTransactionReceipt({ hash: subscribeHash });

  const subscriptionId = receipt.logs
    .map((log) => {
      try {
        return decodeEventLog({
          abi: subChainAbi,
          data: log.data,
          topics: log.topics,
          eventName: "SubscriptionCreated"
        });
      } catch {
        return null;
      }
    })
    .find((event) => event?.eventName === "SubscriptionCreated")?.args.subscriptionId;

  return {
    status: "subscribed",
    owner: executor.accountAddress,
    planId: planId.toString(),
    subscriptionId: subscriptionId?.toString() ?? null,
    approveTxHash: approveHash,
    subscribeTxHash: subscribeHash
  };
}

async function executeCancel(proposal: ActionProposal) {
  const executor = getChainExecutor(["SUBCHAIN_ADDRESS"]);
  if ("missing" in executor) {
    return { status: "blocked", missing: executor.missing };
  }

  const subscriptionId = BigInt(proposal.targetId);
  const cancelTxHash = await executor.wallet.writeContract({
    address: executor.subChainAddress,
    abi: subChainAbi,
    functionName: "cancelSubscription",
    args: [subscriptionId]
  });
  await executor.publicClient.waitForTransactionReceipt({ hash: cancelTxHash });

  return {
    status: "cancelled",
    owner: executor.accountAddress,
    subscriptionId: subscriptionId.toString(),
    cancelTxHash
  };
}

function getChainExecutor(required: Array<"SUBCHAIN_ADDRESS" | "USDC_ADDRESS">) {
  const privateKey = process.env.AGENT_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY ?? process.env.KEEPER_PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;
  const chainId = Number(process.env.CHAIN_ID ?? 31337);
  const subChainAddress = process.env.SUBCHAIN_ADDRESS;
  const usdcAddress = process.env.USDC_ADDRESS;
  const missing: string[] = [];

  if (!rpcUrl) {
    missing.push("RPC_URL");
  }
  if (!privateKey) {
    missing.push("AGENT_PRIVATE_KEY");
  }
  if (required.includes("SUBCHAIN_ADDRESS") && !isLaunchAddress(subChainAddress)) {
    missing.push("SUBCHAIN_ADDRESS");
  }
  if (required.includes("USDC_ADDRESS") && !isLaunchAddress(usdcAddress)) {
    missing.push("USDC_ADDRESS");
  }

  if (missing.length > 0) {
    return { missing };
  }

  const account = privateKeyToAccount(privateKey as Hex);
  const chain = { ...foundry, id: chainId };
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

  return {
    accountAddress: account.address,
    publicClient,
    wallet,
    subChainAddress: subChainAddress as Address,
    usdcAddress: (usdcAddress ?? zeroAddress) as Address
  };
}

function isLaunchAddress(value: string | undefined) {
  return Boolean(value && isAddress(value) && value.toLowerCase() !== zeroAddress.toLowerCase());
}

async function recordAction(row: Record<string, unknown>) {
  if (!pool) {
    memoryActions.push(row);
    return;
  }

  try {
    await pool.query(
      `INSERT INTO agent_actions
        (cycle_id, action, target_id, expected_cost, expected_value, policy_result, execution_result, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [
        row.cycleId,
        (row.proposal as ActionProposal).action,
        (row.proposal as ActionProposal).targetId,
        (row.proposal as ActionProposal).expectedCost,
        (row.proposal as ActionProposal).expectedValue,
        JSON.stringify(row.policy),
        JSON.stringify(row.execution)
      ]
    );
  } catch (error) {
    memoryActions.push(row);
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
    console.warn(`agent action DB write failed (${code}); retained in memory for this process`);
  }
}
