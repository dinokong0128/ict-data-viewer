-- ICT DB schema
-- Run this in Supabase SQL editor or via the ICT DB MCP connector.

-- products: one row per board type. Never deleted (boards reference it even after test history ages out).
create table products (
  id            uuid primary key default gen_random_uuid(),
  part_number   text not null unique,
  product_name  text not null
);

-- boards: one row per physical board. Never deleted.
create table boards (
  id             uuid primary key default gen_random_uuid(),
  serial_number  text not null unique,  -- stored with '+', e.g. '465136J+2609F808HH'
  mac_address    text,
  rev            text,
  product_id     uuid not null references products(id)
);

create type test_result as enum ('pass', 'fail');

-- tests: one row per test session (one metadata block in the log file).
-- Deleted on 3-month rolling schedule; test_errors cascade automatically.
create table tests (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references boards(id),
  start_time   timestamptz not null,
  end_time     timestamptz not null,
  operator_id  text,        -- text, not int: can be '102059' or 'JT1227'
  fixture_id   text,
  tester       text,
  result       test_result not null,
  source_file  text not null,       -- original filename, for debugging
  ingested_at  timestamptz not null default now(),
  unique (board_id, start_time, end_time)  -- dedup key; use ON CONFLICT DO NOTHING on insert
);

create type error_type as enum ('analog', 'digital_pin', 'shorts_report', 'unknown');

-- test_errors: one row per unique failure within a test session.
-- ON DELETE CASCADE means the 3-month delete on tests cleans these up automatically.
create table test_errors (
  id               uuid primary key default gen_random_uuid(),
  test_id          uuid not null references tests(id) on delete cascade,
  error_type       error_type not null,
  location         text not null,        -- e.g. 'r625', 'u201%prog_1', 'shorts_report'
  subtest          text,                 -- only for pwr_res_chk-type errors
  part_spec        text,                 -- e.g. 'R625=20K Part# 7336425'
  unit             text,                 -- e.g. 'FARADS', 'OHMS'
  measured_raw     text,
  measured_value   float8,              -- normalized to base unit (e.g. 0.00000078327 for '0.78327u')
  nominal_raw      text,
  nominal_value    float8,
  high_limit_raw   text,
  high_limit_value float8,
  low_limit_raw    text,
  low_limit_value  float8,
  threshold_raw    text,
  threshold_value  float8
);

create index on tests (board_id);
create index on tests (start_time);
create index on test_errors (test_id);
create index on test_errors (location);  -- for queries like "all boards that ever failed r625"

-- 3-month rolling delete (run as a Supabase scheduled function, e.g. weekly)
-- delete from tests where start_time < now() - interval '3 months';
-- test_errors are cleaned up automatically via ON DELETE CASCADE.
