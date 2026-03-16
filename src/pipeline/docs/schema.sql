-- ICT Data Viewer — Supabase DDL (idempotent migration)
-- Safe to re-run: tables are created when missing; columns are added when missing.
-- No columns or tables are ever dropped.
--
-- Run in the Supabase SQL Editor (Database → SQL Editor).
-- Requires pg_cron for the rolling-delete schedule:
--   Database → Extensions → enable pg_cron

-- ============================================================
-- 1. products — one row per board family / part number
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  part_number   text PRIMARY KEY,
  product_name  text
);

-- Add new columns if upgrading from an older schema
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_name text;

-- ============================================================
-- 2. boards — one row per unique serial number
-- ============================================================
CREATE TABLE IF NOT EXISTS boards (
  serial_number text PRIMARY KEY,
  mac_address   text,
  rev           text,
  product_id    text REFERENCES products(part_number)
);

-- Add new columns if upgrading from an older schema
ALTER TABLE boards ADD COLUMN IF NOT EXISTS mac_address text;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS rev         text;

-- product_id FK — add column first (no FK), then constraint separately
ALTER TABLE boards ADD COLUMN IF NOT EXISTS product_id text;
DO $$ BEGIN
  ALTER TABLE boards
    ADD CONSTRAINT boards_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(part_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. tests — one row per test session (= one log file)
-- ============================================================
CREATE TABLE IF NOT EXISTS tests (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  board_id     text        NOT NULL REFERENCES boards(serial_number),
  start_time   timestamptz NOT NULL,
  end_time     timestamptz NOT NULL,
  result       text        NOT NULL,  -- 'pass' or 'fail'
  operator_id  text,
  fixture_id   text,
  tester       text,
  source_file  text,                  -- original log filename
  ingested_at  timestamptz DEFAULT now()
);

-- Add new columns if upgrading from an older schema
ALTER TABLE tests ADD COLUMN IF NOT EXISTS fixture_id  text;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS tester      text;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS source_file text;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS ingested_at timestamptz DEFAULT now();

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
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_id        bigint NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  error_type     text,               -- 'analog' | 'digital_pin' | 'shorts_report' | 'unknown'
  location       text,               -- PCB component reference, e.g. "c01", "r03"
  subtest        text,               -- sub-test name or NULL
  part_spec      text,               -- component value, e.g. "1UF", "22.1"
  unit           text,               -- "FARADS" | "OHMS" | ""
  measured_raw   text,               -- e.g. "0.78327u"
  nominal_raw    text,
  high_limit_raw text,
  low_limit_raw  text,
  threshold_raw  text,               -- for shorts/resistance checks; NULL otherwise
  raw_block      text                -- raw log lines that produced this error; enables re-parsing
);

-- Add new columns if upgrading from an older schema
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS error_type     text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS location       text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS subtest        text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS part_spec      text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS unit           text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS measured_raw   text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS nominal_raw    text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS high_limit_raw text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS low_limit_raw  text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS threshold_raw  text;
ALTER TABLE test_errors ADD COLUMN IF NOT EXISTS raw_block      text;

-- ============================================================
-- 5. Rolling 3-month delete  (pg_cron)
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
