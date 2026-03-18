/**
 * @jest-environment node
 */
import { compilePlan } from '../sql-compiler';
import type { ChatQueryPlan } from '../types';
import { MAX_ROWS } from '../semantic-layer';

function basePlan(overrides: Partial<ChatQueryPlan> = {}): ChatQueryPlan {
  return {
    intent: 'top_n',
    metrics: [{ name: 'fail_count' }],
    dimensions: ['fixture'],
    filters: [],
    timeRange: { preset: 'last_7_days' },
    sort: [{ field: 'fail_count', direction: 'desc' }],
    limit: 5,
    visualizationHint: 'bar',
    ambiguities: [],
    ...overrides,
  };
}

describe('compilePlan — top_n: fixture by fail_count', () => {
  let sql: string;

  beforeEach(() => {
    sql = compilePlan(basePlan());
  });

  it('starts with SELECT', () => {
    expect(sql.trimStart()).toMatch(/^SELECT\b/i);
  });

  it('includes fixture_id in SELECT aliased as fixture', () => {
    expect(sql).toContain('tests.fixture_id AS fixture');
  });

  it('includes fail_count aggregate in SELECT', () => {
    expect(sql).toContain("COUNT(*) FILTER (WHERE tests.result = 'fail') AS fail_count");
  });

  it('includes standard join chain', () => {
    expect(sql).toContain('JOIN boards ON boards.id = tests.board_id');
    expect(sql).toContain('JOIN products ON products.id = boards.product_id');
    expect(sql).toContain('LEFT JOIN test_errors ON test_errors.test_id = tests.id');
  });

  it('includes last_7_days time filter', () => {
    expect(sql).toContain("tests.start_time >= now() - interval '7 days'");
  });

  it('includes GROUP BY fixture_id', () => {
    expect(sql).toContain('GROUP BY tests.fixture_id');
  });

  it('includes ORDER BY fail_count DESC', () => {
    expect(sql).toContain('ORDER BY fail_count DESC');
  });

  it('includes LIMIT 5', () => {
    expect(sql).toContain('LIMIT 5');
  });
});

describe('compilePlan — trend: fail_rate by day', () => {
  let sql: string;

  beforeEach(() => {
    sql = compilePlan(
      basePlan({
        intent: 'trend',
        metrics: [{ name: 'fail_rate' }],
        dimensions: ['day'],
        timeRange: { preset: 'last_14_days' },
        sort: [{ field: 'day', direction: 'asc' }],
        limit: 14,
        visualizationHint: 'line',
      })
    );
  });

  it('includes start_time::date as day in SELECT', () => {
    expect(sql).toContain('tests.start_time::date AS day');
  });

  it('includes fail_rate aggregate with NULLIF guard', () => {
    expect(sql).toContain('fail_rate');
    expect(sql).toContain('NULLIF');
  });

  it('includes last_14_days interval filter', () => {
    expect(sql).toContain("interval '14 days'");
  });

  it('groups by date expression', () => {
    expect(sql).toContain('GROUP BY');
    expect(sql).toContain('start_time::date');
  });

  it('sorts by day ascending', () => {
    expect(sql).toContain('ORDER BY day ASC');
  });
});

describe('compilePlan — lookup: serial_number filter', () => {
  let sql: string;

  beforeEach(() => {
    sql = compilePlan(
      basePlan({
        intent: 'lookup',
        metrics: [{ name: 'test_count' }],
        dimensions: ['serial_number', 'date', 'result', 'tester'],
        filters: [{ field: 'serial_number', operator: 'eq', value: 'ABC123' }],
        timeRange: null,
        sort: [{ field: 'date', direction: 'desc' }],
        limit: 50,
        visualizationHint: 'table',
      })
    );
  });

  it('includes serial_number in SELECT', () => {
    expect(sql).toContain('boards.serial_number AS serial_number');
  });

  it('includes WHERE clause with serial_number filter', () => {
    expect(sql).toContain("WHERE");
    expect(sql).toContain("boards.serial_number = 'ABC123'");
  });

  it('does not include a time range clause (no timeRange)', () => {
    expect(sql).not.toContain('interval');
    expect(sql).not.toContain('CURRENT_DATE');
  });
});

describe('compilePlan — limit capping', () => {
  it('caps limit at MAX_ROWS when plan requests more', () => {
    const sql = compilePlan(basePlan({ limit: 500 }));
    expect(sql).toContain(`LIMIT ${MAX_ROWS}`);
    expect(sql).not.toContain('LIMIT 500');
  });

  it('caps limit at MAX_ROWS for very large values', () => {
    const sql = compilePlan(basePlan({ limit: 9999 }));
    expect(sql).toContain(`LIMIT ${MAX_ROWS}`);
  });

  it('uses MAX_ROWS when no limit specified', () => {
    const plan = basePlan();
    delete plan.limit;
    const sql = compilePlan(plan);
    expect(sql).toContain(`LIMIT ${MAX_ROWS}`);
  });
});

describe('compilePlan — time range presets', () => {
  it.each([
    ['today', 'CURRENT_DATE'],
    ['yesterday', 'CURRENT_DATE - 1'],
    ['last_7_days', "interval '7 days'"],
    ['last_14_days', "interval '14 days'"],
    ['last_30_days', "interval '30 days'"],
    ['this_month', "date_trunc('month', now())"],
  ] as const)('preset "%s" produces correct SQL fragment "%s"', (preset, expected) => {
    const sql = compilePlan(basePlan({ timeRange: { preset } }));
    expect(sql).toContain(expected);
  });
});

describe('compilePlan — filter operators', () => {
  it('eq operator produces column = value', () => {
    const sql = compilePlan(
      basePlan({ filters: [{ field: 'tester', operator: 'eq', value: 'T1' }], timeRange: null })
    );
    expect(sql).toContain("tests.tester = 'T1'");
  });

  it('in operator produces column IN (...)', () => {
    const sql = compilePlan(
      basePlan({
        filters: [{ field: 'tester', operator: 'in', value: ['T1', 'T2'] }],
        timeRange: null,
      })
    );
    expect(sql).toContain("tests.tester IN ('T1', 'T2')");
  });

  it('sanitizes single quotes in string filter values', () => {
    const sql = compilePlan(
      basePlan({
        filters: [{ field: 'tester', operator: 'eq', value: "O'Brien" }],
        timeRange: null,
      })
    );
    expect(sql).toContain("tests.tester = 'O''Brien'");
  });
});

describe('compilePlan — error cases', () => {
  it('throws on unknown dimension', () => {
    expect(() =>
      compilePlan(basePlan({ dimensions: ['nonexistent_field'] }))
    ).toThrow();
  });

  it('throws on unknown metric', () => {
    expect(() =>
      compilePlan(basePlan({ metrics: [{ name: 'revenue' as never }] }))
    ).toThrow();
  });
});
