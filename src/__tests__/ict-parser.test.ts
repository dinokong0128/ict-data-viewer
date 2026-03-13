import * as fs from 'fs';
import * as path from 'path';
import { parseLog, parseSiValue, parseTimestamp } from '@/lib/ict-parser';

const SAMPLE_DIR = path.join(__dirname, '..', 'pipeline', 'docs', 'sample-logs');

function readSample(filename: string): string {
  return fs.readFileSync(path.join(SAMPLE_DIR, filename), 'utf8');
}

// Pre-load all 4 sample files
const log808HH = readSample('465136J_2609F808HH.log');   // PASS, 1 error, numeric operator
const log8092F = readSample('465136J_2609F8092F.log');   // PASS, 2 errors, µF + Ω
const log808RM = readSample('465136J_2609F808RM.log');   // PASS, 2 errors, alphanumeric operator
const log8019P = readSample('465136J_2611F8019P.log');   // FAIL, 8 unique components

// ---------------------------------------------------------------------------
// parseSiValue
// ---------------------------------------------------------------------------
describe('parseSiValue', () => {
  it('converts µ suffix (microfarads)', () => {
    expect(parseSiValue('0.78327u')).toBeCloseTo(0.78327e-6);
  });

  it('converts p suffix (picofarads)', () => {
    expect(parseSiValue('233.26p')).toBeCloseTo(233.26e-12);
  });

  it('converts k suffix (kilohms)', () => {
    expect(parseSiValue('20.000k')).toBeCloseTo(20000);
  });

  it('converts M suffix (megaohms)', () => {
    expect(parseSiValue('1.5612M')).toBeCloseTo(1561200);
  });

  it('handles plain number (no suffix)', () => {
    expect(parseSiValue('10.942')).toBeCloseTo(10.942);
  });

  it('returns null for non-numeric input', () => {
    expect(parseSiValue('N/A')).toBeNull();
    expect(parseSiValue('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseTimestamp
// ---------------------------------------------------------------------------
describe('parseTimestamp', () => {
  it('parses YYMMDDHHMMSS to UTC Date', () => {
    const d = parseTimestamp('260311134729');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(2); // March = 2 (0-indexed)
    expect(d.getUTCDate()).toBe(11);
    expect(d.getUTCHours()).toBe(13);
    expect(d.getUTCMinutes()).toBe(47);
    expect(d.getUTCSeconds()).toBe(29);
  });
});

// ---------------------------------------------------------------------------
// parseLog — all 4 sample files parse without throwing
// ---------------------------------------------------------------------------
describe('parseLog — smoke tests (all 4 sample files)', () => {
  it('465136J_2609F808HH.log parses without throwing', () => {
    expect(() => parseLog('465136J_2609F808HH.log', log808HH)).not.toThrow();
  });

  it('465136J_2609F8092F.log parses without throwing', () => {
    expect(() => parseLog('465136J_2609F8092F.log', log8092F)).not.toThrow();
  });

  it('465136J_2609F808RM.log parses without throwing', () => {
    expect(() => parseLog('465136J_2609F808RM.log', log808RM)).not.toThrow();
  });

  it('465136J_2611F8019P.log parses without throwing', () => {
    expect(() => parseLog('465136J_2611F8019P.log', log8019P)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseLog — board_id / product_id extraction
// ---------------------------------------------------------------------------
describe('parseLog — identifiers', () => {
  it('replaces first underscore with + to form board_id', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.board_id).toBe('465136J+2609F808HH');
  });

  it('extracts product_id as the part before +', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.product_id).toBe('465136J');
  });

  it('board_id from FAIL log', () => {
    const r = parseLog('465136J_2611F8019P.log', log8019P);
    expect(r.board_id).toBe('465136J+2611F8019P');
  });
});

// ---------------------------------------------------------------------------
// parseLog — metadata fields
// ---------------------------------------------------------------------------
describe('parseLog — metadata', () => {
  it('extracts family', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.family).toBe('C2-ROT41');
  });

  it('extracts part_number and revision from P/N field', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.part_number).toBe('8215911');
    expect(r.revision).toBe('13');
  });

  it('extracts testplan', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.testplan).toBe('Released-04-04-2025');
  });

  it('extracts platform', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.platform).toBe('Agilent3070 Rev:8.30');
  });

  it('extracts mac_address', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.mac_address).toBe('A8698C613296');
  });

  it('extracts tester', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.tester).toBe('TESTER-2');
  });

  it('extracts fixture_id', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.fixture_id).toBe('FxSJ_WW3423');
  });

  it('handles numeric operator_id (102059)', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.operator_id).toBe('102059');
  });

  it('handles alphanumeric operator_id (JT1227)', () => {
    const r = parseLog('465136J_2609F808RM.log', log808RM);
    expect(r.operator_id).toBe('JT1227');
  });
});

