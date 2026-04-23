// Remove legacy SUBTOTAAL rows accidentally stored as receipt line items.
import { readFileSync, existsSync } from 'fs'
import { neon } from '@neondatabase/serverless'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !process.env[key]) process.env[key] = val
  }
}

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!url || url.includes('placeholder')) {
  console.error('POSTGRES_URL not set in .env.local')
  process.exit(1)
}

const sql = neon(url)
const rows = await sql`
  DELETE FROM receipt_items
  WHERE UPPER(TRIM(raw_name)) = 'SUBTOTAAL'
  RETURNING id
`

console.log(`Deleted ${rows.length} SUBTOTAAL line item rows`)
