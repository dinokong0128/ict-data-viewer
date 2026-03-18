# AI Chat Design

Design notes for implementing **F1 — AI-powered chat** in the ICT Data Viewer.

This file is intended to give a future coding agent enough context to implement the feature safely without defaulting to an unsafe “LLM writes arbitrary SQL against the whole schema” approach.

---

## Goal

Provide a natural-language analytics interface for ICT data.

Engineers should be able to ask questions like:
- "What are the top 5 error types in the last 7 days?"
- "Which tester had the highest fail count yesterday?"
- "Show fail trend by day for product X over the last 2 weeks"
- "How many boards failed on fixture F12 today?"
- "What are the most common failures for operator 102059 this month?"

The assistant should:
- interpret the question
- translate it into a constrained analytics plan
- execute a safe read-only query
- answer only from the returned results
- expose enough debug detail for engineers to trust the output

The assistant should **not**:
- modify data
- browse the codebase
- act as a general-purpose agent
- generate arbitrary unvalidated SQL directly against the entire schema

---

## High-level architecture

Preferred pipeline:

1. User asks a natural-language question in the UI
2. `POST /api/chat` receives `{ question }`
3. Server sends the question + semantic-layer description to the LLM
4. LLM returns **structured JSON only** as a `ChatQueryPlan`
5. Server validates the plan
6. Server compiles the plan into SQL
7. Server validates the compiled SQL again
8. Server executes the SQL using a **read-only** database path/role
9. Server sends `{ question, plan, sql, rows }` to the LLM for a grounded answer
10. UI renders:
   - answer
   - optional visualization
   - expandable SQL/debug drawer

Fallback architecture (less preferred):
- LLM generates SQL directly, but only if strict validator/guardrails are in place

Preferred order of trust:
- natural language → structured plan → server-generated SQL → grounded answer

---

## Why the semantic layer exists

Do not expose only the raw DB schema and ask the model to "figure it out."

That tends to produce:
- brittle joins
- bad assumptions
- over-broad queries
- hard-to-debug prompts
- unsafe query generation

Instead, define a smaller **semantic layer** that represents the analytics concepts users actually ask about.

Examples of concepts:
- total tests
- fail count
- pass count
- fail rate
- top error types
- top failing fixtures
- trend over time
- compare testers
- lookup board / serial history

The model should think in these concepts first, not in arbitrary SQL fragments.

---

## Proposed implementation modules

- `src/app/api/chat/route.ts`
  - request handling
  - auth / role gating
  - orchestration

- `src/lib/ai/chat-plan.ts`
  - `ChatQueryPlan` type
  - prompt template for plan generation
  - semantic-layer description
  - parser for model JSON output

- `src/lib/ai/sql-compiler.ts`
  - plan → SQL compiler
  - centralized query-shape logic

- `src/lib/ai/sql-guard.ts`
  - SQL validation / guardrails
  - row limits / statement restrictions

- `src/lib/ai/chat-answer.ts`
  - grounded answer prompt
  - output shaping for UI

- `src/lib/ai/chat-provider.ts`
  - provider abstraction
  - allow OpenAI or Anthropic behind one interface

- `src/lib/ai/chat-audit.ts` (optional)
  - structured logging for question, plan, SQL, duration, warnings, failures

---

## Proposed `ChatQueryPlan` type

This is a conceptual shape, not final code:

```ts
export type ChatIntent =
  | 'summary'
  | 'trend'
  | 'top_n'
  | 'compare'
  | 'lookup';

export type VisualizationHint =
  | 'none'
  | 'table'
  | 'line'
  | 'bar'
  | 'range_summary';

export interface ChatFilter {
  field:
    | 'product'
    | 'tester'
    | 'fixture'
    | 'operator'
    | 'result'
    | 'error_type'
    | 'serial_number'
    | 'date';
  operator: 'eq' | 'in' | 'contains' | 'gte' | 'lte' | 'between';
  value: string | number | Array<string | number> | { from?: string; to?: string };
}

export interface ChatMetric {
  name:
    | 'test_count'
    | 'fail_count'
    | 'pass_count'
    | 'fail_rate'
    | 'error_count';
}

export interface ChatSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ChatQueryPlan {
  intent: ChatIntent;
  metrics: ChatMetric[];
  dimensions: string[];
  filters: ChatFilter[];
  timeRange?: {
    preset?: 'today' | 'yesterday' | 'last_7_days' | 'last_14_days' | 'last_30_days' | 'this_month';
    from?: string;
    to?: string;
  };
  sort?: ChatSort[];
  limit?: number;
  visualizationHint: VisualizationHint;
  ambiguities: string[];
}
```

