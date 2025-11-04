import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { adminAuth } from '../lib/auth.js'
import { getMarket, getResolution, upsertResolution, getSnapshot } from '../db/index.js'
import { fetchAndVerifyHash } from '../lib/hash.js'
import { extractRankBySongId, computeOutcome, validateSnapshotSchema } from '../lib/rank.js'
import { computeCommitment, sendCommitResolve, sendFinalizeResolve, getDisputeWindow } from '../chain/viem.js'

const prepareResolveSchema = z.object({
  t0Url: z.string().url(),
  t0Sha: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  t1Url: z.string().url(),
  t1Sha: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
})

const resolvePlugin: FastifyPluginAsync = async function (fastify) {
  // POST /markets/:id/prepare-resolve - Fetch evidence and compute outcome
  fastify.post('/:id/prepare-resolve', {
    preHandler: adminAuth,
    schema: {
      description: 'Prepare market resolution by fetching and verifying evidence',
      tags: ['Resolution'],
      security: [{ AdminKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          t0Url: { type: 'string', format: 'uri' },
          t0Sha: { type: 'string', pattern: '^0x[a-fA-F0-9]{64}$' },
          t1Url: { type: 'string', format: 'uri' },
          t1Sha: { type: 'string', pattern: '^0x[a-fA-F0-9]{64}$' },
        },
        required: ['t0Url', 't0Sha', 't1Url', 't1Sha'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            commitment: { type: 'string' },
            t0Rank: { type: 'number' },
            t1Rank: { type: 'number' },
            outcome: { type: 'number' },
            evidence: {
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
                  },
                },
                t1: {
                  type: 'object',
                  properties: {
                    jsonUrl: { type: 'string' },
                    jsonSha256: { type: 'string' },
                    csvUrl: { type: 'string' },
                    csvSha256: { type: 'string' },
                    ipfsCid: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
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
    const body = prepareResolveSchema.parse(request.body)
    
    const market = await getMarket(id)
    if (!market) {
      reply.code(404).send({
        error: 'Not Found',
        message: `Market ${id} not found`,
      })
      return
    }

    try {
      // Fetch and verify JSON snapshots
      const [t0Buffer, t1Buffer] = await Promise.all([
        fetchAndVerifyHash(body.t0Url, body.t0Sha),
        fetchAndVerifyHash(body.t1Url, body.t1Sha),
      ])

      // Parse and validate JSON
      const t0Snapshot = JSON.parse(t0Buffer.toString('utf8'))
      const t1Snapshot = JSON.parse(t1Buffer.toString('utf8'))

      if (!validateSnapshotSchema(t0Snapshot) || !validateSnapshotSchema(t1Snapshot)) {
        reply.code(400).send({
          error: 'Invalid Snapshot',
          message: 'Snapshot JSON does not match expected schema',
        })
        return
      }

      // Extract ranks for the market's song
      const t0Rank = extractRankBySongId(t0Snapshot, market.songId)
      const t1Rank = extractRankBySongId(t1Snapshot, market.songId)
      const outcome = computeOutcome(t0Rank, t1Rank)

      // Build evidence structures (assuming CSV/IPFS data available)
      const t0Evidence = {
        jsonUrl: body.t0Url,
        jsonSha256: body.t0Sha,
        csvUrl: '', // TODO: Get from snapshot or derive
        csvSha256: '0x0000000000000000000000000000000000000000000000000000000000000000',
        ipfsCid: '', // TODO: Get from snapshot
      }

      const t1Evidence = {
        jsonUrl: body.t1Url,
        jsonSha256: body.t1Sha,
        csvUrl: '',
        csvSha256: '0x0000000000000000000000000000000000000000000000000000000000000000',
        ipfsCid: '',
      }

      // Compute commitment
      const commitment = computeCommitment(
        BigInt(market.marketId),
        t0Rank,
        t1Rank,
        outcome,
        t0Evidence,
        t1Evidence
      )

      // Store draft resolution
      await upsertResolution({
        marketId: market.marketId,
        t0Rank,
        t1Rank,
        outcome,
      })

      fastify.log.info(`Prepared resolution for market ${id}:`, {
        t0Rank,
        t1Rank,
        outcome,
        commitment,
      })

      return {
        commitment,
        t0Rank,
        t1Rank,
        outcome,
        evidence: {
          t0: t0Evidence,
          t1: t1Evidence,
        },
      }

    } catch (error) {
      fastify.log.error(`Failed to prepare resolution for market ${id}:`, error)
      reply.code(400).send({
        error: 'Preparation Failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  })

  // POST /markets/:id/commit - Send commit transaction
  fastify.post('/:id/commit', {
    preHandler: adminAuth,
    schema: {
      description: 'Commit market resolution to blockchain',
      tags: ['Resolution'],
      security: [{ AdminKey: [] }],
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
            txHash: { type: 'string' },
            disputeUntil: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
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
    if (!resolution || !resolution.outcome) {
      reply.code(400).send({
        error: 'Resolution Not Prepared',
        message: 'Market resolution must be prepared before committing',
      })
      return
    }

    if (resolution.commitTx) {
      reply.code(400).send({
        error: 'Already Committed',
        message: 'Market resolution has already been committed',
      })
      return
    }

    try {
      // TODO: Build proper evidence structures from resolution data
      const evidence = {
        jsonUrl: '',
        jsonSha256: '0x0000000000000000000000000000000000000000000000000000000000000000',
        csvUrl: '',
        csvSha256: '0x0000000000000000000000000000000000000000000000000000000000000000',
        ipfsCid: '',
      }

      const commitment = computeCommitment(
        BigInt(market.marketId),
        resolution.t0Rank!,
        resolution.t1Rank!,
        resolution.outcome,
        evidence,
        evidence
      )

      // Send commit transaction
      const txHash = await sendCommitResolve(
        BigInt(market.marketId),
        commitment,
        evidence
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

      fastify.log.info(`Committed resolution for market ${id}:`, {
        txHash,
        disputeUntil,
      })

      return {
        txHash,
        disputeUntil: disputeUntil.toISOString(),
      }

    } catch (error) {
      fastify.log.error(`Failed to commit resolution for market ${id}:`, error)
      reply.code(400).send({
        error: 'Commit Failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  })

  // POST /markets/:id/finalize - Send finalize transaction
  fastify.post('/:id/finalize', {
    preHandler: adminAuth,
    schema: {
      description: 'Finalize market resolution after dispute window',
      tags: ['Resolution'],
      security: [{ AdminKey: [] }],
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
            txHash: { type: 'string' },
            outcome: { type: 'number' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
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
    if (!resolution || !resolution.commitTx || !resolution.disputeUntil) {
      reply.code(400).send({
        error: 'Resolution Not Committed',
        message: 'Market resolution must be committed before finalizing',
      })
      return
    }

    if (resolution.finalizeTx) {
      reply.code(400).send({
        error: 'Already Finalized',
        message: 'Market resolution has already been finalized',
      })
      return
    }

    // Check dispute window has passed
    if (new Date() < resolution.disputeUntil) {
      reply.code(400).send({
        error: 'Dispute Window Active',
        message: `Cannot finalize before dispute window ends at ${resolution.disputeUntil.toISOString()}`,
      })
      return
    }

    try {
      // TODO: Build proper evidence structures from resolution data
      const t0Evidence = {
        jsonUrl: '',
        jsonSha256: '0x0000000000000000000000000000000000000000000000000000000000000000',
        csvUrl: '',
        csvSha256: '0x0000000000000000000000000000000000000000000000000000000000000000',
        ipfsCid: '',
      }

      const t1Evidence = {
        jsonUrl: '',
        jsonSha256: '0x0000000000000000000000000000000000000000000000000000000000000000',
        csvUrl: '',
        csvSha256: '0x0000000000000000000000000000000000000000000000000000000000000000',
        ipfsCid: '',
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

      fastify.log.info(`Finalized resolution for market ${id}:`, {
        txHash,
        outcome: resolution.outcome,
      })

      return {
        txHash,
        outcome: resolution.outcome!,
      }

    } catch (error) {
      fastify.log.error(`Failed to finalize resolution for market ${id}:`, error)
      reply.code(400).send({
        error: 'Finalize Failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  })
}

export default resolvePlugin