import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

export async function getLastIndexedBlock(defaultBlock: bigint): Promise<bigint> {
  const result = await pool.query("SELECT last_block FROM indexer_state WHERE id = $1", ["subchain"]);
  if (result.rowCount === 0) {
    return defaultBlock;
  }
  return BigInt(result.rows[0].last_block);
}

export async function setLastIndexedBlock(blockNumber: bigint): Promise<void> {
  await pool.query(
    `INSERT INTO indexer_state (id, last_block)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET last_block = EXCLUDED.last_block`,
    ["subchain", blockNumber.toString()]
  );
}

