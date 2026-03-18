/**
 * @jest-environment node
 */
import {
  FIELD_MAP,
  METRIC_MAP,
  APPROVED_DIMENSIONS,
  APPROVED_METRICS,
  MAX_ROWS,
  QUERY_TIMEOUT_MS,
} from '../semantic-layer';

describe('FIELD_MAP', () => {
  const expectedFields = [
    'product',
    'tester',
    'fixture',
    'operator',
    'serial_number',
    'error_type',
    'result',
    'date',
    'day',
    'week',
    'month',
  ];

  it.each(expectedFields)('contains key "%s"', (key) => {
    expect(FIELD_MAP).toHaveProperty(key);
    expect(typeof FIELD_MAP[key]).toBe('string');
    expect(FIELD_MAP[key].length).toBeGreaterThan(0);
  });

  it('maps product to products.product_name', () => {
    expect(FIELD_MAP.product).toBe('products.product_name');
  });

  it('maps tester to tests.tester', () => {
    expect(FIELD_MAP.tester).toBe('tests.tester');
  });

  it('maps fixture to tests.fixture_id', () => {
    expect(FIELD_MAP.fixture).toBe('tests.fixture_id');
  });

  it('maps serial_number to boards.serial_number', () => {
    expect(FIELD_MAP.serial_number).toBe('boards.serial_number');
  });

  it('maps date and day to start_time::date cast', () => {
    expect(FIELD_MAP.date).toBe('tests.start_time::date');
    expect(FIELD_MAP.day).toBe('tests.start_time::date');
  });
});

describe('METRIC_MAP', () => {
  const expectedMetrics = [
    'test_count',
    'pass_count',
    'fail_count',
    'fail_rate',
    'error_count',
  ];

  it.each(expectedMetrics)('contains key "%s"', (key) => {
    expect(METRIC_MAP).toHaveProperty(key);
    expect(typeof METRIC_MAP[key]).toBe('string');
    expect(METRIC_MAP[key].length).toBeGreaterThan(0);
  });

  it('test_count maps to COUNT(*)', () => {
    expect(METRIC_MAP.test_count).toBe('COUNT(*)');
  });

  it('fail_rate uses NULLIF to guard against division by zero', () => {
    expect(METRIC_MAP.fail_rate).toContain('NULLIF');
  });
});

describe('APPROVED_DIMENSIONS', () => {
  it('contains all keys from FIELD_MAP', () => {
    for (const key of Object.keys(FIELD_MAP)) {
      expect(APPROVED_DIMENSIONS.has(key)).toBe(true);
    }
  });
});

describe('APPROVED_METRICS', () => {
  it('contains all keys from METRIC_MAP', () => {
    for (const key of Object.keys(METRIC_MAP)) {
      expect(APPROVED_METRICS.has(key)).toBe(true);
    }
  });
});

describe('constants', () => {
  it('MAX_ROWS is defined and is a positive integer', () => {
    expect(MAX_ROWS).toBeDefined();
    expect(typeof MAX_ROWS).toBe('number');
    expect(Number.isInteger(MAX_ROWS)).toBe(true);
    expect(MAX_ROWS).toBeGreaterThan(0);
  });

  it('MAX_ROWS is 200', () => {
    expect(MAX_ROWS).toBe(200);
  });

  it('QUERY_TIMEOUT_MS is defined and is a positive number', () => {
    expect(QUERY_TIMEOUT_MS).toBeDefined();
    expect(typeof QUERY_TIMEOUT_MS).toBe('number');
    expect(QUERY_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('QUERY_TIMEOUT_MS is 15000', () => {
    expect(QUERY_TIMEOUT_MS).toBe(15000);
  });
});
