-- ICT Data Viewer — Supabase DDL (idempotent migration)
-- Safe to re-run: tables are created when missing; columns are added when missing.
-- No columns or tables are ever dropped.
--
-- Run in the Supabase SQL Editor (Database → SQL Editor).
-- Requires pg_cron for the rolling-delete schedule:
--   Database → Extensions → enable pg_cron

-- ============================================================
-- Custom enum types
-- ============================================================
DO $$ BEGIN
  CREATE TYPE test_result AS ENUM ('pass', 'fail');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE error_type AS ENUM ('analog', 'digital_pin', 'shorts_report', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 1. products — one row per board family / part number
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number   text UNIQUE,
  product_name  text,
  family        text
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS family       text;

-- ============================================================
-- 2. boards — one row per unique serial number
-- ============================================================
CREATE TABLE IF NOT EXISTS boards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number text UNIQUE,
  mac_address   text,
  rev           text,
  product_id    uuid REFERENCES products(id)
);

ALTER TABLE boards ADD COLUMN IF NOT EXISTS mac_address text;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS rev         text;

-- product_id FK — add column first (no FK), then constraint separately
ALTER TABLE boards ADD COLUMN IF NOT EXISTS product_id uuid;
DO $$ BEGIN
  ALTER TABLE boards
    ADD CONSTRAINT boards_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. tests — one row per test session (= one log file)
-- ============================================================
CREATE TABLE IF NOT EXISTS tests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     uuid        NOT NULL REFERENCES boards(id),
  start_time   timestamptz NOT NULL,
  end_time     timestamptz NOT NULL,
  result       test_result NOT NULL,
  operator_id  text,
  fixture_id   text,
  tester       text,
  source_file      text,                  -- original log filename
  ingested_at      timestamptz DEFAULT now(),
  error_locations  text[] DEFAULT '{}'    -- denormalised location codes from test_errors
);

-- Add new columns if upgrading from an older schema
ALTER TABLE tests ADD COLUMN IF NOT EXISTS fixture_id  text;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS tester      text;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS source_file text;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS ingested_at       timestamptz DEFAULT now();
ALTER TABLE tests ADD COLUMN IF NOT EXISTS error_locations   text[] DEFAULT '{}';

-- Unique dedup constraint — safe for re-ingestion and partial-file scenarios
DO $$ BEGIN
  ALTER TABLE tests
    ADD CONSTRAINT tests_board_id_start_time_end_time_key
    UNIQUE (board_id, start_time, end_time);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 4. test_errors — one row per failing component per test
-- ============================================================
CREATE TABLE IF NOT EXISTS test_errors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id        uuid NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  error_type     error_type,            -- 'analog' | 'digital_pin' | 'shorts_report' | 'unknown'
  location       text,                  -- PCB component reference, e.g. "c01", "r03"
  subtest        text,                  -- sub-test name or NULL
  part_spec      text,                  -- component value, e.g. "1UF", "22.1"
  unit           text,                  -- "FARADS" | "OHMS" | ""
  measured_raw   text,                  -- e.g. "0.78327u"
  measured_value float8,                -- parsed numeric value
  nominal_raw    text,
  nominal_value  float8,
  high_limit_raw text,
  high_limit_value float8,
  low_limit_raw  text,
  low_limit_value float8,
  threshold_raw  text,                  -- for shorts/resistance checks; NULL otherwise
  threshold_value float8,
  raw_block      text                   -- raw log lines that produced this error; enables re-parsing
);

-- Add new columns if upgrading from an older schema
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS error_type       error_type;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS location         text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS subtest          text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS part_spec        text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS unit             text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS measured_raw     text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS measured_value   float8;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS nominal_raw      text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS nominal_value    float8;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS high_limit_raw   text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS high_limit_value float8;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS low_limit_raw    text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS low_limit_value  float8;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS threshold_raw    text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS threshold_value  float8;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS raw_block        text;

-- Index on test_id for FK lookups and the backfill query below
CREATE INDEX IF NOT EXISTS test_errors_test_id_idx ON test_errors (test_id);

-- ============================================================
-- 4b. Backfill tests.error_locations from test_errors
-- Must run AFTER test_errors table + index exist.
-- ============================================================
UPDATE tests t SET error_locations = (
  SELECT COALESCE(ARRAY_AGG(te.location ORDER BY te.location), '{}')
  FROM test_errors te WHERE te.test_id = t.id
) WHERE error_locations IS NULL OR error_locations = '{}';

-- GIN index for filtering on error_locations (built after backfill for efficiency)
CREATE INDEX IF NOT EXISTS tests_error_locations_idx ON tests USING GIN (error_locations);

-- ============================================================
-- 5. Materialized view — summary by day/fixture/tester
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_summary_by_day AS
  SELECT
    (date_trunc('day', t.start_time))::date AS day,
    t.fixture_id,
    t.tester,
    t.operator_id,
    p.product_name,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE t.result = 'pass') AS pass,
    COUNT(*) FILTER (WHERE t.result != 'pass') AS fail,
    COUNT(DISTINCT t.board_id) AS unique_boards
  FROM tests t
    JOIN boards b ON b.id = t.board_id
    JOIN products p ON p.id = b.product_id
  GROUP BY 1, t.fixture_id, t.tester, t.operator_id, p.product_name;

-- ============================================================
-- 6. Materialized view — error counts by day + location
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_error_counts_by_day AS
  SELECT
    (date_trunc('day', t.start_time))::date AS day,
    te.location,
    t.fixture_id,
    t.tester,
    p.product_name,
    COUNT(*) AS error_count
  FROM test_errors te
    JOIN tests t ON t.id = te.test_id
    JOIN boards b ON b.id = t.board_id
    JOIN products p ON p.id = b.product_id
  GROUP BY 1, te.location, t.fixture_id, t.tester, p.product_name;

-- ============================================================
-- 7. Helper to refresh both MVs (called after ingest)
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_mv_summary() RETURNS void AS $$
  REFRESH MATERIALIZED VIEW mv_summary_by_day;
  REFRESH MATERIALIZED VIEW mv_error_counts_by_day;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- 7. Rolling 3-month delete  (pg_cron)
-- Runs daily at 02:00 UTC; test_errors cascade automatically.
-- ============================================================
DO $$ BEGIN
  PERFORM cron.schedule(
    'delete-old-tests',
    '0 2 * * *',
    $$DELETE FROM tests WHERE start_time < now() - INTERVAL '3 months'$$
  );
EXCEPTION WHEN unique_violation THEN
  -- Job already scheduled; update the command in case it changed
  UPDATE cron.job
    SET command = $$DELETE FROM tests WHERE start_time < now() - INTERVAL '3 months'$$
  WHERE jobname = 'delete-old-tests';
END $$;
