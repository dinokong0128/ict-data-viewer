-- RPC function: get_tests_in_range
-- Returns tests joined with boards/products and aggregated error locations.
-- Uses materialized CTEs so error locations are only looked up for failed tests,
-- avoiding a full scan of the test_errors table.
-- Called by the /api/tests endpoint via supabase.rpc('get_tests_in_range', ...).

-- Drop the old view that caused RLS statement timeouts
DROP VIEW IF EXISTS tests_with_errors;

CREATE OR REPLACE FUNCTION get_tests_in_range(p_start timestamptz, p_end timestamptz)
RETURNS TABLE (
  id           uuid,
  board_id     uuid,
  start_time   timestamptz,
  end_time     timestamptz,
  result       text,
  operator_id  text,
  fixture_id   text,
  tester       text,
  source_file  text,
  ingested_at  timestamptz,
  serial_number text,
  mac_address  text,
  rev          text,
  product_id   text,
  product_name text,
  part_number  text,
  error_locations text[]
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  WITH test_data AS MATERIALIZED (
    SELECT t.id, t.board_id, t.start_time, t.end_time, t.result::text,
           t.operator_id, t.fixture_id, t.tester, t.source_file, t.ingested_at,
           b.serial_number, b.mac_address, b.rev, b.product_id::text,
           p.product_name, p.part_number
    FROM tests t
    JOIN boards b ON b.id = t.board_id
    JOIN products p ON p.id = b.product_id
    WHERE t.start_time >= p_start
      AND t.start_time <= p_end
  ),
  error_locs AS MATERIALIZED (
    SELECT te.test_id, array_agg(te.location) AS locs
    FROM test_errors te
    WHERE te.test_id IN (SELECT td.id FROM test_data td WHERE td.result = 'fail')
    GROUP BY te.test_id
  )
  SELECT td.*,
         COALESCE(el.locs, ARRAY[]::text[]) AS error_locations
  FROM test_data td
  LEFT JOIN error_locs el ON el.test_id = td.id
  ORDER BY td.start_time DESC, td.id DESC;
$$;

GRANT EXECUTE ON FUNCTION get_tests_in_range(timestamptz, timestamptz) TO authenticated, anon;
