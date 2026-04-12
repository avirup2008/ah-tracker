// scripts/migrate.mjs
// Run with: node scripts/migrate.mjs
import { readFileSync } from 'fs'
import { neon } from '@neondatabase/serverless'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'process'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local manually
import { existsSync } from 'fs'
const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length && !key.startsWith('#')) {
      process.env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '')
    }
  }
  console.log('✓ Loaded .env.local')
}

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!url) {
  console.error('✗ POSTGRES_URL not set in .env.local')
  process.exit(1)
}

const sql = neon(url)
const schema = readFileSync(join(__dirname, '..', 'drizzle', 'schema.sql'), 'utf-8')

console.log('Running migration...')
try {
  // Split on semicolons and run each statement
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  for (const stmt of statements) {
    if (stmt.trim()) {
      await sql.unsafe(stmt)
      const firstLine = stmt.split('\n')[0].substring(0, 60)
      console.log(`  ✓ ${firstLine}...`)
    }
  }
  console.log('\n✅ Migration complete!')
} catch (err) {
  console.error('✗ Migration failed:', err.message)
  process.exit(1)
}
