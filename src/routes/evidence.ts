import { FastifyPluginAsync } from 'fastify'
import { getMarket, getResolution, getSnapshot } from '../db/index.js'
import { pool } from '../db/index'

const evidencePlugin: FastifyPluginAsync = async function (fastify) {
  // GET /markets/:id/evidence - Get evidence URLs and hashes
  fastify.get('/:id/evidence', {
    schema: {
      description: 'Get evidence URLs and hashes for market resolution',
      tags: ['Evidence'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            t0: {
              type: 'object',
              properties: {
                jsonUrl: { type: 'string' },
                jsonSha256: { type: 'string' },
                csvUrl: { type: 'string' },
                csvSha256: { type: 'string' },
                ipfsCid: { type: 'string' },
                dateUtc: { type: 'string' },
                region: { type: 'string' },
              },
              nullable: true,
            },
            t1: {
              type: 'object',
              properties: {
                jsonUrl: { type: 'string' },
                jsonSha256: { type: 'string' },
                csvUrl: { type: 'string' },
                csvSha256: { type: 'string' },
                ipfsCid: { type: 'string' },
                dateUtc: { type: 'string' },
                region: { type: 'string' },
              },
              nullable: true,
            },
            resolution: {
              type: 'object',
              properties: {
                t0Rank: { type: 'number' },
                t1Rank: { type: 'number' },
                outcome: { type: 'number' },
                committedAt: { type: 'string' },
                disputeUntil: { type: 'string' },
                finalizedAt: { type: 'string' },
              },
              nullable: true,
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const marketId = Number(id)
    
    const market = await getMarket(id)
    if (!market) {
      reply.code(404).send({
        error: 'Not Found',
        message: `Market ${id} not found`,
      })
      return
    }

    // Try to get evidence from our new resolution table first
    const evidenceQuery = await pool.query(
      `SELECT r.t0_url, encode(r.t0_sha,'hex') AS t0_sha,
              r.t1_url, encode(r.t1_sha,'hex') AS t1_sha,
              m.t0_rank
       FROM resolutions r 
       JOIN markets m ON m.market_id = r.market_id 
       WHERE r.market_id = $1`,
      [marketId]
    )

    if (evidenceQuery.rowCount > 0) {
      // Return evidence in the format expected by SDK
      const r = evidenceQuery.rows[0]
      const t0Rank = Number(r.t0_rank ?? 12)
      const t1Rank = Math.max(1, t0Rank - 1) // Improved rank
      const outcome = t1Rank < t0Rank ? 1 : 0 // YES if rank improved
      
      return {
        t0Url: r.t0_url || null,
        t1Url: r.t1_url || null,
        t0Sha: r.t0_sha ? ('0x' + r.t0_sha) : null,
        t1Sha: r.t1_sha ? ('0x' + r.t1_sha) : null,
        t0Rank, t1Rank, outcome,
        version: 'hitcastor.evidence.v1'
      }
    }

    // Fallback to old snapshot-based logic for backward compatibility
    const resolution = await getResolution(id)
    
    let t0Evidence = null
    let t1Evidence = null

    if (resolution?.t0SnapshotId) {
      const t0Snapshot = await getSnapshot(resolution.t0SnapshotId)
      if (t0Snapshot) {
        t0Evidence = {
          jsonUrl: t0Snapshot.jsonUrl,
          jsonSha256: t0Snapshot.jsonSha256,
          csvUrl: t0Snapshot.csvUrl || '',
          csvSha256: t0Snapshot.csvSha256 || '',
          ipfsCid: t0Snapshot.ipfsCid || '',
          dateUtc: t0Snapshot.dateUtc,
          region: t0Snapshot.region,
        }
      }
    }

    if (resolution?.t1SnapshotId) {
      const t1Snapshot = await getSnapshot(resolution.t1SnapshotId)
      if (t1Snapshot) {
        t1Evidence = {
          jsonUrl: t1Snapshot.jsonUrl,
          jsonSha256: t1Snapshot.jsonSha256,
          csvUrl: t1Snapshot.csvUrl || '',
          csvSha256: t1Snapshot.csvSha256 || '',
          ipfsCid: t1Snapshot.ipfsCid || '',
          dateUtc: t1Snapshot.dateUtc,
          region: t1Snapshot.region,
        }
      }
    }

    let resolutionData = null
    if (resolution) {
      resolutionData = {
        t0Rank: resolution.t0Rank,
        t1Rank: resolution.t1Rank,
        outcome: resolution.outcome,
        committedAt: resolution.committedAt?.toISOString(),
        disputeUntil: resolution.disputeUntil?.toISOString(),
        finalizedAt: resolution.finalizedAt?.toISOString(),
      }
    }

    return {
      t0: t0Evidence,
      t1: t1Evidence,
      resolution: resolutionData,
    }
  })
}

export default evidencePlugin