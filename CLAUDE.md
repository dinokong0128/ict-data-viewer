# CLAUDE.md - AI Assistant Guide for ICT Data Viewer

## Project Overview

ICT Data Viewer is a Next.js + React dashboard that visualizes ICT (In-Circuit Test) logs directly from Google Sheets. The app reads data live from sheets and does **not** download or persist any records locally.

**Key purpose:** Real-time data visualization for manufacturing test environments where data freshness is critical.

## Quick Reference

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Run linting
npm run lint

# Build for production
npm run build
```

**Required environment variable:**
```bash
export NEXT_PUBLIC_SHEET_ID="your-google-sheet-id"
```

## Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Next.js | 14.2.5 |
| UI Library | React | 18.3.1 |
| Language | TypeScript | 5.5.3 |
| Charting | Chart.js | 4.4.1 |
| Testing | Jest + React Testing Library | 29.7.0 |
| Linting | ESLint | 8.57.0 |

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
    ├── sheet.test.ts    # Unit tests for lib/sheet.ts
    ├── HomePage.test.tsx
    ├── FilterPanel.test.tsx
    ├── ChartPanel.test.tsx
    ├── DetailTable.test.tsx
    ├── StatusBanner.test.tsx
    └── App.test.tsx
```

## Architecture Patterns

### Container + Presentational Components

- **Container (HomePage):** Manages all state, fetches data, computes derived state via `useMemo`, passes everything to children as props
- **Presentational (FilterPanel, ChartPanel, etc.):** Fully controlled components with no internal state - receive data and callbacks via props

### Data Flow

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

### Key Data Types

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

## Code Conventions

### Naming

- **Components:** PascalCase (`HomePage`, `ChartPanel`)
- **Functions/variables:** camelCase (`fetchAllSheetData`, `buildState`)
- **Constants:** UPPER_SNAKE_CASE (`PAGE_SIZE`, `SHEET_ID`)
- **Types:** PascalCase with `Props` suffix for component props (`FilterPanelProps`)

### Import Paths

Use the `@/` alias for absolute imports (configured in tsconfig.json):
```typescript
import { ChartPanel } from '@/components/ChartPanel';
import { formatDate } from '@/lib/sheet';
```

### TypeScript Patterns

- Always define explicit prop types for components
- Use type guards in filter operations: `.filter((row): row is SheetRow => Boolean(row))`
- Use nullish coalescing for defaults: `value ?? ''`
- Prefer `string | null` over optional properties for nullable state

### React Patterns

- Wrap expensive computations in `useMemo` with dependency arrays
- Use `useCallback` for callbacks passed to children
- Use `void` prefix for async calls in useEffect: `void loadData()`
- Clean up effects properly (check mounted state for async operations)

## Testing Guidelines

### Test Structure

- Tests live in `src/__tests__/` directory
- File naming: `[component].test.tsx` or `[module].test.ts`
- Uses Jest + React Testing Library

### Test Patterns

```typescript
// Unit tests for utility functions
describe('sheet helpers', () => {
  it('normalizes and infers columns', () => {
    expect(normalize('  Sn ')).toBe('sn');
    expect(inferColumn('Tester Name')).toBe('tester');
  });
});

// Component tests
it('renders filter options', () => {
  render(<FilterPanel {...props} />);
  expect(screen.getByLabelText('Metric')).toBeInTheDocument();
});

// Interaction tests
it('calls handler on change', () => {
  const onMetricChange = jest.fn();
  render(<FilterPanel {...props} onMetricChange={onMetricChange} />);
  fireEvent.change(screen.getByLabelText('Metric'), { target: { value: 'errors' } });
  expect(onMetricChange).toHaveBeenCalledWith('errors');
});
```

### Running Tests

```bash
npm test                 # Run all tests
npm test -- --watch      # Watch mode
npm test -- --coverage   # With coverage report
```

## Google Sheets Integration

### API Endpoints Used

1. **List tabs:** `https://spreadsheets.google.com/feeds/worksheets/{sheetId}/public/full?alt=json`
2. **Get data:** `https://docs.google.com/spreadsheets/d/{sheetId}/gviz/tq?sheet={sheetName}&tq=select *`

### Requirements

- Google Sheet must be shared with "Anyone with the link"
- `NEXT_PUBLIC_SHEET_ID` environment variable must be set

### Column Aliasing

The system auto-detects column purposes via aliases defined in `lib/sheet.ts`:

```typescript
const columnAliases: Record<string, string[]> = {
  date: ['date', 'time', 'timestamp', 'start time', 'test time', 'datetime'],
  sn: ['sn', 'serial', 'serial number'],
  result: ['last_time', 'result', 'pass/fail', 'status'],
  // ... etc
};
```

This allows the app to work with different sheet structures without configuration.

### Error Format

Errors are stored as ampersand-separated strings in the source sheet:
- `"E1 & E2 & E3"` → `['E1', 'E2', 'E3']`
- `"0"` or empty → `[]`

## Common Development Tasks

### Adding a New Filter

1. Add state in `HomePage`: `const [newFilter, setNewFilter] = useState(...)`
2. Add prop to `FilterPanel` component
3. Update `FilterPanelProps` type
4. Add UI control in FilterPanel
5. Use the filter value in the appropriate `useMemo` computation
6. Write tests for the new filter

### Adding a New Chart Type

1. Update `ChartConfig` type in `HomePage`
2. Add case in the `chartConfig` `useMemo` computation
3. Update `ChartPanel` to handle new type
4. Add corresponding tests

### Adding a New Column Mapping

1. Add alias in `columnAliases` in `lib/sheet.ts`
2. Use `mapping.newColumn` in components as needed
3. Add tests for the new column detection

## Configuration Files

| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript config (strict mode, ES2020 target) |
| `next.config.js` | Next.js config (React strict mode) |
| `jest.config.js` | Jest test runner config |
| `jest.setup.ts` | Test setup (default SHEET_ID for tests) |
| `.eslintrc.json` | ESLint rules (next/core-web-vitals) |

## Troubleshooting

### "Unable to load data" or "Not found"
- Verify Google Sheet is shared with "Anyone with the link"
- Confirm `NEXT_PUBLIC_SHEET_ID` is set correctly
- Check browser console for specific HTTP error codes

### "No valid dates found"
- Ensure the sheet has a recognizable date column
- Check date format in the sheet (supports ISO strings, timestamps, Google Date format)

### Tests Failing
- Ensure `jest.setup.ts` provides `NEXT_PUBLIC_SHEET_ID` (default: `test-sheet-id`)
- Run `npm install` to ensure all dev dependencies are installed

## Performance Considerations

- **Memoization:** All expensive computations use `useMemo`
- **Pagination:** Table displays 12 rows per page (PAGE_SIZE constant)
- **No caching:** Fetches use `cache: 'no-store'` for fresh data
- **Code splitting:** Chart.js is dynamically imported
