import { Worker, Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { env } from '../env.js'
import { prepareResolveJob, PrepareResolveJobData } from './prepareResolve.js'
import { commitResolveJob, CommitResolveJobData } from './commitResolve.js'
import { finalizeResolveJob, FinalizeResolveJobData } from './finalizeResolve.js'

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
})

// Queue definitions
export const prepareResolveQueue = new Queue<PrepareResolveJobData>('prepareResolve', { connection })
export const commitResolveQueue = new Queue<CommitResolveJobData>('commitResolve', { connection })
export const finalizeResolveQueue = new Queue<FinalizeResolveJobData>('finalizeResolve', { connection })

// Worker configurations
const workerConfig = {
  connection,
  concurrency: 1, // Process one job at a time for safety
  removeOnComplete: 100,
  removeOnFail: 50,
}

// Workers
export const prepareResolveWorker = new Worker(
  'prepareResolve',
  prepareResolveJob,
  {
    ...workerConfig,
    settings: {
      retryProcessDelay: 30000, // 30s delay between retries
    },
  }
)

export const commitResolveWorker = new Worker(
  'commitResolve',
  commitResolveJob,
  {
    ...workerConfig,
    settings: {
      retryProcessDelay: 60000, // 1min delay for blockchain retry
    },
  }
)

export const finalizeResolveWorker = new Worker(
  'finalizeResolve',
  finalizeResolveJob,
  {
    ...workerConfig,
    settings: {
      retryProcessDelay: 300000, // 5min delay for finalize retry
    },
  }
)

// Event handlers
prepareResolveWorker.on('completed', (job) => {
  console.log(`✅ PrepareResolve job ${job.id} completed for market ${job.data.marketId}`)
})

prepareResolveWorker.on('failed', (job, err) => {
  console.error(`❌ PrepareResolve job ${job?.id} failed for market ${job?.data.marketId}:`, err.message)
})

commitResolveWorker.on('completed', (job) => {
  console.log(`✅ CommitResolve job ${job.id} completed for market ${job.data.marketId}`)
})

commitResolveWorker.on('failed', (job, err) => {
  console.error(`❌ CommitResolve job ${job?.id} failed for market ${job?.data.marketId}:`, err.message)
})

finalizeResolveWorker.on('completed', (job) => {
  console.log(`✅ FinalizeResolve job ${job.id} completed for market ${job.data.marketId}`)
})

finalizeResolveWorker.on('failed', (job, err) => {
  console.error(`❌ FinalizeResolve job ${job?.id} failed for market ${job?.data.marketId}:`, err.message)
})

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down workers...')
  await Promise.all([
    prepareResolveWorker.close(),
    commitResolveWorker.close(),
    finalizeResolveWorker.close(),
  ])
  await connection.quit()
  process.exit(0)
})

// Helper functions to add jobs
export async function addPrepareResolveJob(data: PrepareResolveJobData, options?: any) {
  return prepareResolveQueue.add('prepareResolve', data, {
    removeOnComplete: 10,
    removeOnFail: 5,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000,
    },
    jobId: `prepare-${data.marketId}`, // Ensure idempotency
    ...options,
  })
}

export async function addCommitResolveJob(data: CommitResolveJobData, options?: any) {
  return commitResolveQueue.add('commitResolve', data, {
    removeOnComplete: 10,
    removeOnFail: 5,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 60000,
    },
    jobId: `commit-${data.marketId}`, // Ensure idempotency
    ...options,
  })
}

export async function addFinalizeResolveJob(data: FinalizeResolveJobData, delay: number, options?: any) {
  return finalizeResolveQueue.add('finalizeResolve', data, {
    removeOnComplete: 10,
    removeOnFail: 5,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 300000,
    },
    delay, // Delayed execution after dispute window
    jobId: `finalize-${data.marketId}`, // Ensure idempotency
    ...options,
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting BullMQ workers...')
  console.log('Workers started successfully. Press Ctrl+C to stop.')
}