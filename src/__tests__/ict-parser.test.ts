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
    expect(parseLog('PROD-001_SN-XXXX-000001.log', log000001).result).toBe('pass');
  });

  it('parses PASS result from SN-000002', () => {
    expect(parseLog('PROD-001_SN-XXXX-000002.log', log000002).result).toBe('pass');
  });

  it('parses PASS result from SN-000003 (multi-session; most recent session is PASS)', () => {
    expect(parseLog('PROD-001_SN-XXXX-000003.log', log000003).result).toBe('pass');
  });

  it('parses FAIL result from SN-000004', () => {
    expect(parseLog('PROD-001_SN-XXXX-000004.log', log000004).result).toBe('fail');
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

// ---------------------------------------------------------------------------
// parseLog — Bug 2: Threshold: routing in unknown-type (jumper resistance) blocks
// ---------------------------------------------------------------------------

// Common variant: COMP=value defLine, then Measured:, then Threshold:
// Previously Threshold: landed in nominal_raw (~1,671 rows affected).
const LOG_THRESHOLD_COMMON = `----------------------------------------
TestPlan-A-v4.1
Mon Mar 16 10:00:00 2026
----------------------------------------
jp_loopback HAS FAILED
JP_LOOPBACK=10.000
Measured:   17.500
Threshold: 10.000
Jumper Resistance in OHMS
----------------------------------------
Board #: 0
Version:
S/N:PROD-999+SN-XXXX-000099
&v2S Family: Test Product X
&v2S ############################
&v2S #### BOARD ICT FAIL  #####
&v2S ############################
&v2S ST:260316100000
&v2S ET:260316100130
&v2S SN:PROD-999+SN-XXXX-000099
&v2S P/N:PART-REDACTED-001 Rev:1
&v3S Mac:020000000099
&v2S OPERATOR ID:operator-99
&v3S Fixture_ID: fixture-01
&v2S TESTER:tester-01
`;

// Less-common variant: defLine has no "=" (e.g. "Board #: 0"), Threshold: at measLine position.
// Previously Threshold: landed in measured_raw (~85 rows affected).
const LOG_THRESHOLD_NO_COMP = `----------------------------------------
TestPlan-A-v4.1
Mon Mar 16 10:00:00 2026
----------------------------------------
sw%jp_closed HAS FAILED
Board #: 0
Threshold: 10.000
Jumper Resistance in OHMS
----------------------------------------
Board #: 0
Version:
S/N:PROD-999+SN-XXXX-000099
&v2S Family: Test Product X
&v2S ############################
&v2S #### BOARD ICT FAIL  #####
&v2S ############################
&v2S ST:260316100000
&v2S ET:260316100130
&v2S SN:PROD-999+SN-XXXX-000099
&v2S P/N:PART-REDACTED-001 Rev:1
&v3S Mac:020000000099
&v2S OPERATOR ID:operator-99
&v3S Fixture_ID: fixture-01
&v2S TESTER:tester-01
`;

describe('parseLog — threshold-style (jumper resistance) error blocks (Bug 2)', () => {
  it('common variant: routes Threshold: to threshold_raw, not nominal_raw', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_THRESHOLD_COMMON);
    const err = r.errors.find((e) => e.location === 'jp_loopback')!;
    expect(err).toBeDefined();
    expect(err.threshold_raw).toBe('10.000');
    expect(err.nominal_raw).not.toMatch(/Threshold/i);
  });

  it('common variant: measured_raw is the actual measured value', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_THRESHOLD_COMMON);
    const err = r.errors.find((e) => e.location === 'jp_loopback')!;
    expect(err.measured_raw).toBe('17.500');
  });

  it('common variant: error_type is unknown (threshold-style, not nominal/high/low)', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_THRESHOLD_COMMON);
    const err = r.errors.find((e) => e.location === 'jp_loopback')!;
    expect(err.error_type).toBe('unknown');
  });

  it('less-common variant: routes Threshold: to threshold_raw, not measured_raw', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_THRESHOLD_NO_COMP);
    const err = r.errors.find((e) => e.location === 'sw%jp_closed')!;
    expect(err).toBeDefined();
    expect(err.threshold_raw).toBe('10.000');
    expect(err.measured_raw).not.toMatch(/Threshold/i);
  });

  it('less-common variant: error_type is unknown', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_THRESHOLD_NO_COMP);
    const err = r.errors.find((e) => e.location === 'sw%jp_closed')!;
    expect(err.error_type).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// parseLog — B1 fix: threshold_value float field and Subtest: branch scan fix