Important:
- keep the type narrow
- prefer enums / allowlists over free-form strings
- reduce the number of states the compiler must handle

---

## Semantic layer draft

The actual physical schema may evolve, but the semantic layer should remain stable.

### Core business entities

- **Product**
  - product / part number / product name
- **Board**
  - serial number
  - board identity and metadata
- **Test session**
  - start time
  - end time
  - result (pass/fail)
  - tester
  - fixture
  - operator
  - source file
- **Test error**
  - error type
  - location
  - subtest
  - measured / nominal / high / low / threshold

### Approved dimensions

Start with a small allowlist:
- `date`
- `day`
- `week`
- `month`
- `product`
- `tester`
- `fixture`
- `operator`
- `result`
- `error_type`
- `serial_number`

### Approved metrics

Start with:
- `test_count`
- `pass_count`
- `fail_count`
- `fail_rate`
- `error_count`

### Approved query shapes

The first implementation only needs a few templates:

1. **Summary**
   - example: "How many failures today?"
   - returns one row / one aggregate

2. **Top N**
   - example: "Top 5 error types this week"
   - group by one dimension, sort descending by one metric, cap with limit

3. **Trend**
   - example: "Fail trend by day for product A over last 14 days"
   - group by time bucket + optional dimension

4. **Compare**
   - example: "Compare fail count by tester yesterday"
   - group by one dimension, no time bucket required

5. **Lookup**
   - example: "Show recent history for serial number XYZ"
   - filter by unique identity and return recent rows

Do **not** attempt full arbitrary analytical SQL in v1.

---

## Example question → plan mappings

### Example 1
Question:
> What are the top 5 error types in the last 7 days?

Possible plan:

```json
{
  "intent": "top_n",
  "metrics": [{ "name": "error_count" }],
  "dimensions": ["error_type"],
  "filters": [],
  "timeRange": { "preset": "last_7_days" },
  "sort": [{ "field": "error_count", "direction": "desc" }],
  "limit": 5,
  "visualizationHint": "bar",
  "ambiguities": []
}
```

### Example 2
Question:
> Which tester had the highest fail count yesterday?

Possible plan:

```json
{
  "intent": "top_n",
  "metrics": [{ "name": "fail_count" }],
  "dimensions": ["tester"],
  "filters": [{ "field": "result", "operator": "eq", "value": "fail" }],
  "timeRange": { "preset": "yesterday" },
  "sort": [{ "field": "fail_count", "direction": "desc" }],
  "limit": 1,
  "visualizationHint": "table",
  "ambiguities": []
}
```

### Example 3
Question:
> Show fail trend by day for product X over the last 2 weeks.

Possible plan:

```json
{
  "intent": "trend",
  "metrics": [{ "name": "fail_count" }],
  "dimensions": ["day"],
  "filters": [
    { "field": "product", "operator": "eq", "value": "X" },
    { "field": "result", "operator": "eq", "value": "fail" }
  ],
  "timeRange": { "preset": "last_14_days" },
  "sort": [{ "field": "day", "direction": "asc" }],
  "limit": 100,
  "visualizationHint": "line",
  "ambiguities": []
}
```

### Example 4
Question:
> Show recent history for serial number ABC123.

Possible plan:

```json
{
  "intent": "lookup",
  "metrics": [],
  "dimensions": ["serial_number", "date", "result", "tester", "fixture"],
  "filters": [
    { "field": "serial_number", "operator": "eq", "value": "ABC123" }
  ],
  "sort": [{ "field": "date", "direction": "desc" }],
  "limit": 20,
  "visualizationHint": "table",
  "ambiguities": []
}
```

---

## SQL compilation strategy

Prefer **server-generated SQL** from a validated plan.

