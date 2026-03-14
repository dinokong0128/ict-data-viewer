import * as fs from 'fs';
import * as path from 'path';
import { parseLog, parseTimestamp } from '@/lib/ict-parser';

const SAMPLE_DIR = path.join(__dirname, '..', 'pipeline', 'docs', 'sample-logs');

function readSample(filename: string): string {
  return fs.readFileSync(path.join(SAMPLE_DIR, filename), 'utf8');
}

// Pre-load all 4 sample files
const log000001 = readSample('PROD-001_SN-XXXX-000001.log'); // PASS, 1 error, analog capacitor
const log000002 = readSample('PROD-001_SN-XXXX-000002.log'); // PASS, 2 errors, analog resistors
const log000003 = readSample('PROD-001_SN-XXXX-000003.log'); // PASS, 9 unique errors
const log000004 = readSample('PROD-001_SN-XXXX-000004.log'); // FAIL, 8 unique components

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
  it('PROD-001_SN-XXXX-000001.log parses without throwing', () => {
    expect(() => parseLog('PROD-001_SN-XXXX-000001.log', log000001)).not.toThrow();
  });

  it('PROD-001_SN-XXXX-000002.log parses without throwing', () => {
    expect(() => parseLog('PROD-001_SN-XXXX-000002.log', log000002)).not.toThrow();
  });

  it('PROD-001_SN-XXXX-000003.log parses without throwing', () => {
    expect(() => parseLog('PROD-001_SN-XXXX-000003.log', log000003)).not.toThrow();
  });

  it('PROD-001_SN-XXXX-000004.log parses without throwing', () => {
    expect(() => parseLog('PROD-001_SN-XXXX-000004.log', log000004)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseLog — serial_number / product_id extraction from filename
// ---------------------------------------------------------------------------
describe('parseLog — identifiers', () => {
  it('extracts serial_number as the part after the first underscore', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.serial_number).toBe('SN-XXXX-000001');
  });

  it('extracts product_id as the part before the underscore', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.product_id).toBe('PROD-001');
  });

  it('serial_number from FAIL log', () => {
    const r = parseLog('PROD-001_SN-XXXX-000004.log', log000004);
    expect(r.serial_number).toBe('SN-XXXX-000004');
  });
});

// ---------------------------------------------------------------------------
// parseLog — metadata fields
// ---------------------------------------------------------------------------
describe('parseLog — metadata', () => {
  it('extracts product_name (Family field)', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.product_name).toBe('Test Product A');
  });

  it('extracts rev from P/N field', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.rev).toBe('13');
  });

  it('stores source_file = the filename argument', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.source_file).toBe('PROD-001_SN-XXXX-000001.log');
  });

  it('extracts mac_address', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.mac_address).toBe('020000000001');
  });

  it('extracts tester', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.tester).toBe('tester-01');
  });

  it('extracts fixture_id', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.fixture_id).toBe('fixture-01');
  });

  it('extracts operator_id (SN-000001: operator-01)', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.operator_id).toBe('operator-01');
  });

  it('extracts operator_id (SN-000002: operator-02)', () => {
    const r = parseLog('PROD-001_SN-XXXX-000002.log', log000002);
    expect(r.operator_id).toBe('operator-02');
  });
});

// ---------------------------------------------------------------------------
// parseLog — timestamps
// ---------------------------------------------------------------------------
describe('parseLog — timestamps', () => {
  it('parses start_time from ST field — SN-000001', () => {
    // ST:260312131048 → 2026-03-12 13:10:48 UTC
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.start_time.getUTCFullYear()).toBe(2026);
    expect(r.start_time.getUTCMonth()).toBe(2);
    expect(r.start_time.getUTCDate()).toBe(12);
    expect(r.start_time.getUTCHours()).toBe(13);
    expect(r.start_time.getUTCMinutes()).toBe(10);
    expect(r.start_time.getUTCSeconds()).toBe(48);
  });

  it('parses end_time from ET field — SN-000001', () => {
    // ET:260312131213 → 2026-03-12 13:12:13 UTC
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.end_time.getUTCHours()).toBe(13);
    expect(r.end_time.getUTCMinutes()).toBe(12);
    expect(r.end_time.getUTCSeconds()).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// parseLog — result
// ---------------------------------------------------------------------------
describe('parseLog — result', () => {
  it('parses PASS result from SN-000001', () => {
    expect(parseLog('PROD-001_SN-XXXX-000001.log', log000001).result).toBe('PASS');
  });

  it('parses PASS result from SN-000002', () => {
    expect(parseLog('PROD-001_SN-XXXX-000002.log', log000002).result).toBe('PASS');
  });

  it('parses PASS result from SN-000003 (multi-session; most recent session is PASS)', () => {
    expect(parseLog('PROD-001_SN-XXXX-000003.log', log000003).result).toBe('PASS');
  });

  it('parses FAIL result from SN-000004', () => {
    expect(parseLog('PROD-001_SN-XXXX-000004.log', log000004).result).toBe('FAIL');
  });
});

// ---------------------------------------------------------------------------
// parseLog — error deduplication
// ---------------------------------------------------------------------------
describe('parseLog — error deduplication', () => {
  it('SN-000001: each run appears twice but only 1 unique error is stored', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].location).toBe('c01');
  });

  it('SN-000003: 9 unique error locations across multiple sessions', () => {
    const r = parseLog('PROD-001_SN-XXXX-000003.log', log000003);
    expect(r.errors).toHaveLength(9);
    const locations = r.errors.map((e) => e.location);
    expect(locations).toContain('c01');
    expect(locations).toContain('r03');
    expect(locations).toContain('r04');
    expect(locations).toContain('r05');
    expect(locations).toContain('r06');
  });

  it('SN-000002: 2 unique resistor errors', () => {
    const r = parseLog('PROD-001_SN-XXXX-000002.log', log000002);
    expect(r.errors).toHaveLength(2);
    const locations = r.errors.map((e) => e.location);
    expect(locations).toContain('r01');
    expect(locations).toContain('r02');
  });

  it('SN-000004: 8 unique component errors across multiple retry runs', () => {
    const r = parseLog('PROD-001_SN-XXXX-000004.log', log000004);
    expect(r.errors).toHaveLength(8);
    const locations = r.errors.map((e) => e.location);
    expect(locations).toContain('c02');
    expect(locations).toContain('c03');
    expect(locations).toContain('r02');
    expect(locations).toContain('r03');
    expect(locations).toContain('r07');
    expect(locations).toContain('r08');
    expect(locations).toContain('r09');
    expect(locations).toContain('r10');
  });
});

