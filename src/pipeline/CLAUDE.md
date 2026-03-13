# Pipeline — ICT data ingest

Parser and ingest endpoint for ICT board test logs. Part of the `ict-data-viewer` repo;
the viewer/frontend context is in the root `CLAUDE.md`.

## Where things live

```
pipeline/
  CLAUDE.md                       ← you are here
  ict-ingest.ps1                  ← Windows Task Scheduler script
  ict-ingest.config.json.template ← copy to .json locally, fill in values, gitignored
  docs/
    schema.sql                    ← full Supabase DDL
    log-format.md                 ← log format, error types, parser edge cases
    sample-logs/                  ← real log files to test the parser against

src/                              ← Next.js app (repo root)
  app/api/ingest/
    route.ts                      ← POST endpoint: auth, parse, upsert
  lib/
    ict-parser.ts                 ← pure log parser, no DB deps — test in isolation
    ict-db.ts                     ← Supabase upsert logic
```

## Architecture

```
Windows PC (outbound HTTPS only)
  └── Task Scheduler → pipeline/ict-ingest.ps1
        └── scans configured log directories hourly
        └── POSTs new files to Vercel /api/ingest

Vercel (same project as viewer: ict-data-viewer)
  └── POST /api/ingest
        └── authenticates via x-ingest-secret header
        └── calls lib/ict-parser.ts → lib/ict-db.ts → Supabase

Supabase (free tier, 500MB limit)
  └── project ref: maktqbmsfjkyjpyjgtzv  (ICT DB MCP connector)
        └── products, boards, tests, test_errors
        └── 3-month rolling delete; test_errors cascade automatically
```

## Env vars (add to Vercel project)

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=    # service role, not anon key
INGEST_SECRET=                # arbitrary shared secret, matched in ict-ingest.config.json
```

## What to build

- [ ] Run `pipeline/docs/schema.sql` in Supabase (use the ICT DB MCP connector)
- [ ] `src/lib/ict-parser.ts` — see `pipeline/docs/log-format.md`, test against `pipeline/docs/sample-logs/`
- [ ] `src/lib/ict-db.ts` — Supabase upsert logic
- [ ] `src/app/api/ingest/route.ts` — auth, parse, upsert
- [ ] Supabase scheduled function for 3-month rolling delete

## Key decisions

| Decision | Choice | Reason |
|---|---|---|
| Same repo as viewer | Yes | Single deployment, no CORS, no sync overhead |
| Parse location | Vercel API route (TypeScript) | Iterate without touching Windows machine |
| Value storage | raw string + float8 | Raw for display, float for calibration math |
| No `raw_text` column | Dropped | Saves ~45% storage to fit 500MB free tier |
| Retention | 3 months | ~365MB est. at current volume, fits free tier |
| Serial number | Store with `+` | Filename uses `_`; file content uses `+` — canonical is `+` |
| Dedup key | `(board_id, start_time, end_time)` | Safe for re-ingestion and partial-file scenarios |
| `operator_id` | `text` | Can be numeric (`102059`) or alphanumeric (`JT1227`) |

## Volume (for reference)

~8,300 files/week, ~1,200 tests/day, ~6,100 errors/day, ~7.4 MB/day with Postgres overhead.
