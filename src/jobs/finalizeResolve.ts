import { Job } from 'bullmq'
import { getMarket, getResolution, getSnapshot, upsertResolution } from '../db/index.js'
import { sendFinalizeResolve } from '../chain/viem.js'
import { alertJobFailure, alertResolutionSuccess } from '../lib/alerts.js'

export interface FinalizeResolveJobData {
  marketId: string
}

export async function finalizeResolveJob(job: Job<FinalizeResolveJobData>) {
  const { marketId } = job.data
  
  job.log(`Starting finalize resolve for market ${marketId}`)

  try {
    const market = await getMarket(marketId)
    if (!market) {
      throw new Error(`Market ${marketId} not found`)
    }

    const resolution = await getResolution(marketId)
    if (!resolution || !resolution.commitTx || !resolution.disputeUntil) {
      throw new Error(`Resolution not committed for market ${marketId}`)
    }

    if (resolution.finalizeTx) {
      job.log(`Market ${marketId} already finalized with tx ${resolution.finalizeTx}`)
      return { marketId, alreadyFinalized: true, txHash: resolution.finalizeTx }
    }

    // Check dispute window has passed
    if (new Date() < resolution.disputeUntil) {
      const waitTime = resolution.disputeUntil.getTime() - Date.now()
      job.log(`Dispute window still active for market ${marketId}, waiting ${Math.round(waitTime / 1000)}s`)
      throw new Error(`Dispute window active until ${resolution.disputeUntil.toISOString()}`)
    }

    // Get snapshot evidence
    const [t0Snapshot, t1Snapshot] = await Promise.all([
      resolution.t0SnapshotId ? getSnapshot(resolution.t0SnapshotId) : null,
      resolution.t1SnapshotId ? getSnapshot(resolution.t1SnapshotId) : null,
    ])

    if (!t0Snapshot || !t1Snapshot) {
      throw new Error(`Missing snapshot evidence for market ${marketId}`)
    }

    // Build evidence structures
    const t0Evidence = {
      jsonUrl: t0Snapshot.jsonUrl,
      jsonSha256: t0Snapshot.jsonSha256,
      csvUrl: t0Snapshot.csvUrl || '',
      csvSha256: t0Snapshot.csvSha256 || '0x0000000000000000000000000000000000000000000000000000000000000000',
      ipfsCid: t0Snapshot.ipfsCid || '',
    }

    const t1Evidence = {
      jsonUrl: t1Snapshot.jsonUrl,
      jsonSha256: t1Snapshot.jsonSha256,
      csvUrl: t1Snapshot.csvUrl || '',
      csvSha256: t1Snapshot.csvSha256 || '0x0000000000000000000000000000000000000000000000000000000000000000',
      ipfsCid: t1Snapshot.ipfsCid || '',
    }

    // Send finalize transaction
    const txHash = await sendFinalizeResolve(
      BigInt(market.marketId),
      resolution.outcome!,
      resolution.t0Rank!,
      resolution.t1Rank!,
      t0Evidence,
      t1Evidence,
      0n // nonce
    )

    // Update resolution with finalize info
    await upsertResolution({
      marketId: market.marketId,
      finalizeTx: txHash,
      finalizedAt: new Date(),
    })

    job.log(`Finalized resolution for market ${marketId} with tx ${txHash}`)
    await alertResolutionSuccess(marketId, resolution.outcome!, 'finalize')

    return {
      marketId,
      txHash,
      outcome: resolution.outcome!,
    }

  } catch (error) {
    job.log(`Failed to finalize resolve for market ${marketId}: ${error}`)
    await alertJobFailure('finalizeResolve', marketId, error as Error)
    throw error
  }
}