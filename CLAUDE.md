# CLAUDE.md - AI Assistant Guide for ICT Data Viewer

ICT board test log parser and ingest endpoint lives in `pipeline/` — see `pipeline/CLAUDE.md` for that subsystem.

## Project Overview

Next.js + React dashboard that visualizes ICT (In-Circuit Test) board test results stored in Supabase.
The frontend calls `GET /api/tests` which reads from Supabase, or falls back to `src/fixtures/guest-data.json`
when `SUPABASE_URL` is not set.

## Quick Reference

```bash
npm install      # Install dependencies
npm run dev      # Start dev server
npm test         # Run tests
npm run lint     # Lint
npm run build    # Production build
```

**Required env vars (for live data):**
```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
INGEST_SECRET=your-ingest-secret
```

Without `SUPABASE_URL`, the dashboard loads guest fixture data automatically (demo mode).

## Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Next.js | 14.2.5 |
| UI | React | 18.3.1 |
| Language | TypeScript | 5.5.3 |
| Charting | Chart.js | 4.4.1 |
| Database | Supabase (PostgreSQL) | @supabase/supabase-js v2 |
| Testing | Jest + React Testing Library | 29.7.0 |
| Linting | ESLint | 8.57.0 |

## Docs

- [Architecture & data flow](docs/architecture.md)
- [Code conventions](docs/conventions.md)
- [Testing guide](docs/testing.md)
- [Common development tasks](docs/development-tasks.md)
