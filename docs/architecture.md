# Architecture

## Project Structure

```
src/
├── app/api/
│   ├── ingest/route.ts  # POST /api/ingest — auth, parse, upsert to Supabase
│   └── tests/route.ts   # GET /api/tests — read from Supabase or guest fixture
├── components/           # Reusable React components (presentational)
│   ├── ChartPanel.tsx   # Chart rendering with Chart.js
│   ├── DetailTable.tsx  # Paginated data table (TestRecord rows)
│   ├── FilterPanel.tsx  # Filter controls (date range, metrics)
│   └── StatusBanner.tsx # Loading/error status messages
├── fixtures/
│   └── guest-data.json  # Synthetic demo data (used when SUPABASE_URL is absent)
├── lib/
│   ├── ict-parser.ts    # Pure ICT log parser (no DB deps)
│   ├── ict-db.ts        # Supabase upsert logic for ingest
│   └── testUtils.ts     # Shared TestRecord type + analytics helpers
├── pages/
│   ├── _app.tsx         # Next.js app wrapper
│   └── index.tsx        # HomePage (main dashboard container)
├── styles/
│   └── globals.css      # Global styles
└── __tests__/           # Jest test files
    ├── ict-parser.test.ts
    ├── ict-db.test.ts
    ├── ingest-route.test.ts
    ├── HomePage.test.tsx
    ├── FilterPanel.test.tsx
    ├── ChartPanel.test.tsx
    ├── DetailTable.test.tsx
    ├── StatusBanner.test.tsx
    └── App.test.tsx
```

## Container + Presentational Pattern

- **Container (HomePage):** Manages all state, fetches data, computes derived state via `useMemo`, passes everything to children as props
- **Presentational (FilterPanel, ChartPanel, etc.):** Fully controlled components with no internal state — receive data and callbacks via props

## Data Flow

```
GET /api/tests?start=…&end=…
  ├── SUPABASE_URL set → Supabase query (tests + boards + products + test_errors join)
  └── SUPABASE_URL absent → src/fixtures/guest-data.json (in-memory join, dates offset to today)
    ↓
TestRecord[]
    ↓
HomePage state (useState)
    ↓
useMemo transformations (filtering, grouping, chart config)
    ↓
Child components via props
    ↓
User interactions → callbacks → setState updates → re-computation
```

## Ingest Pipeline

```
Windows PC (outbound HTTPS only)
  └── Task Scheduler → pipeline/ict-ingest.ps1
        └── scans log directories hourly
        └── POSTs new files to Vercel POST /api/ingest

POST /api/ingest
  └── authenticates via x-ingest-secret header
  └── calls ict-parser.ts → ict-db.ts → Supabase
```

## Key Data Types

```typescript
// Shared type from lib/testUtils.ts
type TestRecord = {
  id:           number;
  board_id:     string;      // = serial_number (FK → boards)
  start_time:   string;      // ISO 8601
  end_time:     string;      // ISO 8601
  result:      'PASS' | 'FAIL';
  operator_id:  string;
  fixture_id:   string;
  tester:       string;
  source_file:  string;
  // joined from boards:
  serial_number: string;
  mac_address:   string;
  rev:           string;
  product_id:    string;
  // joined from products:
  product_name:  string;
  part_number:   string;
  // joined from test_errors:
  test_errors:   TestErrorRecord[];
};
```

## Performance

- All expensive computations use `useMemo`
- Table pagination: 12 rows per page (`PAGE_SIZE` constant)
- API fetches use `cache: 'no-store'` for fresh data
- Chart.js is dynamically imported (code splitting)
