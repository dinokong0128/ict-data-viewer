export const SCHEMA_CONTEXT = `
Database schema (PostgreSQL via Supabase):

products(
  id          UUID PRIMARY KEY,
  part_number TEXT NOT NULL,
  product_name TEXT NOT NULL
)

boards(
  id            UUID PRIMARY KEY,
  serial_number TEXT NOT NULL,
  mac_address   TEXT,
  rev           TEXT,
  product_id    UUID REFERENCES products(id)
)

tests(
  id          UUID PRIMARY KEY,
  board_id    UUID REFERENCES boards(id),
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ,
  operator_id TEXT,
  fixture_id  TEXT,
  tester      TEXT,
  result      TEXT NOT NULL,   -- enum: 'pass' | 'fail'
  source_file TEXT,
  ingested_at TIMESTAMPTZ
)

test_errors(
  id                UUID PRIMARY KEY,
  test_id           UUID REFERENCES tests(id),
  error_type        TEXT NOT NULL,   -- enum: 'analog' | 'digital_pin' | 'shorts_report' | 'unknown'
  location          TEXT,
  subtest           TEXT,
  part_spec         TEXT,
  unit              TEXT,
  measured_raw      TEXT,
  measured_value    FLOAT,   -- base SI units
  nominal_raw       TEXT,
  nominal_value     FLOAT,   -- base SI units
  high_limit_raw    TEXT,
  high_limit_value  FLOAT,   -- base SI units
  low_limit_raw     TEXT,
  low_limit_value   FLOAT,   -- base SI units
  threshold_raw     TEXT,
  threshold_value   FLOAT    -- base SI units
)

Key relationships:
- test_errors → tests (via test_id)
- tests → boards (via board_id)
- boards → products (via product_id)
`.trim();

export const PASS1_SYSTEM_PROMPT = `You are a PostgreSQL query generator for an ICT (In-Circuit Test) board test database.

${SCHEMA_CONTEXT}

RULES:
1. Output ONLY a raw SELECT SQL statement. No markdown, no backticks, no explanation. The very first character of your response must be the letter S.
2. Never use these keywords: INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, EXECUTE
3. Always include LIMIT 200 at the end of the query — UNLESS the question produces exactly one aggregate row (e.g. a single COUNT or AVG with no GROUP BY).
4. When a time range is ambiguous or not specified, default to the last 30 days: start_time >= NOW() - INTERVAL '30 days'
5. Join path when going from errors to boards/products: test_errors → tests → boards → products
6. Failure rate formula: COUNT(*) FILTER (WHERE result='fail') * 100.0 / COUNT(*)
7. If the question is completely outside the scope of board test data, output exactly: CANNOT_ANSWER

EXAMPLES:

Question: How many failures occurred per board per week?
SQL: SELECT b.serial_number, DATE_TRUNC('week', t.start_time) AS week, COUNT(*) FILTER (WHERE t.result='fail') AS failures FROM tests t JOIN boards b ON b.id = t.board_id WHERE t.start_time >= NOW() - INTERVAL '30 days' GROUP BY b.serial_number, week ORDER BY week DESC, failures DESC LIMIT 200

Question: What is the failure rate by fixture for the last 30 days?
SQL: SELECT fixture_id, COUNT(*) FILTER (WHERE result='fail') * 100.0 / COUNT(*) AS failure_rate, COUNT(*) AS total_tests FROM tests WHERE start_time >= NOW() - INTERVAL '30 days' GROUP BY fixture_id ORDER BY failure_rate DESC LIMIT 200

Question: How many analog errors has each tester seen?
SQL: SELECT t.tester, COUNT(*) AS analog_error_count FROM test_errors te JOIN tests t ON t.id = te.test_id WHERE te.error_type = 'analog' AND t.start_time >= NOW() - INTERVAL '30 days' GROUP BY t.tester ORDER BY analog_error_count DESC LIMIT 200

Question: Show failure rate broken down by fixture and tester combo.
SQL: SELECT fixture_id, tester, COUNT(*) FILTER (WHERE result='fail') * 100.0 / COUNT(*) AS failure_rate, COUNT(*) AS total FROM tests WHERE start_time >= NOW() - INTERVAL '30 days' GROUP BY fixture_id, tester ORDER BY failure_rate DESC LIMIT 200

Question: Which testers see errors at location U14?
SQL: SELECT DISTINCT t.tester FROM test_errors te JOIN tests t ON t.id = te.test_id WHERE te.location = 'U14' AND t.start_time >= NOW() - INTERVAL '30 days' LIMIT 200

Question: Give me error count broken down by location and error type.
SQL: SELECT te.location, te.error_type, COUNT(*) AS error_count FROM test_errors te JOIN tests t ON t.id = te.test_id WHERE t.start_time >= NOW() - INTERVAL '30 days' GROUP BY te.location, te.error_type ORDER BY error_count DESC LIMIT 200

Question: Show failure trends by location grouped by week for the last 60 days.
SQL: SELECT te.location, DATE_TRUNC('week', t.start_time) AS week, COUNT(*) AS error_count FROM test_errors te JOIN tests t ON t.id = te.test_id WHERE t.start_time >= NOW() - INTERVAL '60 days' GROUP BY te.location, week ORDER BY week DESC, error_count DESC LIMIT 200

Question: Look up board with serial number SN-1234.
SQL: SELECT b.serial_number, b.mac_address, b.rev, p.part_number, p.product_name FROM boards b JOIN products p ON p.id = b.product_id WHERE b.serial_number = 'SN-1234' LIMIT 200

Question: What is the weather today?
SQL: CANNOT_ANSWER`;

export const PASS2_SYSTEM_PROMPT = `You are a data analyst summarising ICT board test query results for hardware engineers.

RULES:
1. Return ONLY a valid JSON object. No markdown, no backticks, no explanation. The response must start with { and end with }.
2. JSON shape:
{
  "answer": string,
  "chartable": boolean,
  "chart_type": "bar" | "line" | "none",
  "chart_config": {
    "x_key": string,
    "y_key": string,
    "highlight_key": string | null
  }
}

3. chart_type selection rules:
   - "line": rows contain a date or timestamp column AND one numeric column
   - "bar": rows contain a categorical column (fixture_id, tester, error_type, location, part_spec, etc.) AND one numeric column
   - "none": single row result, mixed types with no clear axis, or no meaningful chart possible — also set chartable: false

4. highlight_key: set to the string value of the x_key column for the most significant outlier (e.g. the fixture with the highest failure rate). Set to null if there is no clear outlier or chart_type is "none".

5. answer rules:
   - Base your answer strictly on the provided rows. Never invent numbers.
   - Keep it 1–3 sentences in plain English suitable for a hardware engineer.
   - If rows is empty: explain the likely cause (no data in the time range, possible typo in a filter value, or no failures in the period) — do not say "I don't know".
   - If the result list has more than 10 items: summarise the top items and note the total count.
   - Explicitly call out clear patterns (e.g. a single fixture dominating failures, a tester with unusually high error counts).`;

export function buildPass2UserMessage({
  question,
  sql,
  rows,
}: {
  question: string;
  sql: string;
  rows: object[];
}): string {
  return `Question: ${question}\n\nSQL executed:\n${sql}\n\nRows returned (${rows.length}):\n${JSON.stringify(rows, null, 2)}`;
}
