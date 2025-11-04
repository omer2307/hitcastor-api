import { createServer } from './server.js'
import { env } from './env.js'

async function start() {
  try {
    const server = await createServer()
    
    // Start server
    await server.listen({
      port: env.PORT,
      host: '0.0.0.0',
    })

    console.log(`🚀 Hitcastor API server started on port ${env.PORT}`)
    console.log(`📖 OpenAPI docs: http://localhost:${env.PORT}/docs`)
    console.log(`🔍 Health check: http://localhost:${env.PORT}/health`)

  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

start()