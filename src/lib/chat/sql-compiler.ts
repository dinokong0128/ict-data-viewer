import type { ChatQueryPlan, ChatFilter } from './types';
import { FIELD_MAP, METRIC_MAP, MAX_ROWS } from './semantic-layer';

// Standard join chain — always the same
const BASE_FROM = `FROM tests
JOIN boards ON boards.id = tests.board_id
JOIN products ON products.id = boards.product_id
LEFT JOIN test_errors ON test_errors.test_id = tests.id`;

function compileTimeRange(timeRange: NonNullable<ChatQueryPlan['timeRange']>): string {
  if (timeRange.preset) {
    switch (timeRange.preset) {
      case 'today':
        return "tests.start_time::date = CURRENT_DATE";
      case 'yesterday':
        return "tests.start_time::date = CURRENT_DATE - 1";
      case 'last_7_days':
        return "tests.start_time >= now() - interval '7 days'";
      case 'last_14_days':
        return "tests.start_time >= now() - interval '14 days'";
      case 'last_30_days':
        return "tests.start_time >= now() - interval '30 days'";
      case 'this_month':
        return "tests.start_time >= date_trunc('month', now())";
      default: {
        const exhaustive: never = timeRange.preset;
        throw new Error(`Unsupported timeRange preset: "${exhaustive as string}"`);
      }
    }
  }

  if (timeRange.from || timeRange.to) {
    const parts: string[] = [];
    if (timeRange.from) parts.push(`tests.start_time >= '${sanitizeDateLiteral(timeRange.from)}'`);
    if (timeRange.to) parts.push(`tests.start_time <= '${sanitizeDateLiteral(timeRange.to)}'`);
    return parts.join(' AND ');
  }

  throw new Error('timeRange must have either preset or from/to');
}

// Allow only date strings matching YYYY-MM-DD (optionally with time component)
function sanitizeDateLiteral(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/.test(value)) {
    throw new Error(`Invalid date literal: "${value}"`);
  }
  return value;
}

// Sanitize a scalar filter value for safe embedding in SQL
function sanitizeScalar(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Filter value must be a finite number');
    return String(value);
  }
  // Escape single quotes in strings to prevent SQL injection
  return `'${value.replace(/'/g, "''")}'`;
}

function compileFilter(filter: ChatFilter): string {
  const column = FIELD_MAP[filter.field];
  if (!column) throw new Error(`Unknown filter field: "${filter.field}"`);

  switch (filter.operator) {
    case 'eq': {
      const v = filter.value as string | number;
      return `${column} = ${sanitizeScalar(v)}`;
    }
    case 'in': {
      const values = filter.value as Array<string | number>;
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error(`Filter "in" requires a non-empty array`);
      }
      const list = values.map(sanitizeScalar).join(', ');
      return `${column} IN (${list})`;
    }
    case 'contains': {
      const v = filter.value as string;
      const escaped = v.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
      return `${column} ILIKE '%${escaped}%' ESCAPE '\\'`;
    }
    case 'gte': {
      const v = filter.value as string | number;
      return `${column} >= ${sanitizeScalar(v)}`;
    }
    case 'lte': {
      const v = filter.value as string | number;
      return `${column} <= ${sanitizeScalar(v)}`;
    }
    case 'between': {
      const range = filter.value as { from?: string; to?: string };
      const parts: string[] = [];
      if (range.from) parts.push(`${column} >= ${sanitizeScalar(range.from)}`);
      if (range.to) parts.push(`${column} <= ${sanitizeScalar(range.to)}`);
      if (parts.length === 0) throw new Error('between filter requires from or to');
      return parts.join(' AND ');
    }
    default: {
      const exhaustive: never = filter.operator;
      throw new Error(`Unsupported filter operator: "${exhaustive as string}"`);
    }
  }
}

export function compilePlan(plan: ChatQueryPlan): string {
  const selectParts: string[] = [];
  const groupByParts: string[] = [];
  const orderByParts: string[] = [];
  const whereParts: string[] = [];

  // Dimensions go first in SELECT and GROUP BY
  for (const dim of plan.dimensions) {
    const col = FIELD_MAP[dim];
    if (!col) throw new Error(`Unknown dimension: "${dim}"`);
    selectParts.push(`${col} AS ${dim}`);
    groupByParts.push(col);
  }

  // Metrics
  for (const metric of plan.metrics) {
    const expr = METRIC_MAP[metric.name];
    if (!expr) throw new Error(`Unknown metric: "${metric.name}"`);
    selectParts.push(`${expr} AS ${metric.name}`);
  }

  if (selectParts.length === 0) {
    throw new Error('Plan produces no SELECT columns');
  }

  // Filters
  for (const filter of plan.filters) {
    whereParts.push(compileFilter(filter));
  }

  // Time range
  if (plan.timeRange) {
    whereParts.push(compileTimeRange(plan.timeRange));
  }

  // Sort — only sort by fields that appear in the SELECT (dimensions or metric names)
  if (plan.sort && plan.sort.length > 0) {
    const allowedSortFields = new Set([
      ...plan.dimensions,
      ...plan.metrics.map((m) => m.name),
    ]);
    for (const s of plan.sort) {
      if (!allowedSortFields.has(s.field)) {
        throw new Error(`Sort field "${s.field}" not in SELECT list`);
      }
      const dir = s.direction === 'asc' ? 'ASC' : 'DESC';
      orderByParts.push(`${s.field} ${dir}`);
    }
  }

  // Cap limit at MAX_ROWS
  const limit = Math.min(plan.limit ?? MAX_ROWS, MAX_ROWS);

  // Assemble the query
  const parts: string[] = [];
  parts.push(`SELECT ${selectParts.join(', ')}`);
  parts.push(BASE_FROM);
  if (whereParts.length > 0) parts.push(`WHERE ${whereParts.join(' AND ')}`);
  if (groupByParts.length > 0) parts.push(`GROUP BY ${groupByParts.join(', ')}`);
  if (orderByParts.length > 0) parts.push(`ORDER BY ${orderByParts.join(', ')}`);
  parts.push(`LIMIT ${limit}`);

  const sql = parts.join('\n');

  // Final sanity check: must start with SELECT
  if (!/^SELECT\b/i.test(sql.trimStart())) {
    throw new Error('Compiled SQL does not start with SELECT — aborting');
  }

  return sql;
}
