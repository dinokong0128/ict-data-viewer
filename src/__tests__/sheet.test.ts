import {
  buildErrorCounts,
  buildState,
  buildSummary,
  filterRowsByRange,
  formatDate,
  groupByDate,
  inferColumn,
  normalize,
  parseErrors,
  parseGvizDate
} from '@/lib/sheet';

const sampleResult = {
  columns: ['Date', 'SN', 'Tester', 'Other', 'Last_time'],
  rows: [
    ['2024-05-01', 'A1', 'T1', 'E1&E2', 'pass'],
    ['2024-05-02', 'A2', 'T1', '0', 'fail']
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
    const start = new Date('2024-05-01');
    const end = new Date('2024-05-01T23:59:59');
    const filtered = filterRowsByRange(state.rows, start, end);
    expect(filtered).toHaveLength(1);
    const grouped = groupByDate(state.rows);
    expect(grouped.get(formatDate(new Date('2024-05-01')))).toBe(1);
  });

  it('builds error counts', () => {
    const state = buildState(sampleResult);
    const result = buildErrorCounts(state.rows);
    expect(result.errors).toEqual(['E1', 'E2']);
  });
});
