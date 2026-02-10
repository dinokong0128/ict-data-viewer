import {
  buildErrorCounts,
  buildState,
  buildSummary,
  buildUtilization,
  detectAndRealignHeaders,
  filterRowsByRange,
  formatDate,
  groupByDate,
  inferColumn,
  mergeFetchResults,
  normalize,
  parseErrors,
  parseGvizDate
} from '@/lib/sheet';

const sampleResult = {
  columns: ['Date', 'SN', 'Tester', 'Other', 'Last_time'],
  rows: [
    ['2024-05-01T12:00:00', 'A1', 'T1', 'E1&E2', 'pass'],
    ['2024-05-02T12:00:00', 'A2', 'T1', '0', 'fail']
  ],
  types: ['date', 'string', 'string', 'string', 'string']
};

describe('sheet helpers', () => {
  it('normalizes and infers columns', () => {
    expect(normalize('  Sn ')).toBe('sn');
    expect(inferColumn('Tester Name')).toBe('tester');
  });

  it('parses gviz and error values', () => {
    expect(parseGvizDate('Date(2024,4,1)')?.getFullYear()).toBe(2024);
    expect(parseErrors('E1 & E2')).toEqual(['E1', 'E2']);
    expect(parseErrors('0')).toEqual([]);
  });

  it('builds state and summary', () => {
    const state = buildState(sampleResult);
    expect(state.rows).toHaveLength(2);
    const summary = buildSummary(state.rows, state.mapping);
    expect(summary[0]).toContain('Total tests: 2');
  });

  it('filters rows by range and groups by date', () => {
    const state = buildState(sampleResult);
    const start = new Date('2024-05-01T00:00:00');
    const end = new Date('2024-05-01T23:59:59');
    const filtered = filterRowsByRange(state.rows, start, end);
    expect(filtered).toHaveLength(1);
    const grouped = groupByDate(state.rows);
    expect(grouped.get('2024-05-01')).toBe(1);
  });

  it('builds error counts', () => {
    const state = buildState(sampleResult);
    const result = buildErrorCounts(state.rows);
    expect(result.errors).toEqual(['E1', 'E2']);
  });

  it('merges fetch results', () => {
    const merged = mergeFetchResults([
      sampleResult,
      {
        columns: sampleResult.columns,
        rows: [['2024-05-03T12:00:00', 'A3', 'T2', '0', 'pass']],
        types: sampleResult.types
      }
    ]);
    expect(merged.rows).toHaveLength(3);
  });

  it('parses hex timestamp from custom format string', () => {
    const date = parseGvizDate('Wed-Dec-31-11:29:18-2025-PST-(0x6955798e)');
    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(2025);
    expect(date!.getUTCMonth()).toBe(11); // December
    expect(date!.getUTCDate()).toBe(31);
  });

  it('parses Unix timestamps in seconds', () => {
    const date = parseGvizDate(1714521600);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2024);
  });

  it('parses Unix timestamps as strings', () => {
    const date = parseGvizDate('1714521600');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2024);
  });

  it('infers UNIX_Time as date column', () => {
    expect(inferColumn('UNIX_Time')).toBe('date');
  });

  it('builds state from UNIX_Time column with hex timestamps', () => {
    const unixResult = {
      columns: ['UNIX_Time', 'SN', 'Tester', 'Other', 'Last_time'],
      rows: [
        ['Wed-Dec-31-11:29:18-2025-PST-(0x6955798e)', 'A1', 'T1', 'E1&E2', 'pass'],
        ['Wed-Dec-31-10:09:16-2025-PST-(0x695566cc)', 'A2', 'T1', '0', 'fail']
      ],
      types: ['string', 'string', 'string', 'string', 'string']
    };
    const state = buildState(unixResult);
    expect(state.rows).toHaveLength(2);
    expect(state.dateColumn).toBe(0);
    expect(state.rows[0].date.getUTCFullYear()).toBe(2025);
  });

  it('builds utilization data', () => {
    const state = buildState(sampleResult);
    const util = buildUtilization(state.rows, state.mapping.tester);
    expect(util).toHaveLength(1);
    expect(util[0].tester).toBe('T1');
    expect(util[0].count).toBe(2);
  });

  it('parses M/D/YYYY date format', () => {
    const date = parseGvizDate('1/15/2025');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2025);
    expect(date!.getMonth()).toBe(0); // January
    expect(date!.getDate()).toBe(15);
  });

  it('parses M/D/YYYY with time', () => {
    const date = parseGvizDate('12/31/2025 14:30:00');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2025);
    expect(date!.getMonth()).toBe(11);
    expect(date!.getHours()).toBe(14);
  });

  it('parses YYYY/MM/DD date format', () => {
    const date = parseGvizDate('2025/01/15');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2025);
    expect(date!.getMonth()).toBe(0);
    expect(date!.getDate()).toBe(15);
  });

  it('returns null for empty or whitespace strings', () => {
    expect(parseGvizDate('')).toBeNull();
    expect(parseGvizDate('  ')).toBeNull();
    expect(parseGvizDate(null)).toBeNull();
  });

  it('includes diagnostic info in buildState error', () => {
    const badResult = {
      columns: ['Foo', 'Bar'],
      rows: [['not-a-date', 'baz']],
      types: ['string', 'string']
    };
    expect(() => buildState(badResult)).toThrow(/Detected columns: \[Foo, Bar\]/);
    expect(() => buildState(badResult)).toThrow(/Sample values:/);
  });

  it('builds state from M/D/YYYY dates', () => {
    const slashResult = {
      columns: ['Date', 'SN', 'Tester', 'Other', 'Last_time'],
      rows: [
        ['1/15/2025', 'A1', 'T1', '0', 'pass'],
        ['1/16/2025', 'A2', 'T1', '0', 'fail']
      ],
      types: ['string', 'string', 'string', 'string', 'string']
    };
    const state = buildState(slashResult);
    expect(state.rows).toHaveLength(2);
    expect(state.rows[0].dateKey).toBe('2025-01-15');
  });
});

