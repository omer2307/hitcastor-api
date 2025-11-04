import { Job } from 'bullmq'
import { getMarket, getSnapshotByDate, upsertResolution } from '../db/index.js'
import { fetchAndVerifyHash } from '../lib/hash.js'
import { extractRankBySongId, computeOutcome, validateSnapshotSchema } from '../lib/rank.js'
import { alertJobFailure } from '../lib/alerts.js'

export interface PrepareResolveJobData {
  marketId: string
  t0Date: string // YYYY-MM-DD
  t1Date: string // YYYY-MM-DD
  region?: string
}

export async function prepareResolveJob(job: Job<PrepareResolveJobData>) {
  const { marketId, t0Date, t1Date, region = 'global' } = job.data
  
  job.log(`Starting prepare resolve for market ${marketId}`)

  try {
    const market = await getMarket(marketId)
    if (!market) {
      throw new Error(`Market ${marketId} not found`)
    }

    // Get snapshots for t0 and t1 dates
    const [t0Snapshot, t1Snapshot] = await Promise.all([
      getSnapshotByDate(t0Date, region),
      getSnapshotByDate(t1Date, region),
    ])

    if (!t0Snapshot) {
      throw new Error(`No snapshot found for ${t0Date} ${region}`)
    }
    if (!t1Snapshot) {
      throw new Error(`No snapshot found for ${t1Date} ${region}`)
    }

    // Fetch and verify JSON data
    const [t0Buffer, t1Buffer] = await Promise.all([
      fetchAndVerifyHash(t0Snapshot.jsonUrl, t0Snapshot.jsonSha256),
      fetchAndVerifyHash(t1Snapshot.jsonUrl, t1Snapshot.jsonSha256),
    ])

    // Parse and validate JSON
    const t0Data = JSON.parse(t0Buffer.toString('utf8'))
    const t1Data = JSON.parse(t1Buffer.toString('utf8'))

    if (!validateSnapshotSchema(t0Data) || !validateSnapshotSchema(t1Data)) {
      throw new Error('Invalid snapshot schema')
    }

    // Extract ranks for the market's song
    const t0Rank = extractRankBySongId(t0Data, market.songId)
    const t1Rank = extractRankBySongId(t1Data, market.songId)
    const outcome = computeOutcome(t0Rank, t1Rank)

    // Store resolution data
    await upsertResolution({
      marketId: market.marketId,
      t0SnapshotId: t0Snapshot.id,
      t1SnapshotId: t1Snapshot.id,
      t0Rank,
      t1Rank,
      outcome,
    })

    job.log(`Prepared resolution for market ${marketId}: t0=${t0Rank}, t1=${t1Rank}, outcome=${outcome}`)

    return {
      marketId,
      t0Rank,
      t1Rank,
      outcome,
      t0SnapshotId: t0Snapshot.id,
      t1SnapshotId: t1Snapshot.id,
    }

  } catch (error) {
    job.log(`Failed to prepare resolve for market ${marketId}: ${error}`)
    await alertJobFailure('prepareResolve', marketId, error as Error)
    throw error
  }
}