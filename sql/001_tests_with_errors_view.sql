-- View: tests_with_errors
-- Flattens tests + boards + products and aggregates error locations into a
-- string array per test row.  Queried by the /api/tests endpoint instead of
-- the nested PostgREST select that caused 500 errors on large result sets.

CREATE OR REPLACE VIEW tests_with_errors AS
SELECT
  t.id,
  t.board_id,
  t.start_time,
  t.end_time,
  t.result,
  t.operator_id,
  t.fixture_id,
  t.tester,
  t.source_file,
  t.ingested_at,
  b.serial_number,
  b.mac_address,
  b.rev,
  b.product_id,
  p.product_name,
  p.part_number,
  COALESCE(
    array_agg(te.location) FILTER (WHERE te.id IS NOT NULL),
    ARRAY[]::text[]
  ) AS error_locations
FROM tests t
JOIN boards b ON b.serial_number = t.board_id
JOIN products p ON p.part_number = b.product_id
LEFT JOIN test_errors te ON te.test_id = t.id
GROUP BY
  t.id,
  b.serial_number, b.mac_address, b.rev, b.product_id,
  p.product_name, p.part_number;
