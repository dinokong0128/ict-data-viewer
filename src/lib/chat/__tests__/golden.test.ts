/**
 * @jest-environment node
 *
 * // TODO: human review required
 *
 * Golden test scaffold for AI-powered analytics chat (F1).
 *
 * These tests are INTENTIONALLY SKIPPED. They document expected end-to-end
 * behaviour from question → ChatQueryPlan intent → visualizationHint →
 * SQL fragment. All expectedSQLContains values are placeholder descriptions
 * that must be replaced with actual SQL fragments after a human reviews the
 * first live run.
 *
 * To activate a case after human review:
 *   1. Replace the expectedSQLContains placeholder strings with real SQL
 *      fragments produced by the compiler.
 *   2. Change `it.skip` to `it` for that case.
 *   3. Run `npm test -- --testPathPatterns golden` to confirm it passes.
 */

import { compilePlan } from '../sql-compiler';
import { validatePlan } from '../plan-validator';
import type { ChatQueryPlan } from '../types';

// ---------------------------------------------------------------------------
// Scaffolded golden cases
// ---------------------------------------------------------------------------

const goldenCases: Array<{
  question: string;
  plan: ChatQueryPlan; // representative plan the LLM should produce for this question
  expectedIntent: ChatQueryPlan['intent'];
  expectedVisualization: ChatQueryPlan['visualizationHint'];
  expectedSQLContains: string[]; // TODO: review and finalize expected SQL after first run
}> = [
  {
    question: 'Top 5 fixtures by fail count in the last 7 days',
    plan: {
      intent: 'top_n',
      metrics: [{ name: 'fail_count' }],
      dimensions: ['fixture'],
      filters: [],
      timeRange: { preset: 'last_7_days' },
      sort: [{ field: 'fail_count', direction: 'desc' }],
      limit: 5,
      visualizationHint: 'bar',
      ambiguities: [],
    },
    expectedIntent: 'top_n',
    expectedVisualization: 'bar',
    expectedSQLContains: [
      'fixture_id', // TODO: review and finalize expected SQL after first run
      'fail_count', // TODO: review and finalize expected SQL after first run
      "interval '7 days'", // TODO: review and finalize expected SQL after first run
    ],
  },
  {
    question: 'Daily fail rate for the last 2 weeks',
    plan: {
      intent: 'trend',
      metrics: [{ name: 'fail_rate' }],
      dimensions: ['day'],
      filters: [],
      timeRange: { preset: 'last_14_days' },
      sort: [{ field: 'day', direction: 'asc' }],
      limit: 14,
      visualizationHint: 'line',
      ambiguities: [],
    },
    expectedIntent: 'trend',
    expectedVisualization: 'line',
    expectedSQLContains: [
      'start_time::date', // TODO: review and finalize expected SQL after first run
      'fail_rate', // TODO: review and finalize expected SQL after first run
      "interval '14 days'", // TODO: review and finalize expected SQL after first run
    ],
  },
  {
    question: 'All tests for serial number ABC123',
    plan: {
      intent: 'lookup',
      metrics: [{ name: 'test_count' }],
      dimensions: ['serial_number', 'date', 'result', 'tester'],
      filters: [{ field: 'serial_number', operator: 'eq', value: 'ABC123' }],
      timeRange: null,
      sort: [{ field: 'date', direction: 'desc' }],
      limit: 50,
      visualizationHint: 'table',
      ambiguities: [],
    },
    expectedIntent: 'lookup',
    expectedVisualization: 'table',
    expectedSQLContains: [
      'serial_number', // TODO: review and finalize expected SQL after first run
      'ABC123', // TODO: review and finalize expected SQL after first run
    ],
  },
  {
    question: 'Which tester had the highest fail count yesterday',
    plan: {
      intent: 'top_n',
      metrics: [{ name: 'fail_count' }],
      dimensions: ['tester'],
      filters: [],
      timeRange: { preset: 'yesterday' },
      sort: [{ field: 'fail_count', direction: 'desc' }],
      limit: 1,
      visualizationHint: 'bar',
      ambiguities: [],
    },
    expectedIntent: 'top_n',
    expectedVisualization: 'bar',
    expectedSQLContains: [
      'tester', // TODO: review and finalize expected SQL after first run
      'CURRENT_DATE - 1', // TODO: review and finalize expected SQL after first run
    ],
  },
];

// ---------------------------------------------------------------------------
// Scaffolded tests (skipped — awaiting human review)
// ---------------------------------------------------------------------------

describe.skip('Golden tests — F1 AI chat (TODO: human review required before activating)', () => {
  for (const tc of goldenCases) {
    describe(`Question: "${tc.question}"`, () => {
      it('plan passes validation', () => {
        const result = validatePlan(tc.plan);
        expect(result.valid).toBe(true);
      });

      it(`intent is "${tc.expectedIntent}"`, () => {
        expect(tc.plan.intent).toBe(tc.expectedIntent);
      });

      it(`visualizationHint is "${tc.expectedVisualization}"`, () => {
        expect(tc.plan.visualizationHint).toBe(tc.expectedVisualization);
      });

      it('compiles to SQL containing expected fragments', () => {
        const sql = compilePlan(tc.plan);
        for (const fragment of tc.expectedSQLContains) {
          // TODO: review and finalize expected SQL after first run
          expect(sql).toContain(fragment);
        }
      });
    });
  }
});
