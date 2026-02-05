export const SHEET_ID = process.env.SHEET_ID;

function requireSheetId(): string {
  if (!SHEET_ID) {
    throw new Error('Missing SHEET_ID. Configure it in your environment.');
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
  date: ['date', 'time', 'timestamp', 'start time', 'test time', 'datetime', 'unix_time', 'unix time'],
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

function dateFromNumeric(n: number): Date | null {
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  // Unix timestamps in seconds are < 1e12; in milliseconds >= 1e12
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseGvizDate(value: string | number | Date | null): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    // Google Sheets native format: Date(year,month,day,h,m,s)
    const match = trimmed.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
    if (match) {
      const [year, month, day, hour, minute, second] = match
        .slice(1)
        .map((part) => Number(part));
      return new Date(year, month, day, hour || 0, minute || 0, second || 0);
    }
    // Extract hex Unix timestamp from strings like "Wed-Dec-31-11:29:18-2025-PST-(0x6955798e)"
    const hexMatch = trimmed.match(/\(0x([0-9a-fA-F]+)\)/);
    if (hexMatch) {
      const epoch = parseInt(hexMatch[1], 16);
      const fromHex = dateFromNumeric(epoch);
      if (fromHex) {
        return fromHex;
      }
    }
    // Try parsing as a numeric string (Unix timestamp)
    const num = Number(trimmed);
    if (!Number.isNaN(num) && num > 0) {
      const fromNum = dateFromNumeric(num);
      if (fromNum) {
        return fromNum;
      }
    }
    // Slash-separated dates: M/D/YYYY or D/M/YYYY (assume M/D/YYYY)
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.*))?$/);
    if (slashMatch) {
      const m = Number(slashMatch[1]);
      const d = Number(slashMatch[2]);
      const y = Number(slashMatch[3]);
      const timePart = slashMatch[4];
      const base = new Date(y, m - 1, d);
      if (!Number.isNaN(base.getTime())) {
        if (timePart) {
          const full = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${timePart}`);
          if (!Number.isNaN(full.getTime())) return full;
        }
        return base;
      }
    }
    // YYYY/MM/DD format
    const ymdSlash = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(.*))?$/);
    if (ymdSlash) {
      const y = Number(ymdSlash[1]);
      const m = Number(ymdSlash[2]);
      const d = Number(ymdSlash[3]);
      const timePart = ymdSlash[4];
      const base = new Date(y, m - 1, d);
      if (!Number.isNaN(base.getTime())) {
        if (timePart) {
          const full = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${timePart}`);
          if (!Number.isNaN(full.getTime())) return full;
        }
        return base;
      }
    }
    // Standard Date constructor fallback (ISO, RFC, etc.)
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  if (typeof value === 'number') {
    return dateFromNumeric(value);
  }
  return null;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  gid: string;
};

export async function fetchSheetTabs(): Promise<SheetTab[]> {
  const sheetId = requireSheetId();
  // Fetch the spreadsheet HTML page to parse embedded sheet metadata
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit?usp=sharing`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to access spreadsheet (HTTP ${response.status}). Ensure it is shared publicly.`);
  }
  const html = await response.text();

  // Parse sheet metadata from the embedded JSON in the HTML
  // Google Sheets embeds sheet info in a script variable
  const sheetInfoMatch = html.match(/\{"sheets":\s*\[([^\]]+)\]/);
  if (sheetInfoMatch) {
    try {
      const sheetsJson = JSON.parse(`{"sheets":[${sheetInfoMatch[1]}]}`);
      const sheets = sheetsJson.sheets as Array<{ name?: string; id?: number }>;
      if (sheets && sheets.length > 0) {
        return sheets
          .filter((s) => s.name && s.id !== undefined)
          .map((s) => ({ title: s.name!, gid: String(s.id) }));
      }
    } catch {
      // Fall through to alternative parsing
    }
  }

  // Alternative: look for sheet tab links in the HTML
  const tabMatches = html.matchAll(/gid=(\d+)[^>]*>([^<]+)</g);
  const tabs: SheetTab[] = [];
  for (const match of tabMatches) {
    const gid = match[1];
    const title = match[2].trim();
    if (gid && title && !tabs.some((t) => t.gid === gid)) {
      tabs.push({ title, gid });
    }
  }

  if (tabs.length > 0) {
    return tabs;
  }

  // Fallback: return default first sheet with gid=0
  return [{ title: 'Sheet1', gid: '0' }];
}

export async function fetchSheetDataByGid(gid: string): Promise<FetchResult> {
  const sheetId = requireSheetId();
  const query = encodeURIComponent('select *');
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${gid}&tq=${query}`;
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
  const results = await Promise.all(tabs.map((tab) => fetchSheetDataByGid(tab.gid)));
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

  if (dateColumn === -1 && mapping.date !== undefined) {
    dateColumn = mapping.date;
  }
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
    const sample = result.rows.slice(0, 3).map((row) => row[dateColumn]);
    throw new Error(
      `No valid dates found. ` +
      `Detected columns: [${result.columns.join(', ')}]. ` +
      `Types: [${result.types.join(', ')}]. ` +
      `Date column index: ${dateColumn} ("${result.columns[dateColumn] ?? '?'}"). ` +
      `Sample values: ${JSON.stringify(sample)}`
    );
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

export type UtilizationEntry = {
  tester: string;
  count: number;
  days: number;
  perDay: number;
};

export function buildUtilization(rows: SheetRow[], testerIndex: number): UtilizationEntry[] {
  const testerDays: Record<string, Set<string>> = {};
  const testerCounts: Record<string, number> = {};
  rows.forEach((row) => {
    const tester = String(row.raw[testerIndex] ?? '').trim();
    if (!tester) {
      return;
    }
    testerCounts[tester] = (testerCounts[tester] || 0) + 1;
    if (!testerDays[tester]) {
      testerDays[tester] = new Set();
    }
    testerDays[tester].add(row.dateKey);
  });
  return Object.entries(testerCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tester, count]) => {
      const days = testerDays[tester].size;
      return { tester, count, days, perDay: Math.round(count / days) };
    });
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
