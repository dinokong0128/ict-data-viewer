# CLAUDE.md - AI Assistant Guide for ICT Data Viewer

ICT board test log parser and ingest endpoint lives in `pipeline/` — see `pipeline/CLAUDE.md` for that subsystem.

## Project Overview

Next.js + React dashboard that visualizes ICT (In-Circuit Test) logs directly from Google Sheets. Data is read live; nothing is persisted locally.

## Quick Reference

```bash
npm install      # Install dependencies
npm run dev      # Start dev server
npm test         # Run tests
npm run lint     # Lint
npm run build    # Production build
```

**Required env var:** `SHEET_ID="your-google-sheet-id"`

## Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Next.js | 14.2.5 |
| UI | React | 18.3.1 |
| Language | TypeScript | 5.5.3 |
| Charting | Chart.js | 4.4.1 |
| Testing | Jest + React Testing Library | 29.7.0 |
| Linting | ESLint | 8.57.0 |

## Docs

- [Architecture & data flow](docs/architecture.md)
- [Code conventions](docs/conventions.md)
- [Testing guide](docs/testing.md)
- [Google Sheets integration](docs/google-sheets.md)
- [Common development tasks](docs/development-tasks.md)
