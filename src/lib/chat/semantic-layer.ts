// Semantic field → physical SQL expression
export const FIELD_MAP: Record<string, string> = {
  product:       'products.product_name',
  tester:        'tests.tester',
  fixture:       'tests.fixture_id',
  operator:      'tests.operator_id',
  serial_number: 'boards.serial_number',
  error_type:    'test_errors.error_type',
  result:        'tests.result',
  date:          'tests.start_time::date',
  day:           'tests.start_time::date',
  week:          "date_trunc('week', tests.start_time)",
  month:         "date_trunc('month', tests.start_time)",
};

// Metric name → SQL aggregate expression
export const METRIC_MAP: Record<string, string> = {
  test_count:  'COUNT(*)',
  pass_count:  "COUNT(*) FILTER (WHERE tests.result = 'pass')",
  fail_count:  "COUNT(*) FILTER (WHERE tests.result = 'fail')",
  fail_rate:   "COUNT(*) FILTER (WHERE tests.result = 'fail')::float / NULLIF(COUNT(*), 0)",
  error_count: 'COUNT(test_errors.id)',
};

// Approved dimensions (used for validation)
export const APPROVED_DIMENSIONS = new Set(Object.keys(FIELD_MAP));

// Approved metrics (used for validation)
export const APPROVED_METRICS = new Set(Object.keys(METRIC_MAP));

// Row cap enforced server-side
export const MAX_ROWS = 200;

// Query timeout in ms
export const QUERY_TIMEOUT_MS = 15000;