That means:
- one compiler function per query shape
- explicit mapping from semantic fields to physical columns / joins
- no free-form SQL from the model unless it is a deliberate fallback path

Example compiler responsibilities:
- resolve which tables are needed
- resolve join path
- map metrics to SQL aggregates
- map dimensions to select/group by expressions
- apply time filters
- apply sort + limit
- enforce caps

This is easier to test than prompting the model to generate raw SQL.

---

## SQL guardrails

Even if SQL is compiled server-side, still validate the final SQL before execution.

Minimum guardrails:
- exactly one statement
- must start with `SELECT`
- disallow `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`
- disallow comments if you want a simpler parser surface
- enforce max row limit
- enforce timeout
- reject unknown tables / views if relevant
- reject unknown columns if relevant

Recommended:
- include a server-side hard cap even if the plan says `limit: 1000`
- return warnings when truncation occurs

---

## Read-only database access

The chat feature must **not** use `SUPABASE_SERVICE_KEY`.

Use a dedicated read-only database path/role for chat queries.

Principles:
- read-only only
- no schema mutation privileges
- no write privileges
- ideally only allow access to approved views/tables

Even if the rest of the app uses broader privileges elsewhere, F1 should be isolated.

---

## Grounded answer generation

The second LLM pass should answer only from:
- original user question
- validated query plan
- final SQL
- actual rows returned

Prompt rules should include:
- do not invent data not present in rows
- say when result is empty
- say when query was truncated
- say when the question was ambiguous
- keep answer concise and factual

The answer step should not change the query or infer extra unseen metrics.

---

## UI behavior

### Placement
- Chat input visible only to `ict-manager` and `ict-admin`
- Answer displayed between graph and detail table
- Expandable debug drawer below answer

### Debug drawer contents
- generated SQL
- row count
- duration
- whether results were truncated
- warnings / ambiguity notes

### Visualization behavior
Use `visualizationHint` to decide whether to show:
- no chart
- table
- line chart
- bar chart
- range summary

V1 can keep this simple:
- line for trends
- bar for top-N comparisons
- table for lookups

---

## Error handling expectations

Return structured errors/warnings for cases like:
- invalid or unparseable model JSON
- unsupported query shape
- ambiguous question
- unsafe SQL rejected
- query timeout
- empty result set
- provider API failure

UI should distinguish between:
- user-fixable issues
- system issues

Examples:
- "I could not determine which product you meant."
- "This question is broader than the supported query types right now."
- "The generated query was rejected by safety checks."

---

## Provider abstraction

Do not hard-code the implementation to one model vendor.

Create a thin provider interface, for example:
- `generatePlan(question, context)`
- `generateAnswer(question, plan, sql, rows)`

Backends may be:
- OpenAI
- Anthropic

This keeps F1 architecture stable even if providers change later.

---

## Suggested first milestone

Implement only these supported question categories in v1:
- total pass/fail counts over a time range
- top N error types
- compare fail count by tester / fixture / product
- fail trend by day
- serial number lookup history

Reject everything else clearly.

This is better than pretending to support arbitrary analytics and returning low-trust results.

---

## Testing strategy

### Unit tests
- plan JSON parsing
- plan validation
- SQL compilation per query shape
- SQL guardrails
- prompt helpers

### Integration tests
- end-to-end `POST /api/chat` with mocked provider
- validate returned SQL / rows / answer shape
- ensure unsafe SQL never executes

### Golden tests
Maintain a small set of example questions and expected plans/SQL outputs.
This will make prompt regressions visible.

---

## Non-goals for v1

- arbitrary free-form BI tool
- write actions
- multi-step autonomous agent behavior
- cross-source joins beyond the approved ICT analytics scope
- unlimited historical querying without guardrails

---

## Implementation note for future coding agents

Do not start implementation by asking the LLM to write SQL against the full schema.

Instead:
1. define the semantic layer
2. define `ChatQueryPlan`
3. build plan validation
4. build SQL compiler
5. add SQL guardrails
6. add provider abstraction
7. add grounded answer generation
8. wire into UI

The hard part of this feature is not calling the model API. The hard part is keeping the system safe, predictable, and inspectable.
