/**
 * @jest-environment node
 */
import { validatePlan } from '../plan-validator';
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

describe('validatePlan — valid plan', () => {
  it('accepts a well-formed top_n plan', () => {
    expect(validatePlan(basePlan())).toEqual({ valid: true });
  });

  it('accepts a trend plan', () => {
    expect(validatePlan(basePlan({ intent: 'trend', dimensions: ['day'], metrics: [{ name: 'fail_rate' }], visualizationHint: 'line' }))).toEqual({ valid: true });
  });

  it('accepts a lookup plan with no timeRange', () => {
    expect(
      validatePlan(
        basePlan({
          intent: 'lookup',
          timeRange: null,
          dimensions: ['serial_number', 'date', 'result', 'tester'],
          filters: [{ field: 'serial_number', operator: 'eq', value: 'ABC123' }],
          visualizationHint: 'table',
        })
      )
    ).toEqual({ valid: true });
  });

  it('accepts a plan with limit exactly MAX_ROWS', () => {
    expect(validatePlan(basePlan({ limit: MAX_ROWS }))).toEqual({ valid: true });
  });

  it('accepts a plan with no limit', () => {
    const plan = basePlan();
    delete plan.limit;
    expect(validatePlan(plan)).toEqual({ valid: true });
  });
});

describe('validatePlan — invalid intent', () => {
  it('rejects an unknown intent', () => {
    const result = validatePlan(basePlan({ intent: 'forecast' as never }));
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/intent/i);
  });
});

describe('validatePlan — metrics', () => {
  it('rejects empty metrics array', () => {
    const result = validatePlan(basePlan({ metrics: [] }));
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/metric/i);
  });

  it('rejects unknown metric name', () => {
    const result = validatePlan(basePlan({ metrics: [{ name: 'revenue' as never }] }));
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/metric/i);
  });
});

describe('validatePlan — dimensions', () => {
  it('rejects unknown dimension', () => {
    const result = validatePlan(basePlan({ dimensions: ['customer_id'] }));
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/dimension/i);
  });
});

describe('validatePlan — filters', () => {
  it('rejects filter with unknown field', () => {
    const result = validatePlan(
      basePlan({
        filters: [{ field: 'ip_address' as never, operator: 'eq', value: '1.2.3.4' }],
      })
    );
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/filter/i);
  });

  it('accepts filter with approved field', () => {
    const result = validatePlan(
      basePlan({
        filters: [{ field: 'serial_number', operator: 'eq', value: 'SN-001' }],
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe('validatePlan — visualizationHint', () => {
  it('rejects unknown visualizationHint', () => {
    const result = validatePlan(basePlan({ visualizationHint: 'pie' as never }));
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/visualizationHint/i);
  });
});

describe('validatePlan — limit', () => {
  it('rejects limit greater than MAX_ROWS', () => {
    const result = validatePlan(basePlan({ limit: MAX_ROWS + 1 }));
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/limit/i);
  });

  it('rejects non-integer limit', () => {
    const result = validatePlan(basePlan({ limit: 10.5 }));
    expect(result.valid).toBe(false);
  });

  it('rejects zero limit', () => {
    const result = validatePlan(basePlan({ limit: 0 }));
    expect(result.valid).toBe(false);
  });

  it('rejects negative limit', () => {
    const result = validatePlan(basePlan({ limit: -1 }));
    expect(result.valid).toBe(false);
  });
});

describe('validatePlan — timeRange ambiguity', () => {
  it('rejects timeRange with both preset and from', () => {
    const result = validatePlan(
      basePlan({ timeRange: { preset: 'last_7_days', from: '2025-01-01' } })
    );
    expect(result.valid).toBe(false);
    expect((result as { valid: false; reason: string }).reason).toMatch(/ambiguous|both/i);
  });

  it('rejects timeRange with both preset and to', () => {
    const result = validatePlan(
      basePlan({ timeRange: { preset: 'last_30_days', to: '2025-12-31' } })
    );
    expect(result.valid).toBe(false);
  });

  it('accepts timeRange with only preset', () => {
    expect(validatePlan(basePlan({ timeRange: { preset: 'today' } }))).toEqual({ valid: true });
  });

  it('accepts timeRange with only from/to', () => {
    expect(validatePlan(basePlan({ timeRange: { from: '2025-01-01', to: '2025-03-01' } }))).toEqual({ valid: true });
  });
});
