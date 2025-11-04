import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer } from '../src/server.js'
import { FastifyInstance } from 'fastify'

describe('Hitcastor API E2E Tests', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await createServer()
    await server.ready()
  })

  afterAll(async () => {
    await server.close()
  })

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      })

      expect(response.statusCode).toBe(200)
      
      const body = JSON.parse(response.payload)
      expect(body).toMatchObject({
        status: 'ok',
        chainId: expect.any(Number),
        resolver: expect.any(String),
        factory: expect.any(String),
        treasury: expect.any(String),
      })
    })
  })

  describe('OpenAPI Documentation', () => {
    it('should serve OpenAPI JSON', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/openapi.json',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('application/json')
      
      const openapi = JSON.parse(response.payload)
      expect(openapi.info.title).toBe('Hitcastor API')
      expect(openapi.info.version).toBe('1.0.0')
    })

    it('should serve Swagger UI', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/docs',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('text/html')
    })
  })

  describe('Markets API', () => {
    it('should list markets', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/markets',
      })

      expect(response.statusCode).toBe(200)
      
      const body = JSON.parse(response.payload)
      expect(body).toMatchObject({
        markets: expect.any(Array),
        total: expect.any(Number),
      })
    })

    it('should handle market pagination', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/markets?limit=5&offset=0',
      })

      expect(response.statusCode).toBe(200)
      
      const body = JSON.parse(response.payload)
      expect(body.markets.length).toBeLessThanOrEqual(5)
    })

    it('should filter markets by status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/markets?status=OPEN',
      })

      expect(response.statusCode).toBe(200)
      
      const body = JSON.parse(response.payload)
      body.markets.forEach((market: any) => {
        expect(market.status).toBe('OPEN')
      })
    })

    it('should return 404 for non-existent market', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/markets/999999',
      })

      expect(response.statusCode).toBe(404)
      
      const body = JSON.parse(response.payload)
      expect(body.error).toBe('Not Found')
    })
  })

  describe('Evidence API', () => {
    it('should return evidence for market', async () => {
      // This would require seeded test data
      const response = await server.inject({
        method: 'GET',
        url: '/markets/1/evidence',
      })

      // Since we don't have test data, we expect 404 or empty evidence
      expect([200, 404]).toContain(response.statusCode)

      if (response.statusCode === 200) {
        const body = JSON.parse(response.payload)
        expect(body).toMatchObject({
          t0: expect.any(Object),
          t1: expect.any(Object),
          resolution: expect.any(Object),
        })
      }
    })
  })

  describe('Resolution API - Authentication', () => {
    it('should reject prepare-resolve without admin key', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/markets/1/prepare-resolve',
        payload: {
          t0Url: 'https://example.com/t0.json',
          t0Sha: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          t1Url: 'https://example.com/t1.json',
          t1Sha: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      })

      expect(response.statusCode).toBe(401)
      
      const body = JSON.parse(response.payload)
      expect(body.error).toBe('Unauthorized')
    })

    it('should reject commit without admin key', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/markets/1/commit',
      })

      expect(response.statusCode).toBe(401)
    })

    it('should reject finalize without admin key', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/markets/1/finalize',
      })

      expect(response.statusCode).toBe(401)
    })

    it('should accept valid admin key', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/markets/1/prepare-resolve',
        headers: {
          'X-Admin-Key': 'test-admin-key', // This would need to match env
        },
        payload: {
          t0Url: 'https://example.com/t0.json',
          t0Sha: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          t1Url: 'https://example.com/t1.json',
          t1Sha: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      })

      // This will fail due to missing market or invalid URLs, but auth should pass
      expect(response.statusCode).not.toBe(401)
    })
  })

  describe('Request Validation', () => {
    it('should validate prepare-resolve payload', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/markets/1/prepare-resolve',
        headers: {
          'X-Admin-Key': 'test-admin-key',
        },
        payload: {
          t0Url: 'not-a-url',
          t0Sha: 'invalid-hash',
          t1Url: 'https://example.com/t1.json',
          t1Sha: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('should validate hash format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/markets/1/prepare-resolve',
        headers: {
          'X-Admin-Key': 'test-admin-key',
        },
        payload: {
          t0Url: 'https://example.com/t0.json',
          t0Sha: '0x123', // Too short
          t1Url: 'https://example.com/t1.json',
          t1Sha: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        },
      })

      expect(response.statusCode).toBe(400)
    })
  })
})