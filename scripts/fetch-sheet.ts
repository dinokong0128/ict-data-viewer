/**
 * Standalone script to fetch data from Google Sheets and cache it as JSON.
 *
 * Usage:
 *   SHEET_ID=your-sheet-id npm run fetch-data
 *
 * Output:
 *   data/sheet-cache.json
 */
import fs from 'fs';
import path from 'path';
import { fetchAllSheetData, SHEET_ID } from '../src/lib/sheet';

async function main() {
  if (!SHEET_ID) {
    console.error('Error: SHEET_ID environment variable is required.');
    process.exit(1);
  }

  console.log(`Fetching data from Google Sheet: ${SHEET_ID}`);

  const result = await fetchAllSheetData();

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const payload = {
    fetchedAt: new Date().toISOString(),
    sheetId: SHEET_ID,
    data: result
  };

  const cachePath = path.join(dataDir, 'sheet-cache.json');
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));

  console.log(`Saved ${result.rows.length} rows to ${cachePath}`);
  console.log(`Fetched at: ${payload.fetchedAt}`);
}

main().catch((error) => {
  console.error('Failed to fetch sheet data:', error);
  process.exit(1);
});
