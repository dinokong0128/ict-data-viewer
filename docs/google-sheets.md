# Google Sheets Integration

## Requirements

- Sheet must be shared with **"Anyone with the link"**
- `SHEET_ID` environment variable must be set

## API Endpoints

| Purpose | URL |
|---------|-----|
| List tabs | `https://spreadsheets.google.com/feeds/worksheets/{sheetId}/public/full?alt=json` |
| Get data | `https://docs.google.com/spreadsheets/d/{sheetId}/gviz/tq?sheet={sheetName}&tq=select *` |

## Column Aliasing

The app auto-detects column purposes via aliases in `lib/sheet.ts`:

```typescript
const columnAliases: Record<string, string[]> = {
  date: ['date', 'time', 'timestamp', 'start time', 'test time', 'datetime'],
  sn: ['sn', 'serial', 'serial number'],
  result: ['last_time', 'result', 'pass/fail', 'status'],
  // ...
};
```

To add a new mapping: add aliases here, then reference `mapping.newColumn` in components.

## Error Format

Errors in the sheet are ampersand-separated strings:
- `"E1 & E2 & E3"` → `['E1', 'E2', 'E3']`
- `"0"` or empty → `[]`

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Unable to load data" / "Not found" | Verify sheet sharing; check `SHEET_ID`; inspect browser console for HTTP errors |
| "No valid dates found" | Ensure a recognizable date column exists; check format (ISO, timestamp, Google Date) |