// ---------------------------------------------------------------------------

// Threshold-only Subtest: block — no Measured: line.
// Previously "Threshold: 18.000" would land verbatim in measured_raw (position-based parsing bug).
const LOG_SUBTEST_THRESHOLD_ONLY = `----------------------------------------
TestPlan-A-v4.1
Mon Mar 16 10:00:00 2026
----------------------------------------
jp_chk HAS FAILED
Subtest: Loopback Check
Threshold: 18.000
Jumper Resistance in OHMS
----------------------------------------
Board #: 0
Version:
S/N:PROD-999+SN-XXXX-000099
&v2S Family: Test Product X
&v2S ############################
&v2S #### BOARD ICT FAIL  #####
&v2S ############################
&v2S ST:260316100000
&v2S ET:260316100130
&v2S SN:PROD-999+SN-XXXX-000099
&v2S P/N:PART-REDACTED-001 Rev:1
&v3S Mac:020000000099
&v2S OPERATOR ID:operator-99
&v3S Fixture_ID: fixture-01
&v2S TESTER:tester-01
`;

// Subtest: block with both Measured: and Threshold: — regression guard.
const LOG_SUBTEST_WITH_MEASURED = `----------------------------------------
TestPlan-A-v4.1
Mon Mar 16 10:00:00 2026
----------------------------------------
jp_chk2 HAS FAILED
Subtest: Full Check
Measured:   5.500
Threshold: 10.000
Jumper Resistance in OHMS
----------------------------------------
Board #: 0
Version:
S/N:PROD-999+SN-XXXX-000099
&v2S Family: Test Product X
&v2S ############################
&v2S #### BOARD ICT FAIL  #####
&v2S ############################
&v2S ST:260316100000
&v2S ET:260316100130
&v2S SN:PROD-999+SN-XXXX-000099
&v2S P/N:PART-REDACTED-001 Rev:1
&v3S Mac:020000000099
&v2S OPERATOR ID:operator-99
&v3S Fixture_ID: fixture-01
&v2S TESTER:tester-01
`;

