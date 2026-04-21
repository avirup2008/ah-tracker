import { readFileSync, existsSync } from 'fs'
import { neon } from '@neondatabase/serverless'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { buildFamilyKey } from '../lib/product-catalog.ts'

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
if (!url || url.includes('placeholder')) {
  console.error('POSTGRES_URL not set in .env.local')
  process.exit(1)
}

const sql = neon(url)

const rows = await sql`
  SELECT id, name, normalized_name
  FROM pantry_items
  ORDER BY id ASC
`

let updated = 0

for (const row of rows as Record<string, unknown>[]) {
  const familyKey = buildFamilyKey(String(row.name ?? row.normalized_name ?? ''))
  if (!familyKey) continue
  await sql`
    UPDATE pantry_items
    SET family_key = ${familyKey}, updated_at = NOW()
    WHERE id = ${Number(row.id)}
      AND (family_key IS NULL OR family_key <> ${familyKey})
  `
  updated++
}

console.log(`Updated pantry family keys for ${updated} rows`)
