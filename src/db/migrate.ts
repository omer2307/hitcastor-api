import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from './index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function migrate() {
  console.log('Running database migrations...')
  
  try {
    const migrationSQL = readFileSync(
      join(__dirname, 'migrations', '001_init.sql'),
      'utf8'
    )
    
    await pool.query(migrationSQL)
    console.log('✅ Migration 001_init.sql completed successfully')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
}