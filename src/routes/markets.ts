import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getMarkets, getMarket } from '../db/index.js'
import { readMarketReserves } from '../chain/viem.js'

const marketListSchema = z.object({
  status: z.enum(['OPEN', 'COMMITTED', 'RESOLVED']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

const marketsPlugin: FastifyPluginAsync = async function (fastify) {
  // GET /markets - List markets with prices
  fastify.get('/', {
    schema: {
      description: 'List markets with pricing data',
      tags: ['Markets'],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['OPEN', 'COMMITTED', 'RESOLVED'] },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            markets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  marketId: { type: 'string' },
                  songId: { type: 'string' },
                  title: { type: 'string' },
                  artist: { type: 'string' },
                  t0Rank: { type: 'number' },
                  status: { type: 'string' },
                  cutoffUtc: { type: 'string' },
                  priceYes: { type: 'number' },
                  priceNo: { type: 'number' },
                  poolUSD: { type: 'number' },
                },
              },
            },
            total: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const query = marketListSchema.parse(request.query)
    
    const markets = await getMarkets()
    
    const enrichedMarkets = await Promise.all(
      markets.map(async (market) => {
        try {
          const reserves = await readMarketReserves(`0x${market.ammAddress.toString('hex')}`)
          return {
            marketId: market.marketId,
            songId: market.songId,
            title: market.title,
            artist: market.artist,
            t0Rank: market.t0Rank,
            status: market.status,
            cutoffUtc: market.cutoffUtc.toISOString(),
            priceYes: reserves.priceYes,
            priceNo: reserves.priceNo,
            poolUSD: reserves.poolUSD,
          }
        } catch (error) {
          fastify.log.warn(`Failed to fetch reserves for market ${market.marketId}:`, error)
          return {
            marketId: market.marketId,
            songId: market.songId,
            title: market.title,
            artist: market.artist,
            t0Rank: market.t0Rank,
            status: market.status,
            cutoffUtc: market.cutoffUtc.toISOString(),
            priceYes: 0.5,
            priceNo: 0.5,
            poolUSD: 0,
          }
        }
      })
    )

    // Apply filters
    let filteredMarkets = enrichedMarkets
    if (query.status) {
      filteredMarkets = filteredMarkets.filter(m => m.status === query.status)
    }

    // Pagination
    const total = filteredMarkets.length
    const paginatedMarkets = filteredMarkets.slice(query.offset, query.offset + query.limit)

    return {
      markets: paginatedMarkets,
      total,
    }
  })

  // GET /markets/:id - Market details
  fastify.get('/:id', {
    schema: {
      description: 'Get market details with reserves and outcome',
      tags: ['Markets'],
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
            marketId: { type: 'string' },
            songId: { type: 'string' },
            title: { type: 'string' },
            artist: { type: 'string' },
            quoteToken: { type: 'string' },
            ammAddress: { type: 'string' },
            yesToken: { type: 'string' },
            noToken: { type: 'string' },
            t0Rank: { type: 'number' },
            cutoffUtc: { type: 'string' },
            status: { type: 'string' },
            reserves: {
              type: 'object',
              properties: {
                reserveYes: { type: 'string' },
                reserveNo: { type: 'string' },
                reserveQuote: { type: 'string' },
                priceYes: { type: 'number' },
                priceNo: { type: 'number' },
                poolUSD: { type: 'number' },
              },
            },
            outcome: {
              type: 'object',
              properties: {
                resolved: { type: 'boolean' },
                outcome: { type: 'number' },
                t0Rank: { type: 'number' },
                t1Rank: { type: 'number' },
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

    const reserves = await readMarketReserves(`0x${market.ammAddress.toString('hex')}`)

    // Check if market is resolved
    // TODO: Get resolution data from resolutions table
    
    return {
      marketId: market.marketId,
      songId: market.songId,
      title: market.title,
      artist: market.artist,
      quoteToken: market.quoteToken,
      ammAddress: `0x${market.ammAddress.toString('hex')}`,
      yesToken: `0x${market.yesToken.toString('hex')}`,
      noToken: `0x${market.noToken.toString('hex')}`,
      t0Rank: market.t0Rank,
      cutoffUtc: market.cutoffUtc.toISOString(),
      status: market.status,
      reserves: {
        reserveYes: reserves.reserveYes.toString(),
        reserveNo: reserves.reserveNo.toString(),
        reserveQuote: reserves.reserveQuote.toString(),
        priceYes: reserves.priceYes,
        priceNo: reserves.priceNo,
        poolUSD: reserves.poolUSD,
      },
      outcome: null, // TODO: Add resolution outcome if available
    }
  })
}

export default marketsPlugin