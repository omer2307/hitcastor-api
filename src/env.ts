import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  // HTTP
  PORT: z.coerce.number().default(8080),
  ADMIN_API_KEY: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // DB & Cache
  PG_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Chain
  RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number(),
  RESOLVER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  FACTORY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  TREASURY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  QUOTE_TOKEN: z.string().default('USDT'),

  // Signer (choose one)
  PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  KMS_KEY_ID: z.string().optional(),
  KMS_REGION: z.string().optional(),

  // Evidence (optional re-uploads)
  OBJECT_STORE_ENDPOINT: z.string().url().optional(),
  OBJECT_STORE_BUCKET: z.string().optional(),
  OBJECT_STORE_ACCESS_KEY: z.string().optional(),
  OBJECT_STORE_SECRET_KEY: z.string().optional(),
  OBJECT_STORE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  OBJECT_STORE_OBJECT_LOCK: z.coerce.boolean().default(true),

  // Alerts (optional)
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})
.refine(
  (data) => data.PRIVATE_KEY || (data.KMS_KEY_ID && data.KMS_REGION),
  {
    message: 'Either PRIVATE_KEY or both KMS_KEY_ID and KMS_REGION must be provided',
    path: ['PRIVATE_KEY'],
  }
)

export type Env = z.infer<typeof envSchema>

export const env = envSchema.parse(process.env)