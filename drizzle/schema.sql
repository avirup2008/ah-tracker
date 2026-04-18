-- AH Tracker — Database Schema
-- Run via: npm run db:migrate

-- ─── Store lookup ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_locations (
  store_id    TEXT PRIMARY KEY,
  store_name  TEXT NOT NULL,
  city        TEXT,
  is_to_go    BOOLEAN DEFAULT false
);

INSERT INTO store_locations (store_id, store_name, city, is_to_go) VALUES
  ('1251', 'Beverhof',          'Beverwijk', false),
  ('5805', 'AH to go',          NULL,        true),
  ('5609', 'Unknown AH location', NULL,      false),
  ('8755', 'Unknown AH location', NULL,      false),
  ('5606', 'Unknown AH location', NULL,      false),
  ('1653', 'Unknown AH location', NULL,      false),
  ('5833', 'Unknown AH location', NULL,      false),
  ('5885', 'Unknown AH location', NULL,      false),
  ('1379', 'Unknown AH location', NULL,      false)
ON CONFLICT (store_id) DO NOTHING;

-- ─── Receipts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id                  SERIAL PRIMARY KEY,
  filename            TEXT UNIQUE NOT NULL,
  blob_url            TEXT NOT NULL,
  store_id            TEXT REFERENCES store_locations(store_id),
  receipt_date        DATE NOT NULL,
  receipt_time        TIME,
  year                INTEGER NOT NULL,
  month               INTEGER NOT NULL,
  -- week starting Saturday containing this receipt
  week_saturday       DATE NOT NULL,
  item_count          INTEGER,
  subtotal            NUMERIC(8,2),
  bonus_savings       NUMERIC(8,2)  DEFAULT 0,
  koopzegels          NUMERIC(8,2)  DEFAULT 0,
  statiegeld          NUMERIC(8,2)  DEFAULT 0,
  -- true spend = total_paid - koopzegels - statiegeld
  net_grocery_spend   NUMERIC(8,2),
  total_paid          NUMERIC(8,2),
  payment_method      TEXT,
  parsed              BOOLEAN       DEFAULT false,
  parse_error         TEXT,
  reviewed_at         TIMESTAMPTZ,
  raw_text            TEXT,
  created_at          TIMESTAMPTZ   DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS receipts_date_idx    ON receipts(receipt_date);
CREATE INDEX IF NOT EXISTS receipts_year_idx    ON receipts(year, month);
CREATE INDEX IF NOT EXISTS receipts_week_idx    ON receipts(week_saturday);
CREATE INDEX IF NOT EXISTS receipts_parsed_idx  ON receipts(parsed);

-- ─── Receipt Items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_items (
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
  btw_rate        INTEGER,      -- 9 (food) or 21 (non-food)
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS items_receipt_idx   ON receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS items_category_idx  ON receipt_items(category);
CREATE INDEX IF NOT EXISTS items_name_idx      ON receipt_items(clean_name);
CREATE INDEX IF NOT EXISTS items_normalized_name_idx ON receipt_items(normalized_name);
CREATE INDEX IF NOT EXISTS items_own_brand_idx ON receipt_items(is_own_brand);
CREATE INDEX IF NOT EXISTS items_date_idx      ON receipt_items(receipt_id, is_koopzegel, is_statiegeld);

-- ─── Meal Plans ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meal_plans (
  id              SERIAL PRIMARY KEY,
  week_saturday   DATE          NOT NULL,
  generated_by    TEXT          DEFAULT 'ai',
  -- JSON structure: { lunches: [...], dinners: [...] }
  meals_json      JSONB         NOT NULL,
  -- JSON structure: [{ category, items: [{ name, qty, unit, est_price }] }]
  shopping_list   JSONB,
  estimated_cost  NUMERIC(8,2),
  actual_cost     NUMERIC(8,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS meal_plans_week_idx ON meal_plans(week_saturday);

-- ─── AH Deals Cache ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ah_deals_cache (
  id          SERIAL PRIMARY KEY,
  fetched_at  TIMESTAMPTZ   DEFAULT NOW(),
  expires_at  TIMESTAMPTZ   NOT NULL,
  deals_json  JSONB         NOT NULL
);

-- ─── Helper: get week's Saturday ─────────────────────────────────
-- Usage: SELECT get_week_saturday('2025-11-14'::date);
CREATE OR REPLACE FUNCTION get_week_saturday(d DATE)
RETURNS DATE AS $$
  -- DOW: 0=Sun,1=Mon,...,6=Sat
  SELECT d - ((EXTRACT(DOW FROM d)::INTEGER + 1) % 7)
$$ LANGUAGE SQL IMMUTABLE;
