# ICT Data Viewer

A Next.js + React dashboard that visualizes ICT (In-Circuit Test) board test results stored in Supabase.

## Tech stack

- Next.js + React
- TypeScript
- Jest + Testing Library
- ESLint
- Supabase (PostgreSQL)

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set the required environment variables:
   ```bash
   export SUPABASE_URL="https://your-project-ref.supabase.co"
   export SUPABASE_SERVICE_KEY="your-service-role-key"
   export INGEST_SECRET="your-ingest-secret"
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`. Without `SUPABASE_URL`, the dashboard loads guest fixture data automatically (demo mode).

## Tests & linting

- Run unit tests:
  ```bash
  npm test
  ```
- Run linting:
  ```bash
  npm run lint
  ```

## Troubleshooting

If the UI reports "Not found" or "Unable to load data," confirm `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set correctly.

## Vercel config

Add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `INGEST_SECRET` as environment variables in your Vercel project settings.
