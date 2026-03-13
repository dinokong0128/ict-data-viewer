-- ICT Data Viewer — Supabase DDL
-- Run this in the Supabase SQL editor (Database → SQL Editor).
-- Requires pg_cron for the rolling-delete schedule:
--   Database → Extensions → enable pg_cron

-- ------------------------------------------------------------
-- products: one row per board family / part number
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id           text PRIMARY KEY,  -- e.g. "465136J"
  part_number  text,              -- "8215911"
  revision     text,              -- "13"
  family       text               -- "C2-ROT41"
);

-- ------------------------------------------------------------
-- boards: one row per unique serial number
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS boards (
  id          text PRIMARY KEY,   -- "465136J+2609F808HH"  (canonical: + not _)
  product_id  text REFERENCES products(id),
  mac_address text
);

-- ------------------------------------------------------------
-- tests: one row per test session (= one log file)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tests (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  board_id     text        NOT NULL REFERENCES boards(id),
  start_time   timestamptz NOT NULL,
  end_time     timestamptz NOT NULL,
  result       text        NOT NULL,  -- 'PASS' or 'FAIL'
  operator_id  text,                  -- text: can be "102059" or "JT1227"
  tester       text,
  fixture_id   text,
  testplan     text,
  platform     text,
  ingested_at  timestamptz DEFAULT now(),
  UNIQUE (board_id, start_time, end_time)  -- safe dedup key for re-ingestion
);

-- ------------------------------------------------------------
-- test_errors: one row per unique failing component per test
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS test_errors (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_id          bigint NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  component        text   NOT NULL,  -- "c314_1_c"
  component_value  text,             -- "1UF"
  part_number      text,             -- "110-5581-01"
  measured_raw     text,             -- "0.78327u"
  measured         float8,           -- SI base unit: Farads or Ohms
  nominal_raw      text,
  nominal          float8,
  high_limit_raw   text,
  high_limit       float8,
  low_limit_raw    text,
  low_limit        float8,
  unit             text              -- "FARADS" or "OHMS"
);

-- ------------------------------------------------------------
-- rolling 3-month delete  (pg_cron)
-- Runs daily at 02:00 UTC; test_errors cascade automatically.
-- ------------------------------------------------------------
SELECT cron.schedule(
  'delete-old-tests',
  '0 2 * * *',
  $$DELETE FROM tests WHERE end_time < now() - INTERVAL '3 months'$$
);
