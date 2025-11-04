import { Pool, PoolClient } from 'pg'
import { env } from '../env.js'

export const pool = new Pool({
  connectionString: env.PG_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

export interface Market {
  id: string
  marketId: string
  songId: string
  title?: string
  artist?: string
  quoteToken: string
  ammAddress: Buffer
  yesToken: Buffer
  noToken: Buffer
  t0Rank: number
  cutoffUtc: Date
  status: string
  createdAt: Date
}

export interface Snapshot {
  id: string
  dateUtc: string
  region: string
  jsonUrl: string
  jsonSha256: string
  csvUrl?: string
  csvSha256?: string
  ipfsCid?: string
  createdAt: Date
}

export interface Resolution {
  marketId: string
  t0SnapshotId?: string
  t1SnapshotId?: string
  t0Rank?: number
  t1Rank?: number
  outcome?: number
  commitTx?: string
  committedAt?: Date
  disputeUntil?: Date
  finalizeTx?: string
  finalizedAt?: Date
}

export async function getMarkets(): Promise<Market[]> {
  const { rows } = await pool.query(`
    SELECT 
      id, market_id as "marketId", song_id as "songId", title, artist,
      quote_token as "quoteToken", amm_address as "ammAddress",
      yes_token as "yesToken", no_token as "noToken",
      t0_rank as "t0Rank", cutoff_utc as "cutoffUtc",
      status, created_at as "createdAt"
    FROM markets 
    ORDER BY created_at DESC
  `)
  return rows
}

export async function getMarket(marketId: string): Promise<Market | null> {
  const { rows } = await pool.query(`
    SELECT 
      id, market_id as "marketId", song_id as "songId", title, artist,
      quote_token as "quoteToken", amm_address as "ammAddress",
      yes_token as "yesToken", no_token as "noToken",
      t0_rank as "t0Rank", cutoff_utc as "cutoffUtc",
      status, created_at as "createdAt"
    FROM markets 
    WHERE market_id = $1
  `, [marketId])
  return rows[0] || null
}

export async function getSnapshot(id: string): Promise<Snapshot | null> {
  const { rows } = await pool.query(`
    SELECT 
      id, date_utc as "dateUtc", region, json_url as "jsonUrl",
      json_sha256 as "jsonSha256", csv_url as "csvUrl",
      csv_sha256 as "csvSha256", ipfs_cid as "ipfsCid",
      created_at as "createdAt"
    FROM snapshots 
    WHERE id = $1
  `, [id])
  return rows[0] || null
}

export async function getSnapshotByDate(dateUtc: string, region: string = 'global'): Promise<Snapshot | null> {
  const { rows } = await pool.query(`
    SELECT 
      id, date_utc as "dateUtc", region, json_url as "jsonUrl",
      json_sha256 as "jsonSha256", csv_url as "csvUrl",
      csv_sha256 as "csvSha256", ipfs_cid as "ipfsCid",
      created_at as "createdAt"
    FROM snapshots 
    WHERE date_utc = $1 AND region = $2
  `, [dateUtc, region])
  return rows[0] || null
}

export async function getResolution(marketId: string): Promise<Resolution | null> {
  const { rows } = await pool.query(`
    SELECT 
      market_id as "marketId", t0_snapshot_id as "t0SnapshotId",
      t1_snapshot_id as "t1SnapshotId", t0_rank as "t0Rank",
      t1_rank as "t1Rank", outcome, commit_tx as "commitTx",
      committed_at as "committedAt", dispute_until as "disputeUntil",
      finalize_tx as "finalizeTx", finalized_at as "finalizedAt"
    FROM resolutions 
    WHERE market_id = $1
  `, [marketId])
  return rows[0] || null
}

export async function upsertResolution(resolution: Partial<Resolution> & { marketId: string }): Promise<void> {
  const fields = Object.keys(resolution).filter(k => k !== 'marketId')
  const values = fields.map(f => resolution[f as keyof Resolution])
  const setClause = fields.map((f, i) => `${toSnakeCase(f)} = $${i + 2}`).join(', ')
  
  await pool.query(`
    INSERT INTO resolutions (market_id, ${fields.map(toSnakeCase).join(', ')})
    VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')})
    ON CONFLICT (market_id) 
    DO UPDATE SET ${setClause}
  `, [resolution.marketId, ...values])
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}