describe('detectAndRealignHeaders', () => {
  it('keeps result unchanged when columns already match aliases', () => {
    const result = detectAndRealignHeaders(sampleResult);
    expect(result.columns).toEqual(sampleResult.columns);
    expect(result.rows).toEqual(sampleResult.rows);
  });

  it('finds real header row when columns are generic IDs', () => {
    // Simulates a tab where gviz used row 1 (junk) as headers,
    // and the real headers are in a data row
    const misaligned = {
      columns: ['A', 'B', 'C', 'D', 'E'],
      rows: [
        ['some title', null, null, null, null],
        ['notes here', null, null, null, null],
        ['Date', 'SN', 'Tester', 'Other', 'Last_time'],  // real header at index 2
        ['2024-05-01T12:00:00', 'A1', 'T1', 'E1&E2', 'pass'],
        ['2024-05-02T12:00:00', 'A2', 'T1', '0', 'fail']
      ],
      types: ['string', 'string', 'string', 'string', 'string']
    };
    const result = detectAndRealignHeaders(misaligned);
    expect(result.columns).toEqual(['Date', 'SN', 'Tester', 'Other', 'Last_time']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0][1]).toBe('A1');
  });

  it('handles header at row 7 (index 6) with junk rows above', () => {
    const junkRows: Array<Array<string | number | null>> = [];
    for (let i = 0; i < 6; i++) {
      junkRows.push([`junk-${i}`, null, null, null, null]);
    }
    const misaligned = {
      columns: ['Col1', 'Col2', 'Col3', 'Col4', 'Col5'],
      rows: [
        ...junkRows,
        ['Date', 'SN', 'Tester', 'Other', 'Result'],  // real header at index 6
        ['2024-06-01T12:00:00', 'B1', 'T2', '0', 'pass']
      ],
      types: ['string', 'string', 'string', 'string', 'string']
    };
    const result = detectAndRealignHeaders(misaligned);
    expect(result.columns).toEqual(['Date', 'SN', 'Tester', 'Other', 'Result']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0][0]).toBe('2024-06-01T12:00:00');
  });

  it('builds valid state from realigned data', () => {
    const misaligned = {
      columns: ['X', 'Y', 'Z', 'W', 'V'],
      rows: [
        ['info', null, null, null, null],
        ['Date', 'SN', 'Tester', 'Other', 'Last_time'],
        ['2024-05-01T12:00:00', 'A1', 'T1', '0', 'pass']
      ],
      types: ['string', 'string', 'string', 'string', 'string']
    };
    const realigned = detectAndRealignHeaders(misaligned);
    const state = buildState(realigned);
    expect(state.rows).toHaveLength(1);
    expect(state.mapping.sn).toBe(1);
    expect(state.mapping.tester).toBe(2);
  });
});

describe('3-month data cap', () => {
  it('trims rows older than 3 months from the most recent date', () => {
    const rows: Array<Array<string | number | null>> = [];
    // Create rows spanning 6 months back from a fixed date
    for (let m = 0; m < 6; m++) {
      const date = new Date(2025, 5 - m, 15);  // June 2025 back to Jan 2025
      rows.push([date.toISOString(), `SN-${m}`, 'T1', '0', 'pass']);
    }
    const result = {
      columns: ['Date', 'SN', 'Tester', 'Other', 'Last_time'],
      rows,
      types: ['datetime', 'string', 'string', 'string', 'string']
    };
    const state = buildState(result);
    // Most recent is June 15. 3 months back = ~March 15.
    // So Jan 15 and Feb 15 should be trimmed.
    // Remaining: June, May, April, March = 4 rows
    expect(state.rows.length).toBe(4);
    // Oldest remaining should be March
    const oldest = state.rows.reduce((min, r) => (r.date < min.date ? r : min), state.rows[0]);
    expect(oldest.date.getMonth()).toBe(2); // March = 2
  });
});

describe('sampleData', () => {
  it('generates valid FetchResult that buildState can parse', () => {
    const { generateSampleData } = require('@/lib/sampleData');
    const sample = generateSampleData();
    expect(sample.columns.length).toBeGreaterThan(0);
    expect(sample.rows.length).toBeGreaterThan(0);
    const state = buildState(sample);
    expect(state.rows.length).toBeGreaterThan(0);
    expect(state.mapping.sn).toBeDefined();
    expect(state.mapping.tester).toBeDefined();
  });
});
