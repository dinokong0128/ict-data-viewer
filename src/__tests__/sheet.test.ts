import {
  buildErrorCounts,
  buildState,
  buildSummary,
  buildUtilization,
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
    expect(date!.getFullYear()).toBe(2025);
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
    expect(state.rows[0].date.getFullYear()).toBe(2025);
  });

  it('builds utilization data', () => {
    const state = buildState(sampleResult);
    const util = buildUtilization(state.rows, state.mapping.tester);
    expect(util).toHaveLength(1);
    expect(util[0].tester).toBe('T1');
    expect(util[0].count).toBe(2);
  });
});
