import "dotenv/config";
import { createPublicClient, getAddress, http, parseAbiItem, type Address } from "viem";
import { foundry } from "viem/chains";
import { pool, getLastIndexedBlock, setLastIndexedBlock } from "./db.js";
import { subChainAbi } from "./abi.js";

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const subChainAddress = getAddress(process.env.SUBCHAIN_ADDRESS ?? "0x0000000000000000000000000000000000000000");
const startBlock = BigInt(process.env.START_BLOCK ?? "0");

const client = createPublicClient({
  chain: foundry,
  transport: http(rpcUrl)
});

const eventTopics = [
  parseAbiItem("event PlanCreated(uint256 indexed planId,address indexed merchant,address indexed token,uint256 amount,uint256 interval,uint256 gracePeriod,string metadataURI)"),
  parseAbiItem("event PlanStatusChanged(uint256 indexed planId,bool active)"),
  parseAbiItem("event SubscriptionCreated(uint256 indexed subscriptionId,uint256 indexed planId,address indexed subscriber,uint256 nextChargeAt)"),
  parseAbiItem("event SubscriptionCanceled(uint256 indexed subscriptionId,address indexed subscriber,uint256 canceledAt)"),
  parseAbiItem("event InvoicePaid(uint256 indexed invoiceId,uint256 indexed subscriptionId,uint256 indexed planId,address subscriber,address merchant,address token,uint256 amount,uint256 paidAt,uint256 nextChargeAt)"),
  parseAbiItem("event InvoiceRefunded(uint256 indexed invoiceId,address indexed subscriber,uint256 amount)")
];

async function main() {
  console.log(`SubChain indexer listening on ${rpcUrl}`);
  console.log(`Contract: ${subChainAddress}`);

  await backfill();

  client.watchContractEvent({
    address: subChainAddress,
    abi: subChainAbi,
    onLogs: async (logs) => {
      for (const log of logs) {
        await handleLog(log);
        await setLastIndexedBlock(log.blockNumber ?? 0n);
      }
    }
  });
}

async function backfill() {
  const latestBlock = await client.getBlockNumber();
  const fromBlock = (await getLastIndexedBlock(startBlock)) + 1n;
  if (fromBlock > latestBlock) {
    return;
  }

  const logs = await client.getLogs({
    address: subChainAddress,
    events: eventTopics,
    fromBlock,
    toBlock: latestBlock
  });

  for (const log of logs) {
    await handleLog(log);
  }

  await setLastIndexedBlock(latestBlock);
  console.log(`Backfilled ${logs.length} logs through block ${latestBlock}`);
}

async function handleLog(log: DecodedLog) {
  if (!log.eventName) {
    return;
  }

  switch (log.eventName) {
    case "PlanCreated":
      await upsertPlan(log);
      break;
    case "PlanStatusChanged":
      await updatePlanStatus(log);
      break;
    case "SubscriptionCreated":
      await upsertSubscription(log);
      break;
    case "SubscriptionCanceled":
      await cancelSubscription(log);
      break;
    case "InvoicePaid":
      await upsertInvoice(log);
      break;
    case "InvoiceRefunded":
      await markInvoiceRefunded(log);
      break;
  }
}

async function upsertPlan(log: DecodedLog) {
  const args = log.args;
  await pool.query(
    `INSERT INTO plans
      (plan_id, merchant, token, amount, interval_seconds, grace_period_seconds, metadata_uri, active, created_block, created_tx)
     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9)
     ON CONFLICT (plan_id) DO UPDATE SET
      merchant = EXCLUDED.merchant,
      token = EXCLUDED.token,
      amount = EXCLUDED.amount,
      interval_seconds = EXCLUDED.interval_seconds,
      grace_period_seconds = EXCLUDED.grace_period_seconds,
      metadata_uri = EXCLUDED.metadata_uri`,
    [
      args.planId.toString(),
      normalizeAddress(args.merchant),
      normalizeAddress(args.token),
      args.amount.toString(),
      args.interval.toString(),
      args.gracePeriod.toString(),
      args.metadataURI,
      log.blockNumber?.toString() ?? "0",
      log.transactionHash
    ]
  );
}

async function updatePlanStatus(log: DecodedLog) {
  await pool.query("UPDATE plans SET active = $2 WHERE plan_id = $1", [log.args.planId.toString(), log.args.active]);
}

async function upsertSubscription(log: DecodedLog) {
  const args = log.args;
  await pool.query(
    `INSERT INTO subscriptions
      (subscription_id, plan_id, subscriber, next_charge_at, canceled, created_block, created_tx)
     VALUES ($1,$2,$3,$4,FALSE,$5,$6)
     ON CONFLICT (subscription_id) DO UPDATE SET
      next_charge_at = EXCLUDED.next_charge_at,
      canceled = FALSE`,
    [
      args.subscriptionId.toString(),
      args.planId.toString(),
      normalizeAddress(args.subscriber),
      args.nextChargeAt.toString(),
      log.blockNumber?.toString() ?? "0",
      log.transactionHash
    ]
  );
}

async function cancelSubscription(log: DecodedLog) {
  await pool.query("UPDATE subscriptions SET canceled = TRUE WHERE subscription_id = $1", [
    log.args.subscriptionId.toString()
  ]);
}

async function upsertInvoice(log: DecodedLog) {
  const args = log.args;
  await pool.query(
    `INSERT INTO invoices
      (invoice_id, subscription_id, plan_id, subscriber, merchant, token, amount, paid_at, next_charge_at, status, tx_hash, block_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'paid',$10,$11)
     ON CONFLICT (invoice_id) DO UPDATE SET status = 'paid'`,
    [
      args.invoiceId.toString(),
      args.subscriptionId.toString(),
      args.planId.toString(),
      normalizeAddress(args.subscriber),
      normalizeAddress(args.merchant),
      normalizeAddress(args.token),
      args.amount.toString(),
      args.paidAt.toString(),
      args.nextChargeAt.toString(),
      log.transactionHash,
      log.blockNumber?.toString() ?? "0"
    ]
  );

  await pool.query("UPDATE subscriptions SET next_charge_at = $2 WHERE subscription_id = $1", [
    args.subscriptionId.toString(),
    args.nextChargeAt.toString()
  ]);
}

async function markInvoiceRefunded(log: DecodedLog) {
  await pool.query("UPDATE invoices SET status = 'refunded' WHERE invoice_id = $1", [log.args.invoiceId.toString()]);
}

function normalizeAddress(address: Address): string {
  return getAddress(address).toLowerCase();
}

type DecodedLog = {
  eventName?: string;
  args: Record<string, any>;
  blockNumber?: bigint;
  transactionHash?: `0x${string}`;
};

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
