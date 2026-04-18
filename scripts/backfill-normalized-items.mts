import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { neon } from '@neondatabase/serverless'

import { buildNormalizedItemFields } from '../lib/normalization.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
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
if (!url) {
  console.error('POSTGRES_URL not set')
  process.exit(1)
}

const sql = neon(url)

const rows = await sql`
  SELECT id, raw_name, clean_name
  FROM receipt_items
`

let updated = 0
for (const row of rows) {
  const normalized = buildNormalizedItemFields(String(row.raw_name ?? ''), row.clean_name ? String(row.clean_name) : null)
  await sql`
    UPDATE receipt_items
    SET normalized_name = ${normalized.normalizedName},
        is_own_brand = ${normalized.isOwnBrand}
    WHERE id = ${row.id}
  `
  updated++
}

console.log(`Updated ${updated} receipt_items rows`)
