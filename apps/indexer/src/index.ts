import "dotenv/config";
import { createPublicClient, getAddress, http, parseAbiItem, type Address } from "viem";
import { foundry } from "viem/chains";
import { pool, getLastIndexedBlock, setLastIndexedBlock } from "./db.js";
import { subChainAbi } from "./abi.js";

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const subChainAddress = getAddress(process.env.SUBCHAIN_ADDRESS ?? "0x0000000000000000000000000000000000000000");
const startBlock = BigInt(process.env.START_BLOCK ?? "0");
const chainId = BigInt(process.env.CHAIN_ID ?? "31337");
const subscriptionStatuses = ["PendingActivation", "Active", "PastDue", "Suspended", "Cancelled", "Expired"];

const client = createPublicClient({
  chain: { ...foundry, id: Number(chainId) },
  transport: http(rpcUrl)
});

const eventTopics = [
  parseAbiItem("event PlanCreated(uint256 indexed planId,address indexed merchant,address indexed token,uint128 price,uint64 period,uint32 includedUnits,uint32 gracePeriod,uint32 version,bytes32 serviceId,bytes32 serviceMetadataHash,string metadataURI)"),
  parseAbiItem("event PlanStatusChanged(uint256 indexed planId,bool active)"),
  parseAbiItem("event SubscriptionCreated(uint256 indexed subscriptionId,uint256 indexed planId,address indexed owner,uint32 planVersion,uint64 nextChargeAt,bytes32 serviceId)"),
  parseAbiItem("event SubscriptionStatusChanged(uint256 indexed subscriptionId,uint8 status,uint64 nextChargeAt,uint64 graceEndsAt)"),
  parseAbiItem("event SubscriptionCanceled(uint256 indexed subscriptionId,address indexed owner,uint256 canceledAt)"),
  parseAbiItem("event UsageRecorded(uint256 indexed subscriptionId,bytes32 indexed serviceId,uint32 units,uint32 usedUnits)"),
  parseAbiItem("event InvoiceReserved(uint256 indexed invoiceId,bytes32 indexed invoiceKey,uint256 indexed subscriptionId,uint32 periodIndex,uint64 dueAt)"),
  parseAbiItem("event InvoicePaid(uint256 indexed invoiceId,bytes32 indexed invoiceKey,uint256 indexed subscriptionId,uint256 planId,address subscriber,address merchant,address token,uint128 amount,uint64 paidAt,uint64 nextChargeAt)"),
  parseAbiItem("event InvoiceFailed(uint256 indexed invoiceId,bytes32 indexed invoiceKey,uint256 indexed subscriptionId,string reason,uint64 graceEndsAt)"),
  parseAbiItem("event InvoiceRefunded(uint256 indexed invoiceId,address indexed subscriber,uint128 amount)")
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
        await setChainCursor(log.blockNumber ?? 0n, log.blockHash);
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
  await setChainCursor(latestBlock, null);
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
    case "SubscriptionStatusChanged":
      await updateSubscriptionStatus(log);
      break;
    case "SubscriptionCanceled":
      await updateSubscriptionCancelled(log);
      break;
    case "UsageRecorded":
      await upsertUsage(log);
      break;
    case "InvoiceReserved":
      await reserveInvoice(log);
      break;
    case "InvoicePaid":
      await markInvoicePaid(log);
      break;
    case "InvoiceFailed":
      await markInvoiceFailed(log);
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
      (chain_id, plan_id, merchant, token, price, period_seconds, included_units, grace_period_seconds, version, service_id, service_metadata_hash, metadata_uri, active, created_block, created_tx)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13,$14)
     ON CONFLICT (chain_id, plan_id) DO UPDATE SET
      merchant = EXCLUDED.merchant,
      token = EXCLUDED.token,
      price = EXCLUDED.price,
      period_seconds = EXCLUDED.period_seconds,
      included_units = EXCLUDED.included_units,
      grace_period_seconds = EXCLUDED.grace_period_seconds,
      version = EXCLUDED.version,
      service_id = EXCLUDED.service_id,
      service_metadata_hash = EXCLUDED.service_metadata_hash,
      metadata_uri = EXCLUDED.metadata_uri`,
    [
      chainId.toString(),
      args.planId.toString(),
      normalizeAddress(args.merchant),
      normalizeAddress(args.token),
      args.price.toString(),
      args.period.toString(),
      args.includedUnits.toString(),
      args.gracePeriod.toString(),
      args.version.toString(),
      args.serviceId,
      args.serviceMetadataHash,
      args.metadataURI,
      log.blockNumber?.toString() ?? "0",
      log.transactionHash
    ]
  );
}

async function updatePlanStatus(log: DecodedLog) {
  await pool.query("UPDATE plans SET active = $3 WHERE chain_id = $1 AND plan_id = $2", [
    chainId.toString(),
    log.args.planId.toString(),
    log.args.active
  ]);
}

async function upsertSubscription(log: DecodedLog) {
  const args = log.args;
  await pool.query(
    `INSERT INTO subscriptions
      (chain_id, subscription_id, plan_id, owner, plan_version, status, next_charge_at, service_id, created_block, created_tx)
     VALUES ($1,$2,$3,$4,$5,'PendingActivation',$6,$7,$8,$9)
     ON CONFLICT (chain_id, subscription_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      owner = EXCLUDED.owner,
      plan_version = EXCLUDED.plan_version,
      next_charge_at = EXCLUDED.next_charge_at,
      service_id = EXCLUDED.service_id`,
    [
      chainId.toString(),
      args.subscriptionId.toString(),
      args.planId.toString(),
      normalizeAddress(args.owner),
      args.planVersion.toString(),
      args.nextChargeAt.toString(),
      args.serviceId,
      log.blockNumber?.toString() ?? "0",
      log.transactionHash
    ]
  );
}

async function updateSubscriptionStatus(log: DecodedLog) {
  const args = log.args;
  await pool.query(
    `UPDATE subscriptions
     SET status = $3, next_charge_at = $4, grace_ends_at = $5
     WHERE chain_id = $1 AND subscription_id = $2`,
    [
      chainId.toString(),
      args.subscriptionId.toString(),
      subscriptionStatuses[Number(args.status)] ?? `Unknown:${args.status.toString()}`,
      args.nextChargeAt.toString(),
      args.graceEndsAt.toString()
    ]
  );
}

async function updateSubscriptionCancelled(log: DecodedLog) {
  await pool.query("UPDATE subscriptions SET status = 'Cancelled' WHERE chain_id = $1 AND subscription_id = $2", [
    chainId.toString(),
    log.args.subscriptionId.toString()
  ]);
}

async function upsertUsage(log: DecodedLog) {
  const args = log.args;
  await pool.query(
    `INSERT INTO service_usage
      (trace_id, owner, service_id, subscription_id, payment_identifier, units, source, success, latency_ms, artifact_hash, created_at)
     VALUES ($1,'0x0000000000000000000000000000000000000000',$2,$3,'',$4,'subscription',TRUE,0,$5,NOW())`,
    [
      `${log.transactionHash}:${args.subscriptionId.toString()}:${args.usedUnits.toString()}`,
      args.serviceId,
      args.subscriptionId.toString(),
      args.units.toString(),
      log.transactionHash
    ]
  );

  await pool.query(
    "UPDATE subscriptions SET used_units = $3 WHERE chain_id = $1 AND subscription_id = $2",
    [chainId.toString(), args.subscriptionId.toString(), args.usedUnits.toString()]
  );
}

async function reserveInvoice(log: DecodedLog) {
  const args = log.args;
  await pool.query(
    `INSERT INTO invoices
      (chain_id, invoice_id, invoice_key, subscription_id, plan_id, period_index, subscriber, merchant, token, amount, due_at, status, tx_hash, block_number)
     VALUES ($1,$2,$3,$4,0,$5,'0x0000000000000000000000000000000000000000','0x0000000000000000000000000000000000000000','0x0000000000000000000000000000000000000000',0,$6,'unpaid',$7,$8)
     ON CONFLICT (chain_id, invoice_key) DO NOTHING`,
    [
      chainId.toString(),
      args.invoiceId.toString(),
      args.invoiceKey,
      args.subscriptionId.toString(),
      args.periodIndex.toString(),
      args.dueAt.toString(),
      log.transactionHash,
      log.blockNumber?.toString() ?? "0"
    ]
  );
}

async function markInvoicePaid(log: DecodedLog) {
  const args = log.args;
  await pool.query(
    `INSERT INTO invoices
      (chain_id, invoice_id, invoice_key, subscription_id, plan_id, period_index, subscriber, merchant, token, amount, due_at, paid_at, next_charge_at, status, tx_hash, block_number)
     VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,0,$10,$11,'paid',$12,$13)
     ON CONFLICT (chain_id, invoice_key) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      subscriber = EXCLUDED.subscriber,
      merchant = EXCLUDED.merchant,
      token = EXCLUDED.token,
      amount = EXCLUDED.amount,
      paid_at = EXCLUDED.paid_at,
      next_charge_at = EXCLUDED.next_charge_at,
      status = 'paid',
      tx_hash = EXCLUDED.tx_hash,
      block_number = EXCLUDED.block_number`,
    [
      chainId.toString(),
      args.invoiceId.toString(),
      args.invoiceKey,
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

  await pool.query(
    `UPDATE subscriptions
     SET status = 'Active', next_charge_at = $3, grace_ends_at = 0, period_index = period_index + 1, current_period_start = $4, used_units = 0
     WHERE chain_id = $1 AND subscription_id = $2`,
    [chainId.toString(), args.subscriptionId.toString(), args.nextChargeAt.toString(), args.paidAt.toString()]
  );
}

async function markInvoiceFailed(log: DecodedLog) {
  const args = log.args;
  await pool.query(
    `UPDATE invoices SET status = 'failed'
     WHERE chain_id = $1 AND invoice_key = $2`,
    [chainId.toString(), args.invoiceKey]
  );
}

async function markInvoiceRefunded(log: DecodedLog) {
  await pool.query("UPDATE invoices SET status = 'refunded' WHERE chain_id = $1 AND invoice_id = $2", [
    chainId.toString(),
    log.args.invoiceId.toString()
  ]);
}

async function setChainCursor(blockNumber: bigint, blockHash: string | null | undefined) {
  await pool.query(
    `INSERT INTO chain_cursors (chain_id, cursor_name, block_number, block_hash, updated_at)
     VALUES ($1,'subchain',$2,$3,NOW())
     ON CONFLICT (chain_id, cursor_name) DO UPDATE SET
      block_number = EXCLUDED.block_number,
      block_hash = EXCLUDED.block_hash,
      updated_at = NOW()`,
    [chainId.toString(), blockNumber.toString(), blockHash ?? null]
  );
}

function normalizeAddress(address: Address): string {
  return getAddress(address).toLowerCase();
}

type DecodedLog = {
  eventName?: string;
  args: Record<string, any>;
  blockNumber?: bigint;
  blockHash?: string | null;
  transactionHash?: `0x${string}`;
};

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
