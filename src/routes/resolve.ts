import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { pool } from '../db/index'
import { commitOnChain, finalizeOnChain } from '../chain/resolver'

const prepSchema = z.object({
  t0Url: z.string().url(),
  t0Sha: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  t1Url: z.string().url(),
  t1Sha: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
})

const resolveRoutes: FastifyPluginAsync = async (fastify) => {
  // Prepare resolution with evidence URLs and hashes
  fastify.post('/:id/prepare-resolve', {
    schema: {
      description: 'Prepare market resolution with evidence data',
      tags: ['Resolution'],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } }
      },
      body: {
        type: 'object',
        properties: {
          t0Url: { type: 'string', format: 'uri' },
          t0Sha: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
          t1Url: { type: 'string', format: 'uri' },
          t1Sha: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' },
        },
        required: ['t0Url', 't0Sha', 't1Url', 't1Sha']
      }
    }
  }, async (request, reply) => {
    const marketId = Number(request.params.id)
    const { t0Url, t0Sha, t1Url, t1Sha } = prepSchema.parse(request.body)

    await pool.query(
      `INSERT INTO resolutions (market_id, t0_url, t0_sha, t1_url, t1_sha, status, prepared_at)
       VALUES ($1,$2,decode(substr($3,3), 'hex'),$4,decode(substr($5,3), 'hex'),'prepared', now())
       ON CONFLICT (market_id) DO UPDATE
         SET t0_url=EXCLUDED.t0_url, t0_sha=EXCLUDED.t0_sha,
             t1_url=EXCLUDED.t1_url, t1_sha=EXCLUDED.t1_sha,
             status='prepared', prepared_at=now()`,
      [marketId, t0Url, t0Sha, t1Url, t1Sha]
    )
    reply.code(204).send()
  })


  // Commit resolution to blockchain
  fastify.post('/:id/commit', {
    schema: {
      description: 'Commit market resolution to blockchain',
      tags: ['Resolution'],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } }
      },
      response: {
        200: {
          type: 'object',
          properties: { tx: { type: 'string' } }
        }
      }
    }
  }, async (request, reply) => {
    const marketId = Number(request.params.id)
    const q = await pool.query(
      `SELECT r.t0_url, encode(r.t0_sha,'hex') AS t0_sha,
              r.t1_url, encode(r.t1_sha,'hex') AS t1_sha,
              m.t0_rank, m.t1_rank, m.outcome
         FROM resolutions r JOIN markets m ON m.market_id = r.market_id
        WHERE r.market_id = $1`,
      [marketId]
    )
    if (q.rowCount === 0) {
      return reply.code(404).send({ error: 'no prepared evidence' })
    }
    const row = q.rows[0]
    const payload = {
      marketId,
      t0Url: row.t0_url,
      t1Url: row.t1_url,
      t0Sha: ('0x' + row.t0_sha) as `0x${string}`,
      t1Sha: ('0x' + row.t1_sha) as `0x${string}`,
      t0Rank: Number(row.t0_rank ?? 0),
      t1Rank: Number(row.t1_rank ?? 0),
      outcome: Number(row.outcome ?? (row.t1_rank < row.t0_rank ? 1 : 0))
    }
    const tx = await commitOnChain(payload)
    await pool.query(
      `UPDATE resolutions SET status='committed', committed_at=now(), commit_tx=$2 WHERE market_id=$1`,
      [marketId, tx]
    )
    return { tx }
  })

  // Finalize resolution
  fastify.post('/:id/finalize', {
    schema: {
      description: 'Finalize market resolution',
      tags: ['Resolution'],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } }
      },
      response: {
        200: {
          type: 'object',
          properties: { tx: { type: 'string' } }
        }
      }
    }
  }, async (request, reply) => {
    const marketId = Number(request.params.id)
    const tx = await finalizeOnChain(marketId)
    await pool.query(
      `UPDATE resolutions SET status='finalized', finalized_at=now(), finalize_tx=$2 WHERE market_id=$1`,
      [marketId, tx]
    )
    return { tx }
  })
}

export default resolveRoutes