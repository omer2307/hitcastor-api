import { FastifyRequest, FastifyReply } from 'fastify'
import { env } from '../env.js'

export async function adminAuth(request: FastifyRequest, reply: FastifyReply) {
  const adminKey = request.headers['x-admin-key']
  
  if (!adminKey || adminKey !== env.ADMIN_API_KEY) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Valid X-Admin-Key header required for admin operations'
    })
    return
  }
}