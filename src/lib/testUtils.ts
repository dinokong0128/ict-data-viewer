/**
 * testUtils.ts — shared types and analytics helpers for ICT test data.
 *
 * Used by:
 *   - src/app/api/tests/route.ts  (produces TestRecord[])
 *   - src/pages/index.tsx          (consumes TestRecord[])
 */

export type TestErrorRecord = {
  error_type: string;
  location: string;
  subtest: string | null;
  part_spec: string;
  unit: string;
  measured_raw: string;
  threshold_raw: string | null;
};

export type TestRecord = {
  id: number;
  board_id: string;      // = serial_number (FK to boards)
  start_time: string;    // ISO 8601
  end_time: string;      // ISO 8601
  result: 'PASS' | 'FAIL';
  operator_id: string;
  fixture_id: string;
  tester: string;
  source_file: string;
  // from boards join:
  serial_number: string;
  mac_address: string;
  rev: string;
  product_id: string;
  // from products join:
  product_name: string;
  part_number: string;
  // from test_errors join:
  test_errors: TestErrorRecord[];
};

export type UtilizationEntry = {
  tester: string;
  count: number;
  days: number;
  perDay: number;
};

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDateKey(r: TestRecord): string {
  return r.start_time.slice(0, 10);
}

export function filterByRange(records: TestRecord[], start: Date, end: Date): TestRecord[] {
  return records.filter((r) => {
    const t = new Date(r.start_time).getTime();
    return t >= start.getTime() && t <= end.getTime();
  });
}

export function groupByDate(records: TestRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  records.forEach((r) => {
    const key = getDateKey(r);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

export function buildSummary(records: TestRecord[]): string[] {
  const uniqueBoards = new Set(records.map((r) => r.serial_number));
  const passCount = records.filter((r) => r.result === 'PASS').length;
  const failCount = records.filter((r) => r.result === 'FAIL').length;

  const errorCounts: Record<string, number> = {};
  records.forEach((r) => {
    r.test_errors.forEach((e) => {
      errorCounts[e.location] = (errorCounts[e.location] ?? 0) + 1;
    });
  });
  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([loc, count]) => `${loc} (${count})`);

  return [
    `Total tests: ${records.length}`,
    `Unique boards: ${uniqueBoards.size}`,
    `Pass: ${passCount} | Fail: ${failCount}`,
    `Top errors: ${topErrors.length ? topErrors.join(', ') : 'None'}`,
  ];
}

export function buildErrorCounts(records: TestRecord[]): {
  errors: string[];
  counts: Map<string, number>;
} {
  const allErrors = new Set<string>();
  const counts = new Map<string, number>();
  records.forEach((r) => {
    r.test_errors.forEach((e) => {
      allErrors.add(e.location);
      const key = `${getDateKey(r)}::${e.location}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });
  return { errors: Array.from(allErrors).sort(), counts };
}

export function buildUtilization(records: TestRecord[]): UtilizationEntry[] {
  const testerDays: Record<string, Set<string>> = {};
  const testerCounts: Record<string, number> = {};
  records.forEach((r) => {
    const t = r.tester.trim();
    if (!t) return;
    testerCounts[t] = (testerCounts[t] ?? 0) + 1;
    if (!testerDays[t]) testerDays[t] = new Set();
    testerDays[t].add(getDateKey(r));
  });
  return Object.entries(testerCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tester, count]) => {
      const days = testerDays[tester].size;
      return { tester, count, days, perDay: Math.round(count / days) };
    });
}

/** Returns sorted unique values for a category field, descending by frequency. */
export function getCategoryOptions(
  records: TestRecord[],
  field: 'tester' | 'fixture_id' | 'operator_id',
): string[] {
  const counts: Record<string, number> = {};
  records.forEach((r) => {
    const v = r[field].trim();
    if (v) counts[v] = (counts[v] ?? 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v);
}
