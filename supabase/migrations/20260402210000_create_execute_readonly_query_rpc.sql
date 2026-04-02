-- RPC function for the AI chat feature (F1).
-- Accepts a SQL query string, validates it is read-only (SELECT/WITH only),
-- executes it, and returns the result rows as JSON.
-- Called from /api/chat via supabase.rpc('execute_readonly_query', { query: ... })

CREATE OR REPLACE FUNCTION public.execute_readonly_query(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
DECLARE
  result jsonb;
  normalized text;
BEGIN
  -- Normalize: trim whitespace, collapse to single spaces, uppercase for validation
  normalized := upper(trim(regexp_replace(query, '\s+', ' ', 'g')));

  -- Block empty queries
  IF normalized = '' OR normalized IS NULL THEN
    RAISE EXCEPTION 'Empty query is not allowed';
  END IF;

  -- Only allow SELECT and WITH (CTE) statements
  IF NOT (normalized LIKE 'SELECT %' OR normalized LIKE 'WITH %') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed, got: %', left(normalized, 40);
  END IF;

  -- Block dangerous keywords that could appear inside a SELECT/WITH
  IF normalized ~ '(?<![a-zA-Z0-9_])(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|DO)(?![a-zA-Z0-9_])' THEN
    RAISE EXCEPTION 'Query contains disallowed keyword';
  END IF;

  -- Block function calls that could mutate state
  IF normalized ~ '(?<![a-zA-Z0-9_])(PG_SLEEP|SET_CONFIG|DBLINK|LO_IMPORT|LO_EXPORT|PG_READ_FILE|PG_WRITE_FILE)(?![a-zA-Z0-9_])' THEN
    RAISE EXCEPTION 'Query contains disallowed function call';
  END IF;

  -- Execute and collect results as JSON array
  EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) t', query)
  INTO result;

  RETURN result;
END;
$$;

-- Grant execute to authenticated users (chat is role-gated in the app layer)
GRANT EXECUTE ON FUNCTION public.execute_readonly_query(text) TO authenticated;

COMMENT ON FUNCTION public.execute_readonly_query(text) IS
  'AI chat (F1): executes a validated read-only SQL query and returns results as JSON. Blocks DML/DDL.';