describe('parseLog — B1: threshold_value + Subtest: scan fix', () => {
  it('Subtest-only-threshold: threshold_raw is the bare value, not "Threshold: ..."', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_SUBTEST_THRESHOLD_ONLY);
    const err = r.errors.find((e) => e.location === 'jp_chk')!;
    expect(err).toBeDefined();
    expect(err.threshold_raw).toBe('18.000');
    expect(err.threshold_raw).not.toMatch(/Threshold/i);
  });

  it('Subtest-only-threshold: measured_raw does not contain "Threshold:"', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_SUBTEST_THRESHOLD_ONLY);
    const err = r.errors.find((e) => e.location === 'jp_chk')!;
    expect(err.measured_raw).not.toMatch(/Threshold/i);
  });

  it('Subtest-only-threshold: threshold_value is the correct float', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_SUBTEST_THRESHOLD_ONLY);
    const err = r.errors.find((e) => e.location === 'jp_chk')!;
    expect(err.threshold_value).toBeCloseTo(18.0);
  });

  it('Subtest-only-threshold: subtest is extracted', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_SUBTEST_THRESHOLD_ONLY);
    const err = r.errors.find((e) => e.location === 'jp_chk')!;
    expect(err.subtest).toBe('Loopback Check');
  });

  it('Subtest-only-threshold: error_type is shorts_report', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_SUBTEST_THRESHOLD_ONLY);
    const err = r.errors.find((e) => e.location === 'jp_chk')!;
    expect(err.error_type).toBe('shorts_report');
  });

  it('Subtest-with-measured: measured_raw and threshold_raw both correct (regression)', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_SUBTEST_WITH_MEASURED);
    const err = r.errors.find((e) => e.location === 'jp_chk2')!;
    expect(err.measured_raw).toBe('5.500');
    expect(err.threshold_raw).toBe('10.000');
    expect(err.threshold_value).toBeCloseTo(10.0);
    expect(err.subtest).toBe('Full Check');
  });

  it('threshold_value from LOG_THRESHOLD_COMMON is 10.0', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_THRESHOLD_COMMON);
    const err = r.errors.find((e) => e.location === 'jp_loopback')!;
    expect(err.threshold_value).toBeCloseTo(10.0);
  });

  it('threshold_value from unit-suffixed raw (k suffix → *1000)', () => {
    const r = parseLog('PROD-001_SN-XXXX-000003.log', log000003);
    const shorts = r.errors.find((e) => e.location === 'pwr_res_chk')!;
    // threshold_raw is truthy per existing test; threshold_value should be a number
    expect(typeof shorts.threshold_value).toBe('number');
    expect(shorts.threshold_value).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseUnitValue — unit suffix conversion
// ---------------------------------------------------------------------------
import { parseUnitValue } from '@/lib/ict-parser';

describe('parseUnitValue', () => {
  it('returns null for null input', () => expect(parseUnitValue(null)).toBeNull());
  it('returns null for empty string', () => expect(parseUnitValue('')).toBeNull());
  it('parses plain float', () => expect(parseUnitValue('17.500')).toBeCloseTo(17.5));
  it('parses u suffix (micro)', () => expect(parseUnitValue('0.78327u')).toBeCloseTo(0.78327e-6));
  it('parses p suffix (pico)', () => expect(parseUnitValue('233.26p')).toBeCloseTo(233.26e-12));
  it('parses k suffix (kilo)', () => expect(parseUnitValue('20.000k')).toBeCloseTo(20000));
  it('parses M suffix (mega)', () => expect(parseUnitValue('1.5612M')).toBeCloseTo(1561200));
  it('parses m suffix (milli)', () => expect(parseUnitValue('5.000m')).toBeCloseTo(0.005));
  it('parses n suffix (nano)', () => expect(parseUnitValue('10.000n')).toBeCloseTo(10e-9));
});

// ---------------------------------------------------------------------------
// parseLog — raw_block capture (Enhancement)
// ---------------------------------------------------------------------------
describe('parseLog — raw_block capture', () => {
  it('raw_block is a non-empty string for analog errors', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.errors[0].raw_block).toBeTruthy();
    expect(typeof r.errors[0].raw_block).toBe('string');
  });

  it('raw_block starts with the HAS FAILED line', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.errors[0].raw_block).toMatch(/c01 HAS FAILED/i);
  });

  it('raw_block contains the measured value line', () => {
    const r = parseLog('PROD-001_SN-XXXX-000001.log', log000001);
    expect(r.errors[0].raw_block).toMatch(/0\.7[89]/);
  });

  it('raw_block for threshold-type error contains the Threshold: line', () => {
    const r = parseLog('PROD-999_SN-XXXX-000099.log', LOG_THRESHOLD_COMMON);
    const err = r.errors.find((e) => e.location === 'jp_loopback')!;
    expect(err.raw_block).toMatch(/Threshold:\s*10\.000/);
  });

  it('raw_block for digital_pin error starts with HAS FAILED line', () => {
    const r = parseLog('PROD-001_SN-XXXX-000003.log', log000003);
    const digital = r.errors.find((e) => e.location === 'u01%prog_1')!;
    expect(digital.raw_block).toMatch(/u01%prog_1 HAS FAILED/i);
  });
});
