// scripts/migrate.mjs
import { readFileSync, existsSync } from 'fs'
import { neon } from '@neondatabase/serverless'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
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
  console.log('✓ Loaded .env.local')
}

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!url || url.includes('placeholder')) {
  console.error('✗ POSTGRES_URL not set in .env.local')
  process.exit(1)
}

const sql = neon(url)

// Run each CREATE TABLE individually so we can handle errors properly
const tables = [
  `CREATE TABLE IF NOT EXISTS store_locations (
    store_id    TEXT PRIMARY KEY,
    store_name  TEXT NOT NULL,
    city        TEXT,
    is_to_go    BOOLEAN DEFAULT false
  )`,

  `INSERT INTO store_locations (store_id, store_name, city, is_to_go) VALUES
    ('1251', 'Beverhof', 'Beverwijk', false),
    ('5805', 'AH to go', NULL, true),
    ('5609', 'Unknown AH location', NULL, false),
    ('8755', 'Unknown AH location', NULL, false),
    ('5606', 'Unknown AH location', NULL, false),
    ('1653', 'Unknown AH location', NULL, false),
    ('5833', 'Unknown AH location', NULL, false),
    ('5885', 'Unknown AH location', NULL, false),
    ('1379', 'Unknown AH location', NULL, false)
  ON CONFLICT (store_id) DO NOTHING`,

  `CREATE TABLE IF NOT EXISTS receipts (
    id                  SERIAL PRIMARY KEY,
    filename            TEXT UNIQUE NOT NULL,
    blob_url            TEXT NOT NULL,
    store_id            TEXT REFERENCES store_locations(store_id),
    receipt_date        DATE NOT NULL,
    receipt_time        TIME,
    year                INTEGER NOT NULL,
    month               INTEGER NOT NULL,
    week_saturday       DATE NOT NULL,
    item_count          INTEGER,
    subtotal            NUMERIC(8,2),
    bonus_savings       NUMERIC(8,2)  DEFAULT 0,
    koopzegels          NUMERIC(8,2)  DEFAULT 0,
    statiegeld          NUMERIC(8,2)  DEFAULT 0,
    net_grocery_spend   NUMERIC(8,2),
    total_paid          NUMERIC(8,2),
    payment_method      TEXT,
    parsed              BOOLEAN       DEFAULT false,
    parse_error         TEXT,
    reviewed_at         TIMESTAMPTZ,
    raw_text            TEXT,
    created_at          TIMESTAMPTZ   DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   DEFAULT NOW()
  )`,

  `ALTER TABLE receipts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`,

  `CREATE TABLE IF NOT EXISTS receipt_items (
    id              SERIAL PRIMARY KEY,
    receipt_id      INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    quantity        NUMERIC(6,2)  NOT NULL DEFAULT 1,
    raw_name        TEXT          NOT NULL,
    clean_name      TEXT,
    normalized_name TEXT,
    category        TEXT,
    subcategory     TEXT,
    unit_price      NUMERIC(8,2),
    total_price     NUMERIC(8,2)  NOT NULL,
    is_bonus_item   BOOLEAN       DEFAULT false,
    is_own_brand    BOOLEAN       DEFAULT false,
    is_statiegeld   BOOLEAN       DEFAULT false,
    is_koopzegel    BOOLEAN       DEFAULT false,
    is_non_food     BOOLEAN       DEFAULT false,
    btw_rate        INTEGER,
    created_at      TIMESTAMPTZ   DEFAULT NOW()
  )`,

  `ALTER TABLE receipt_items ADD COLUMN IF NOT EXISTS normalized_name TEXT`,
  `ALTER TABLE receipt_items ADD COLUMN IF NOT EXISTS is_own_brand BOOLEAN DEFAULT false`,

  `CREATE TABLE IF NOT EXISTS meal_plans (
    id              SERIAL PRIMARY KEY,
    week_saturday   DATE          NOT NULL,
    generated_by    TEXT          DEFAULT 'ai',
    meals_json      JSONB         NOT NULL,
    shopping_list   JSONB,
    estimated_cost  NUMERIC(8,2),
    actual_cost     NUMERIC(8,2),
    notes           TEXT,
    created_at      TIMESTAMPTZ   DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS ah_deals_cache (
    id          SERIAL PRIMARY KEY,
    fetched_at  TIMESTAMPTZ   DEFAULT NOW(),
    expires_at  TIMESTAMPTZ   NOT NULL,
    deals_json  JSONB         NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS pantry_items (
    id              SERIAL PRIMARY KEY,
    name            TEXT        NOT NULL,
    normalized_name TEXT        NOT NULL,
    quantity_note   TEXT,
    category        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS planner_defaults (
    id                    SERIAL PRIMARY KEY,
    lunch_count           INTEGER     NOT NULL DEFAULT 7,
    dinner_count          INTEGER     NOT NULL DEFAULT 7,
    servings              INTEGER     NOT NULL DEFAULT 2,
    max_prep_time         INTEGER     NOT NULL DEFAULT 30,
    vegetarian_days       INTEGER     NOT NULL DEFAULT 1,
    meal_prep_preference  TEXT        NOT NULL DEFAULT 'balanced',
    cuisine_mode          TEXT        NOT NULL DEFAULT 'mixed',
    excluded_ingredients  TEXT[]      NOT NULL DEFAULT '{}',
    preferred_proteins    TEXT[]      NOT NULL DEFAULT '{}',
    must_include_meals    TEXT[]      NOT NULL DEFAULT '{}',
    batch_cook_days       TEXT[]      NOT NULL DEFAULT '{Sunday}',
    budget_style          TEXT        NOT NULL DEFAULT 'balanced',
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE planner_defaults ADD COLUMN IF NOT EXISTS excluded_ingredients TEXT[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE planner_defaults ADD COLUMN IF NOT EXISTS preferred_proteins TEXT[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE planner_defaults ADD COLUMN IF NOT EXISTS must_include_meals TEXT[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE planner_defaults ADD COLUMN IF NOT EXISTS batch_cook_days TEXT[] NOT NULL DEFAULT '{Sunday}'`,
  `ALTER TABLE planner_defaults ADD COLUMN IF NOT EXISTS budget_style TEXT NOT NULL DEFAULT 'balanced'`,

  `CREATE TABLE IF NOT EXISTS automation_status (
    job_key               TEXT PRIMARY KEY,
    job_name              TEXT        NOT NULL,
    status                TEXT        NOT NULL DEFAULT 'ok',
    severity              TEXT        NOT NULL DEFAULT 'info',
    message               TEXT        NOT NULL,
    summary_json          JSONB,
    last_run_at           TIMESTAMPTZ DEFAULT NOW(),
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS receipts_date_idx   ON receipts(receipt_date)`,
  `CREATE INDEX IF NOT EXISTS receipts_year_idx   ON receipts(year, month)`,
  `CREATE INDEX IF NOT EXISTS receipts_week_idx   ON receipts(week_saturday)`,
  `CREATE INDEX IF NOT EXISTS items_receipt_idx   ON receipt_items(receipt_id)`,
  `CREATE INDEX IF NOT EXISTS items_category_idx  ON receipt_items(category)`,
  `CREATE INDEX IF NOT EXISTS items_normalized_name_idx ON receipt_items(normalized_name)`,
  `CREATE INDEX IF NOT EXISTS items_own_brand_idx ON receipt_items(is_own_brand)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pantry_items_normalized_name_idx ON pantry_items(normalized_name)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS meal_plans_week_idx ON meal_plans(week_saturday)`,

  `CREATE OR REPLACE FUNCTION get_week_saturday(d DATE)
   RETURNS DATE AS $$
     SELECT d - ((EXTRACT(DOW FROM d)::INTEGER + 1) % 7)
   $$ LANGUAGE SQL IMMUTABLE`,
]

console.log(`Running ${tables.length} statements...\n`)
let ok = 0, failed = 0

for (const stmt of tables) {
  const preview = stmt.replace(/\s+/g, ' ').slice(0, 55)
  try {
    await sql(stmt)
    console.log(`  ✓ ${preview}`)
    ok++
  } catch (err) {
    if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
      console.log(`  ~ ${preview} (skipped — exists)`)
      ok++
    } else {
      console.log(`  ✗ ${preview}\n    ${err.message}`)
      failed++
    }
  }
}

console.log(`\n${failed === 0 ? '✅' : '⚠️'} Done — ${ok} ok, ${failed} failed`)
if (failed === 0) console.log('\nDatabase is ready! Now run the bulk uploader.')
