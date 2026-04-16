-- Migration: backfill_test_errors_numeric_values
-- Purpose: Populate NULL measured_value, high_limit_value, low_limit_value,
--          threshold_value columns for existing test_errors rows where the
--          _raw column contains an SI-suffixed numeric string.
-- See backlog item B3.

-- Helper approach: a single UPDATE with CASE expressions per column.
-- Case-sensitive: 'M' = mega (1e6), 'm' = milli (1e-3). 'Meg' is also mega.
-- All unparseable values remain NULL.

CREATE OR REPLACE FUNCTION pg_temp.parse_si_numeric(raw TEXT)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  trimmed TEXT;
  last_char TEXT;
  num_part TEXT;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  trimmed := btrim(raw);
  IF trimmed = '' THEN RETURN NULL; END IF;

  -- Plain numeric (incl. scientific notation, signs)
  IF trimmed ~ '^-?[0-9]+\.?[0-9]*([eE][-+]?[0-9]+)?$' THEN
    RETURN trimmed::DOUBLE PRECISION;
  END IF;

  -- 'Meg' suffix (case-sensitive)
  IF trimmed ~ '^-?[0-9]+\.?[0-9]*Meg$' THEN
    RETURN (regexp_replace(trimmed, 'Meg$', ''))::DOUBLE PRECISION * 1e6;
  END IF;

  -- Single-char suffix (case-sensitive for M vs m)
  IF trimmed ~ '^-?[0-9]+\.?[0-9]*[fpnumMkKgG]$' THEN
    last_char := right(trimmed, 1);
    num_part := left(trimmed, length(trimmed) - 1);
    RETURN num_part::DOUBLE PRECISION *
      CASE last_char
        WHEN 'f' THEN 1e-15
        WHEN 'p' THEN 1e-12
        WHEN 'n' THEN 1e-9
        WHEN 'u' THEN 1e-6
        WHEN 'm' THEN 1e-3
        WHEN 'M' THEN 1e6
        WHEN 'k' THEN 1e3
        WHEN 'K' THEN 1e3
        WHEN 'g' THEN 1e9
        WHEN 'G' THEN 1e9
      END;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Backfill. Only touches rows where the _raw is non-empty and the _value is NULL.
UPDATE test_errors
SET measured_value = pg_temp.parse_si_numeric(measured_raw)
WHERE measured_value IS NULL
  AND measured_raw IS NOT NULL
  AND measured_raw <> '';

UPDATE test_errors
SET high_limit_value = pg_temp.parse_si_numeric(high_limit_raw)
WHERE high_limit_value IS NULL
  AND high_limit_raw IS NOT NULL
  AND high_limit_raw <> '';

UPDATE test_errors
SET low_limit_value = pg_temp.parse_si_numeric(low_limit_raw)
WHERE low_limit_value IS NULL
  AND low_limit_raw IS NOT NULL
  AND low_limit_raw <> '';

UPDATE test_errors
SET threshold_value = pg_temp.parse_si_numeric(threshold_raw)
WHERE threshold_value IS NULL
  AND threshold_raw IS NOT NULL
  AND threshold_raw <> '';