// ---------------------------------------------------------------------------
// parseLog — timestamps
// ---------------------------------------------------------------------------
describe('parseLog — timestamps', () => {
  it('parses start_time from ST field', () => {
    // ST:260312131048 → 2026-03-12 13:10:48 UTC
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.start_time.getUTCFullYear()).toBe(2026);
    expect(r.start_time.getUTCMonth()).toBe(2);
    expect(r.start_time.getUTCDate()).toBe(12);
    expect(r.start_time.getUTCHours()).toBe(13);
    expect(r.start_time.getUTCMinutes()).toBe(10);
    expect(r.start_time.getUTCSeconds()).toBe(48);
  });

  it('parses end_time from ET field', () => {
    // ET:260312131213 → 2026-03-12 13:12:13 UTC
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.end_time.getUTCHours()).toBe(13);
    expect(r.end_time.getUTCMinutes()).toBe(12);
    expect(r.end_time.getUTCSeconds()).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// parseLog — result
// ---------------------------------------------------------------------------
describe('parseLog — result', () => {
  it('parses PASS result from 808HH', () => {
    expect(parseLog('465136J_2609F808HH.log', log808HH).result).toBe('PASS');
  });

  it('parses PASS result from 8092F', () => {
    expect(parseLog('465136J_2609F8092F.log', log8092F).result).toBe('PASS');
  });

  it('parses PASS result from 808RM', () => {
    expect(parseLog('465136J_2609F808RM.log', log808RM).result).toBe('PASS');
  });

  it('parses FAIL result from 2611F8019P', () => {
    expect(parseLog('465136J_2611F8019P.log', log8019P).result).toBe('FAIL');
  });
});

// ---------------------------------------------------------------------------
// parseLog — error deduplication
// ---------------------------------------------------------------------------
describe('parseLog — error deduplication', () => {
  it('808HH: each run appears twice but only 1 unique error is stored', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].component).toBe('c314_1_c');
  });

  it('8092F: 9 unique error components', () => {
    const r = parseLog('465136J_2609F8092F.log', log8092F);
    expect(r.errors).toHaveLength(9);
    const components = r.errors.map((e) => e.component);
    expect(components).toContain('c314_1_c');
    expect(components).toContain('r503');
    expect(components).toContain('r206_2_c');
    expect(components).toContain('r834');
    expect(components).toContain('r411_2_c');
  });

  it('808RM: 2 unique resistor errors', () => {
    const r = parseLog('465136J_2609F808RM.log', log808RM);
    expect(r.errors).toHaveLength(2);
    const components = r.errors.map((e) => e.component);
    expect(components).toContain('r320_1_c');
    expect(components).toContain('r7108_2_c');
  });

  it('2611F8019P: 8 unique component errors across multiple retry runs', () => {
    const r = parseLog('465136J_2611F8019P.log', log8019P);
    expect(r.errors).toHaveLength(8);
    const components = r.errors.map((e) => e.component);
    expect(components).toContain('c103_p');
    expect(components).toContain('c407_c');
    expect(components).toContain('r7108_2_c');
    expect(components).toContain('r503');
    expect(components).toContain('r210_2_c');
    expect(components).toContain('r625');
    expect(components).toContain('r7308_2_c');
    expect(components).toContain('r421_2_c');
  });
});

// ---------------------------------------------------------------------------
// parseLog — error field values
// ---------------------------------------------------------------------------
describe('parseLog — error field values', () => {
  it('stores component_value and part_number', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.errors[0].component_value).toBe('1UF');
    expect(r.errors[0].part_number).toBe('110-5581-01');
  });

  it('stores measured_raw and unit for capacitor (FARADS)', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.errors[0].measured_raw).toBe('0.78327u');
    expect(r.errors[0].unit).toBe('FARADS');
  });

  it('converts µF to SI base unit (Farads)', () => {
    const r = parseLog('465136J_2609F808HH.log', log808HH);
    expect(r.errors[0].measured).toBeCloseTo(0.78327e-6);
  });

  it('converts pF to SI base unit (Farads) — c407_c in 2611F8019P', () => {
    const r = parseLog('465136J_2611F8019P.log', log8019P);
    const c407 = r.errors.find((e) => e.component === 'c407_c')!;
    expect(c407.measured_raw).toBe('233.26p');
    expect(c407.measured).toBeCloseTo(233.26e-12);
    expect(c407.unit).toBe('FARADS');
  });

  it('converts kΩ to SI base unit (Ohms) — r625 in 2611F8019P', () => {
    const r = parseLog('465136J_2611F8019P.log', log8019P);
    const r625 = r.errors.find((e) => e.component === 'r625')!;
    expect(r625.nominal_raw).toBe('20.000k');
    expect(r625.nominal).toBeCloseTo(20000);
    expect(r625.unit).toBe('OHMS');
  });

  it('converts MΩ to SI base unit (Ohms) — r625 measured', () => {
    const r = parseLog('465136J_2611F8019P.log', log8019P);
    const r625 = r.errors.find((e) => e.component === 'r625')!;
    expect(r625.measured_raw).toBe('1.5612M');
    expect(r625.measured).toBeCloseTo(1561200);
  });

  it('parses plain Ω value (no suffix) — r503 in 8092F', () => {
    const r = parseLog('465136J_2609F8092F.log', log8092F);
    const r503 = r.errors.find((e) => e.component === 'r503')!;
    expect(r503.measured_raw).toBe('10.942');
    expect(r503.measured).toBeCloseTo(10.942);
    expect(r503.unit).toBe('OHMS');
  });

  it('skips DEVICES IN PARALLEL hint lines — r625 is an error, not a parallel note', () => {
    // r625 should appear in errors; the "DEVICES IN PARALLEL / c640 220p" note should NOT
    const r = parseLog('465136J_2611F8019P.log', log8019P);
    const components = r.errors.map((e) => e.component);
    expect(components).toContain('r625');
    expect(components).not.toContain('c640');
    expect(components).not.toContain('devices in parallel');
  });
});
