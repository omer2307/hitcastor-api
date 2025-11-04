import { FastifyPluginAsync } from 'fastify'
import { getMarket, getResolution, getSnapshot } from '../db/index.js'

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
    
    const market = await getMarket(id)
    if (!market) {
      reply.code(404).send({
        error: 'Not Found',
        message: `Market ${id} not found`,
      })
      return
    }

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