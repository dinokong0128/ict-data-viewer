# Architecture

## Project Structure

```
src/
├── components/           # Reusable React components (presentational)
│   ├── ChartPanel.tsx   # Chart rendering with Chart.js
│   ├── DetailTable.tsx  # Paginated data table
│   ├── FilterPanel.tsx  # Filter controls (date range, metrics)
│   └── StatusBanner.tsx # Loading/error status messages
├── lib/
│   └── sheet.ts         # Google Sheets API integration & data processing
├── pages/
│   ├── _app.tsx         # Next.js app wrapper
│   └── index.tsx        # HomePage (main dashboard container)
├── styles/
│   └── globals.css      # Global styles
└── __tests__/           # Jest test files
    ├── sheet.test.ts
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
Google Sheets API → fetchAllSheetData() → buildState() → SheetState
    ↓
HomePage state (useState)
    ↓
useMemo transformations (filtering, grouping, chart config)
    ↓
Child components via props
    ↓
User interactions → callbacks → setState updates → re-computation
```

## Key Data Types

```typescript
// Core state structure from lib/sheet.ts
type SheetState = {
  rows: SheetRow[];
  columns: string[];
  dateColumn: number;
  mapping: Record<string, number>;  // Column name to index mapping
};

type SheetRow = {
  raw: Array<string | number | null>;
  date: Date;
  dateKey: string;      // YYYY-MM-DD format
  errors: string[];     // Parsed from ampersand-separated error column
};
```

## Performance

- All expensive computations use `useMemo`
- Table pagination: 12 rows per page (`PAGE_SIZE` constant)
- Fetches use `cache: 'no-store'` for fresh data
- Chart.js is dynamically imported (code splitting)
