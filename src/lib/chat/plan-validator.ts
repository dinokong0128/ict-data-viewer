import type { ChatQueryPlan, ChatIntent, VisualizationHint } from './types';
import { APPROVED_DIMENSIONS, APPROVED_METRICS, MAX_ROWS } from './semantic-layer';

type ValidationResult = { valid: true } | { valid: false; reason: string };

const APPROVED_INTENTS = new Set<ChatIntent>([
  'summary',
  'trend',
  'top_n',
  'compare',
  'lookup',
]);

const APPROVED_HINTS = new Set<VisualizationHint>([
  'none',
  'table',
  'line',
  'bar',
]);

export function validatePlan(plan: ChatQueryPlan): ValidationResult {
  // intent must be one of the approved values
  if (!APPROVED_INTENTS.has(plan.intent)) {
    return { valid: false, reason: `Unknown intent: "${plan.intent}"` };
  }

  // metrics must be non-empty
  if (!Array.isArray(plan.metrics) || plan.metrics.length === 0) {
    return { valid: false, reason: 'Plan must include at least one metric' };
  }

  // all metric names must be in APPROVED_METRICS
  for (const metric of plan.metrics) {
    if (!APPROVED_METRICS.has(metric.name)) {
      return { valid: false, reason: `Unknown metric: "${metric.name}"` };
    }
  }

  // all dimensions must be in APPROVED_DIMENSIONS
  if (Array.isArray(plan.dimensions)) {
    for (const dim of plan.dimensions) {
      if (!APPROVED_DIMENSIONS.has(dim)) {
        return { valid: false, reason: `Unknown dimension: "${dim}"` };
      }
    }
  }

  // all filter.field values must be in APPROVED_DIMENSIONS
  if (Array.isArray(plan.filters)) {
    for (const filter of plan.filters) {
      if (!APPROVED_DIMENSIONS.has(filter.field)) {
        return { valid: false, reason: `Unknown filter field: "${filter.field}"` };
      }
    }
  }

  // visualizationHint must be one of the approved values
  if (!APPROVED_HINTS.has(plan.visualizationHint)) {
    return { valid: false, reason: `Unknown visualizationHint: "${plan.visualizationHint}"` };
  }

  // limit, if present, must be a positive integer <= MAX_ROWS
  if (plan.limit !== undefined && plan.limit !== null) {
    if (!Number.isInteger(plan.limit) || plan.limit <= 0) {
      return { valid: false, reason: 'limit must be a positive integer' };
    }
    if (plan.limit > MAX_ROWS) {
      return { valid: false, reason: `limit exceeds maximum of ${MAX_ROWS}` };
    }
  }

  // If timeRange has both preset and from/to, reject as ambiguous
  if (plan.timeRange) {
    const tr = plan.timeRange;
    if (tr.preset && (tr.from || tr.to)) {
      return {
        valid: false,
        reason: 'timeRange cannot specify both a preset and explicit from/to dates',
      };
    }
  }

  return { valid: true };
}
