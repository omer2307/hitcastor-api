import Fastify from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { env } from './env.js'
import { getChainInfo } from './chain/viem.js'

export async function createServer() {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV === 'development' ? {
        target: 'pino-pretty'
      } : undefined
    }
  })

  // CORS
  const corsOrigins = env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  await fastify.register(cors, {
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  })

  // OpenAPI/Swagger
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Hitcastor API',
        description: 'REST API for Hitcastor prediction markets - orchestrates resolution flow and serves market data',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${env.PORT}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          AdminKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Admin-Key',
          },
        },
      },
    },
  })

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    exposeRoute: true,
  })

  // Expose OpenAPI JSON
  fastify.get('/openapi.json', async function (request, reply) {
    return fastify.swagger()
  })

  // Health check
  fastify.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            chainId: { type: 'number' },
            resolver: { type: 'string' },
            factory: { type: 'string' },
            treasury: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const chainInfo = await getChainInfo()
    return {
      status: 'ok',
      ...chainInfo,
    }
  })

  // Register route modules
  await fastify.register(import('./routes/markets.js'), { prefix: '/markets' })
  await fastify.register(import('./routes/evidence.js'), { prefix: '/markets' })
  await fastify.register(import('./routes/resolve.js'), { prefix: '/markets' })

  return fastify
}