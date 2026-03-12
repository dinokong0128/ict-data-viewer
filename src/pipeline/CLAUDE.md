# ict-data-viewer

Full-stack Next.js app that displays ICT board test data. Deployed on Vercel, backed by
Supabase. Two concerns live in this repo:

- **Viewer** — the Next.js app (frontend + API routes) under `src/`
- **Pipeline** — the Windows-side ingest script under `pipeline/`; see `pipeline/CLAUDE.md`

## Repo structure

```
src/
  app/api/ingest/route.ts   ← POST endpoint: authenticates, parses, upserts
  lib/ict-parser.ts         ← pure log parser, no DB deps — test in isolation
  lib/ict-db.ts             ← Supabase upsert logic
pipeline/
  CLAUDE.md                 ← PowerShell script context
  ict-ingest.ps1            ← Windows Task Scheduler script
  ict-ingest.config.json    ← gitignored: directories, API URL, secret
docs/
  schema.sql                ← Supabase DDL
  log-format.md             ← log file format, error types, parser edge cases
  sample-logs/              ← real log files to test the parser against
```

## Supabase

- Project ref: `maktqbmsfjkyjpyjgtzv` (ICT DB MCP connector)
- Tables: `products`, `boards`, `tests`, `test_errors`
- 3-month rolling delete on `tests`; `test_errors` cascade automatically
- Schema: `docs/schema.sql`

## Env vars

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=    # service role, not anon key
INGEST_SECRET=                # shared secret, must match pipeline/ict-ingest.config.json
```

## Ingest API — POST /api/ingest

- Auth: `x-ingest-secret` header
- Body: `{ filename: string, content: string }`
- Calls `lib/ict-parser.ts` → `lib/ict-db.ts`
- Upserts with `ON CONFLICT (board_id, start_time, end_time) DO NOTHING`
- See `docs/log-format.md` for full parser spec and edge cases

## Key decisions

| Decision | Choice | Reason |
|---|---|---|
| Parser location | Vercel API route (TypeScript) | Iterate without touching Windows machine |
| Value storage | raw string + float8 | Raw for display, float for calibration math |
| No `raw_text` column | Dropped | Saves ~45% storage to fit 500MB free tier |
| Retention | 3 months | ~365MB est. at current volume, fits free tier |
| Serial number | Store with `+` | Filename uses `_`; file content uses `+` — canonical is `+` |
| Dedup key | `(board_id, start_time, end_time)` | Safe for re-ingestion and partial-file scenarios |
| `operator_id` | `text` | Can be numeric (`102059`) or alphanumeric (`JT1227`) |

## Volume (for reference)

~8,300 files/week, ~1,200 tests/day, ~6,100 errors/day, ~7.4 MB/day with Postgres overhead.

## What to build

- [ ] Run `docs/schema.sql` in Supabase (use the ICT DB MCP connector)
- [ ] `src/lib/ict-parser.ts` — see `docs/log-format.md`, test against `docs/sample-logs/`
- [ ] `src/lib/ict-db.ts` — Supabase upsert logic
- [ ] `src/app/api/ingest/route.ts` — auth, parse, upsert
- [ ] `pipeline/ict-ingest.ps1` — PowerShell ingest script
- [ ] Supabase scheduled function for 3-month rolling delete
