import { Job } from 'bullmq'
import { getMarket, getResolution, getSnapshot, upsertResolution } from '../db/index.js'
import { computeCommitment, sendCommitResolve, getDisputeWindow } from '../chain/viem.js'
import { alertJobFailure, alertResolutionSuccess } from '../lib/alerts.js'

export interface CommitResolveJobData {
  marketId: string
}

export async function commitResolveJob(job: Job<CommitResolveJobData>) {
  const { marketId } = job.data
  
  job.log(`Starting commit resolve for market ${marketId}`)

  try {
    const market = await getMarket(marketId)
    if (!market) {
      throw new Error(`Market ${marketId} not found`)
    }

    const resolution = await getResolution(marketId)
    if (!resolution || !resolution.outcome) {
      throw new Error(`Resolution not prepared for market ${marketId}`)
    }

    if (resolution.commitTx) {
      job.log(`Market ${marketId} already committed with tx ${resolution.commitTx}`)
      return { marketId, alreadyCommitted: true, txHash: resolution.commitTx }
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

    // Compute commitment
    const commitment = computeCommitment(
      BigInt(market.marketId),
      resolution.t0Rank!,
      resolution.t1Rank!,
      resolution.outcome,
      t0Evidence,
      t1Evidence
    )

    // Send commit transaction (will use t0Evidence for now since we only store one evidence in commit)
    const txHash = await sendCommitResolve(
      BigInt(market.marketId),
      commitment,
      t0Evidence
    )

    // Calculate dispute window end time
    const disputeWindowSeconds = await getDisputeWindow()
    const disputeUntil = new Date(Date.now() + disputeWindowSeconds * 1000)

    // Update resolution with commit info
    await upsertResolution({
      marketId: market.marketId,
      commitTx: txHash,
      committedAt: new Date(),
      disputeUntil,
    })

    job.log(`Committed resolution for market ${marketId} with tx ${txHash}`)
    await alertResolutionSuccess(marketId, resolution.outcome, 'commit')

    return {
      marketId,
      txHash,
      disputeUntil,
      outcome: resolution.outcome,
    }

  } catch (error) {
    job.log(`Failed to commit resolve for market ${marketId}: ${error}`)
    await alertJobFailure('commitResolve', marketId, error as Error)
    throw error
  }
}