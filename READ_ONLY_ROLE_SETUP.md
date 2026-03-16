# Read-Only Role & `execute_readonly_query` Setup

Paste the SQL blocks below into the **Supabase SQL editor** (project `maktqbmsfjkyjpyjgtzv`) in order.

---

## Step 1 — Create the `ict_readonly` role

```sql
-- Create a role with no login, no superuser, no create-db rights.
CREATE ROLE ict_readonly NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Grant SELECT on every existing table in the public schema.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ict_readonly;

-- Automatically grant SELECT on any tables created in the future.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO ict_readonly;
```

---

## Step 2 — Create the `execute_readonly_query` function

```sql
CREATE OR REPLACE FUNCTION execute_readonly_query(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as the function owner (postgres / service role)
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Safety check: only allow SELECT statements.
  IF query !~* '^\s*SELECT\b' THEN
    RAISE EXCEPTION 'Only SELECT statements are allowed. Got: %', LEFT(query, 80);
  END IF;

  -- Switch to the read-only role for the duration of this transaction.
  SET LOCAL ROLE ict_readonly;

  -- Execute the query and aggregate rows into a JSON array.
  EXECUTE format(
    'SELECT jsonb_agg(row_to_json(q)) FROM (%s) q',
    query
  ) INTO result;

  -- Return [] instead of NULL when the query matches no rows.
  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;
```

---

## Step 3 — Grant `EXECUTE` to the `anon` role

```sql
-- The anon role is used by unauthenticated requests (and the chat API route
-- which passes the anon key).
GRANT EXECUTE ON FUNCTION execute_readonly_query(TEXT) TO anon;
```

---

## Step 4 — Verification queries

**Confirm the function returns data:**
```sql
SELECT execute_readonly_query(
  'SELECT COUNT(*) AS total_tests FROM tests'
);
-- Expected: [{"total_tests": <number>}]
```

**Confirm a DELETE is rejected:**
```sql
SELECT execute_readonly_query(
  'DELETE FROM tests WHERE false'
);
-- Expected: ERROR: Only SELECT statements are allowed. Got: DELETE FROM tests WHERE false
```

---

## Step 5 — `.env.local` variables

Add these to your local `.env.local` file (never commit this file):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://maktqbmsfjkyjpyjgtzv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
ANTHROPIC_API_KEY=<your-anthropic-api-key>
```

> **Where to find the anon key:** Supabase dashboard → Project Settings → API → `anon` `public` key.

---

## Step 6 — Safety layers summary

| Layer | Where | What it does |
|-------|-------|--------------|
| **Pass 1 prompt instruction** | `src/lib/ict-prompt.ts` — `PASS1_SYSTEM_PROMPT` | Instructs Claude to output only SELECT SQL; responds `CANNOT_ANSWER` for out-of-scope questions |
| **Regex guard in route** | `src/app/api/chat/route.ts` — `guardSql()` | Rejects any SQL that does not start with `SELECT` or contains a mutation keyword before any DB call; returns HTTP 400 |
| **Function-level SELECT check** | `execute_readonly_query` Postgres function | Raises a Postgres exception if the query string does not start with `SELECT`, preventing execution entirely |
| **`ict_readonly` role permissions** | Postgres role set via `SET LOCAL ROLE` | Database-level enforcement: the role has only `SELECT` privileges on all tables; no `INSERT/UPDATE/DELETE/DDL` possible even if the other layers are bypassed |
