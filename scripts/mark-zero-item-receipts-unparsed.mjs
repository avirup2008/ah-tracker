import { readFileSync, existsSync } from 'fs'
import { neon } from '@neondatabase/serverless'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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
  WITH zero_item_receipts AS (
    SELECT r.id
    FROM receipts r
    LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
    WHERE r.parsed = true
    GROUP BY r.id
    HAVING COUNT(ri.id) = 0
  )
  UPDATE receipts r
  SET
    parsed = false,
    parse_error = 'Parsed receipt has no line items; retry parse after parser update.',
    item_count = 0,
    updated_at = NOW()
  FROM zero_item_receipts z
  WHERE r.id = z.id
  RETURNING r.id, r.filename
`

console.log(`Marked ${rows.length} zero-item parsed receipts for re-parse`)
for (const row of rows) {
  console.log(`- ${row.id}: ${row.filename}`)
}