// ---------------------------------------------------------------------------
// parseLog — error field values
// ---------------------------------------------------------------------------
describe('parseLog — error field values', () => {
  it('stores part_spec and unit for analog capacitor', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.errors[0].part_spec).toBe('1UF');
    expect(r.errors[0].unit).toBe('FARADS');
    expect(r.errors[0].error_type).toBe('analog');
  });

  it('stores measured_raw for capacitor failure', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.errors[0].measured_raw).toBe('0.78327u');
  });

  it('stores measured_raw for pF capacitor — c03 in SN-000004', () => {
    const r = parseLog('PROD-001_SN-XXXX-000004.log', log000004);
    const c03 = r.errors.find((e) => e.location === 'c03')!;
    expect(c03.measured_raw).toBe('233.26p');
    expect(c03.unit).toBe('FARADS');
    expect(c03.error_type).toBe('analog');
  });

  it('stores nominal_raw with k suffix — r08 in SN-000004', () => {
    const r = parseLog('PROD-001_SN-XXXX-000004.log', log000004);
    const r08 = r.errors.find((e) => e.location === 'r08')!;
    expect(r08.nominal_raw).toBe('20.000k');
    expect(r08.unit).toBe('OHMS');
    expect(r08.error_type).toBe('analog');
  });

  it('stores measured_raw with M suffix — r08 in SN-000004', () => {
    const r = parseLog('PROD-001_SN-XXXX-000004.log', log000004);
    const r08 = r.errors.find((e) => e.location === 'r08')!;
    expect(r08.measured_raw).toBe('1.5612M');
  });

  it('stores measured_raw for plain resistor — r03 in SN-000003', () => {
    const r = parseLog('PROD-001_SN-XXXX-000003.log', log000003);
    const r03 = r.errors.find((e) => e.location === 'r03')!;
    expect(r03.measured_raw).toBe('10.942');
    expect(r03.unit).toBe('OHMS');
    expect(r03.error_type).toBe('analog');
  });

  it('skips DEVICES IN PARALLEL hint lines — r08 is an error, c04 is not', () => {
    const r = parseLog('PROD-001_SN-XXXX-000004.log', log000004);
    const locations = r.errors.map((e) => e.location);
    expect(locations).toContain('r08');
    expect(locations).not.toContain('c04');
    expect(locations).not.toContain('devices in parallel');
  });
});

// ---------------------------------------------------------------------------
// parseLog — error_type detection
// ---------------------------------------------------------------------------
describe('parseLog — error_type detection', () => {
  it('detects analog type from FARADS unit line', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.errors[0].error_type).toBe('analog');
  });

  it('detects analog type from OHMS unit line', () => {
    const r = parseLog('PROD-001_SN-XXXX-000002.log', log000002);
    expect(r.errors[0].error_type).toBe('analog');
  });

  it('detects digital_pin type from vector= line — SN-000003', () => {
    const r = parseLog('PROD-001_SN-XXXX-000003.log', log000003);
    const digital = r.errors.find((e) => e.location === 'u01%prog_1');
    expect(digital).toBeDefined();
    expect(digital!.error_type).toBe('digital_pin');
  });

  it('detects shorts_report type from Subtest: line — SN-000003', () => {
    const r = parseLog('PROD-001_SN-XXXX-000003.log', log000003);
    const shorts = r.errors.find((e) => e.location === 'pwr_res_chk');
    expect(shorts).toBeDefined();
    expect(shorts!.error_type).toBe('shorts_report');
    expect(shorts!.subtest).toBeTruthy();
    expect(shorts!.threshold_raw).toBeTruthy();
  });
});
