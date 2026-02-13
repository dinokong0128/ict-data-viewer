import { fetchAllSheetData, type FetchResult } from './sheet';

/**
 * Supported data source types.
 * - 'sheet': Fetch live from Google Sheets (original behavior)
 * - 'json':  Read from locally cached JSON via the /api/sheet-data route
 */
export type DataSourceType = 'sheet' | 'json';

export function getDataSourceType(): DataSourceType {
  const source = process.env.DATA_SOURCE;
  if (source === 'json') return 'json';
  return 'sheet';
}

async function fetchFromJson(): Promise<FetchResult> {
  const response = await fetch('/api/sheet-data');
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Failed to load cached data (HTTP ${response.status}). ${body}`.trim()
    );
  }
  const payload = await response.json();
  return payload.data as FetchResult;
}

async function fetchFromSheet(): Promise<FetchResult> {
  return fetchAllSheetData();
}

/** Fetch ICT data using the adapter configured via DATA_SOURCE env var. */
export async function fetchData(): Promise<FetchResult> {
  const source = getDataSourceType();
  switch (source) {
    case 'json':
      return fetchFromJson();
    case 'sheet':
      return fetchFromSheet();
    default:
      throw new Error(`Unknown DATA_SOURCE: ${source}`);
  }
}
