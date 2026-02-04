export const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;

function requireSheetId(): string {
  if (!SHEET_ID) {
    throw new Error('Missing NEXT_PUBLIC_SHEET_ID. Configure it in your environment.');
  }
  return SHEET_ID;
}

export type SheetState = {
  rows: SheetRow[];
  columns: string[];
  dateColumn: number;
  mapping: Record<string, number>;
};

export type SheetRow = {
  raw: Array<string | number | null>;
  date: Date;
  dateKey: string;
  errors: string[];
};

export type FetchResult = {
  columns: string[];
  rows: Array<Array<string | number | null>>;
  types: string[];
};

const columnAliases: Record<string, string[]> = {
  date: ['date', 'time', 'timestamp', 'start time', 'test time', 'datetime'],
  sn: ['sn', 'serial', 'serial number'],
  mac: ['mac'],
  family: ['family'],
  pn: ['pn', 'part number'],
  tester: ['tester'],
  operator: ['operator'],
  fixture: ['fixture'],
  other: ['other', 'errors', 'failures'],
  result: ['last_time', 'result', 'pass/fail', 'status']
};

export function normalize(value: string | number | null | undefined): string {
  return (value ?? '').toString().trim().toLowerCase();
}

export function parseGvizDate(value: string | number | Date | null): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string') {
    const match = value.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
    if (match) {
      const [year, month, day, hour, minute, second] = match
        .slice(1)
        .map((part) => Number(part));
      return new Date(year, month, day, hour || 0, minute || 0, second || 0);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  if (typeof value === 'number') {
    return new Date(value);
  }
  return null;
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function parseErrors(value: string | number | null | undefined): string[] {
  if (!value) {
    return [];
  }
  const raw = value.toString();
  if (raw.trim() === '0') {
    return [];
  }
  return raw
    .split('&')
    .map((part) => part.trim())
    .filter((part) => part && part !== '0');
}

export function inferColumn(name: string): string | null {
  const key = normalize(name);
  const match = Object.entries(columnAliases).find(([, aliases]) =>
    aliases.some((alias) => key.includes(alias))
  );
  return match ? match[0] : null;
}

export type SheetTab = {
  title: string;
};

export async function fetchSheetTabs(): Promise<SheetTab[]> {
  const sheetId = requireSheetId();
  const url = `https://spreadsheets.google.com/feeds/worksheets/${sheetId}/public/full?alt=json`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to list sheet tabs (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as {
    feed?: { entry?: Array<{ title?: { $t?: string } }> };
  };
  const entries = data.feed?.entry ?? [];
  return entries
    .map((entry) => entry.title?.$t)
    .filter((title): title is string => Boolean(title))
    .map((title) => ({ title }));
}

export async function fetchSheetData(sheetName: string): Promise<FetchResult> {
  const sheetId = requireSheetId();
  const query = encodeURIComponent('select *');
  const sheetParam = encodeURIComponent(sheetName);
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${sheetParam}&tq=${query}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to reach the sheet (HTTP ${response.status}).`);
  }
  const text = await response.text();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Unexpected response from Google Sheets. Check sharing settings.');
  }
  const jsonText = text.substring(jsonStart, jsonEnd + 1);
  const data = JSON.parse(jsonText) as {
    table?: { cols: Array<{ label: string; id: string; type: string }>; rows: Array<{ c: Array<{ v: string | number | null } | null> }> };
  };
  if (!data.table?.rows?.length) {
    throw new Error('No rows returned. Confirm the tab is populated.');
  }
  const columns = data.table.cols.map((col) => col.label || col.id);
  const rows = data.table.rows.map((row) => row.c.map((cell) => (cell ? cell.v : null)));
  return { columns, rows, types: data.table.cols.map((col) => col.type) };
}

export function mergeFetchResults(results: FetchResult[]): FetchResult {
  if (!results.length) {
    throw new Error('No tabs returned from the sheet.');
  }
  const [first, ...rest] = results;
  const rows = rest.reduce((acc, current) => acc.concat(current.rows), [...first.rows]);
  return {
    columns: first.columns,
    rows,
    types: first.types
  };
}

export async function fetchAllSheetData(): Promise<FetchResult> {
  const tabs = await fetchSheetTabs();
  if (!tabs.length) {
    throw new Error('No tabs found in the sheet.');
  }
  const results = await Promise.all(tabs.map((tab) => fetchSheetData(tab.title)));
  return mergeFetchResults(results);
}

export function buildState(result: FetchResult): SheetState {
  const mapping: Record<string, number> = {};
  let dateColumn = -1;

  result.columns.forEach((name, index) => {
    const match = inferColumn(name);
    if (match && mapping[match] === undefined) {
      mapping[match] = index;
    }
    if (dateColumn === -1 && (result.types[index] === 'date' || result.types[index] === 'datetime')) {
      dateColumn = index;
    }
  });

  if (dateColumn === -1) {
    const dateIndex = result.columns.findIndex((col) => normalize(col).includes('date'));
    dateColumn = dateIndex >= 0 ? dateIndex : 0;
  }

  const rows = result.rows
    .map((row) => {
      const rawDate = row[dateColumn];
      const date = parseGvizDate(rawDate);
      return date
        ? {
            raw: row,
            date,
            dateKey: formatDate(date),
            errors: parseErrors(row[mapping.other])
          }
        : null;
    })
    .filter((row): row is SheetRow => Boolean(row));

  if (!rows.length) {
    throw new Error('No valid dates found. Check which column contains timestamps.');
  }

  return {
    rows,
    columns: result.columns,
    dateColumn,
    mapping
  };
}

export function getRangeBounds(rows: SheetRow[]): { minDate: Date; maxDate: Date } {
  const sorted = [...rows].map((row) => row.date).sort((a, b) => a.getTime() - b.getTime());
  return {
    minDate: sorted[0],
    maxDate: sorted[sorted.length - 1]
  };
}

export function filterRowsByRange(rows: SheetRow[], start: Date, end: Date): SheetRow[] {
  return rows.filter((row) => row.date >= start && row.date <= end);
}

export function buildSummary(rows: SheetRow[], mapping: Record<string, number>): string[] {
  const uniqueBoards = new Set(
    rows.map((row) => row.raw[mapping.sn] || row.raw[mapping.mac] || row.raw[0])
  );
  const passCount = rows.filter((row) => normalize(row.raw[mapping.result]) === 'pass').length;
  const failCount = rows.filter((row) => normalize(row.raw[mapping.result]) === 'fail').length;
  const errorCounts: Record<string, number> = {};
  rows.forEach((row) => {
    row.errors.forEach((error) => {
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });
  });
  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([error, count]) => `${error} (${count})`);

  return [
    `Total tests: ${rows.length}`,
    `Unique boards: ${uniqueBoards.size}`,
    `Pass: ${passCount} | Fail: ${failCount}`,
    `Top errors: ${topErrors.length ? topErrors.join(', ') : 'None'}`
  ];
}

export function groupByDate(rows: SheetRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    counts.set(row.dateKey, (counts.get(row.dateKey) || 0) + 1);
  });
  return counts;
}

export function getCategoryOptions(rows: SheetRow[], fieldIndex: number): string[] {
  const counts: Record<string, number> = {};
  rows.forEach((row) => {
    const value = row.raw[fieldIndex];
    if (!value) {
      return;
    }
    counts[String(value)] = (counts[String(value)] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value);
}

export function buildErrorCounts(rows: SheetRow[]): { errors: string[]; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const allErrors = new Set<string>();
  rows.forEach((row) => {
    row.errors.forEach((error) => {
      allErrors.add(error);
      const key = `${row.dateKey}::${error}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  return { errors: Array.from(allErrors).sort(), counts };
}
