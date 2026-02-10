import type { FetchResult } from './sheet';

/**
 * Redacted sample data for development and demo mode.
 * Structure mirrors a real Google Sheets gviz FetchResult.
 * Dates span a ~2-week window so default range filters show data.
 */
export function generateSampleData(): FetchResult {
  const now = new Date();
  const rows: Array<Array<string | number | null>> = [];

  const testers = ['Tester-A', 'Tester-B', 'Tester-C'];
  const fixtures = ['FIX-01', 'FIX-02', 'FIX-03'];
  const operators = ['Op-1', 'Op-2'];
  const families = ['FAM-X', 'FAM-Y'];
  const errorSets = ['0', 'ERR_OPEN & ERR_SHORT', 'ERR_CAPACITOR', 'ERR_VOLTAGE & ERR_OPEN', '0', '0'];

  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    const iso = date.toISOString();

    // Generate 3-8 rows per day
    const rowCount = 3 + Math.floor((dayOffset * 7 + 3) % 6);
    for (let i = 0; i < rowCount; i++) {
      const sn = `SN-${String(1000 + dayOffset * 10 + i).padStart(5, '0')}`;
      const tester = testers[(dayOffset + i) % testers.length];
      const fixture = fixtures[(dayOffset + i) % fixtures.length];
      const operator = operators[(dayOffset + i) % operators.length];
      const family = families[(dayOffset + i) % families.length];
      const errors = errorSets[(dayOffset + i) % errorSets.length];
      const result = errors === '0' ? 'pass' : (i % 3 === 0 ? 'fail' : 'pass');
      rows.push([iso, sn, 'AA:BB:CC:DD:EE:FF', family, `PN-${(dayOffset % 3) + 1}`, tester, operator, fixture, errors, result]);
    }
  }

  return {
    columns: ['Date', 'SN', 'MAC', 'Family', 'PN', 'Tester', 'Operator', 'Fixture', 'Other', 'Result'],
    rows,
    types: ['datetime', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string', 'string']
  };
}
