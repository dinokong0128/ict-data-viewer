/**
 * ict-parser.ts — pure ICT log parser, no DB dependencies.
 *
 * Log format (one file = one test session):
 *   - One or more test "runs" separated by 40-dash dividers.
 *     Each run appears TWICE (ICT tester artifact); we deduplicate by component name.
 *   - A single metadata section at end of file, lines prefixed with &v1S / &v2S / &v3S.
 */

export interface ParsedTest {
  serial_number: string;  // serial part only, e.g. "SN-XXXX-000001"
  product_id:    string;  // part before + in the board composite id, e.g. "PART-REDACTED-001"
  product_name:  string;  // was: family
  rev:           string;  // PCB hardware revision (per-board), e.g. "13"
  mac_address:   string;
  result:       'pass' | 'fail';
  start_time:    Date;
  end_time:      Date;
  operator_id:   string;
  tester:        string;
  fixture_id:    string;
  source_file:   string;  // original filename passed into parseLog()
  errors:        ParsedError[];
}

export interface ParsedError {
  error_type:     'analog' | 'digital_pin' | 'shorts_report' | 'unknown';
  location:       string;       // PCB component reference (was: component)
  subtest:        string | null;
  part_spec:      string;       // component value, e.g. "1UF" (was: component_value)
  unit:           string;       // "FARADS" | "OHMS" | ""
  measured_raw:   string;
  nominal_raw:    string;
  high_limit_raw: string;
  low_limit_raw:  string;
  threshold_raw:  string | null;
  raw_block:      string | null; // raw lines that produced this error; null if not captured
}

const SEPARATOR = '----------------------------------------';

/**
 * Parse an YYMMDDHHMMSS timestamp string (e.g. "260311134729") into a Date (UTC).
 */
export function parseTimestamp(ts: string): Date {
  const s = ts.trim();
  const year = 2000 + parseInt(s.slice(0, 2), 10);
  const month = parseInt(s.slice(2, 4), 10) - 1; // 0-based
  const day = parseInt(s.slice(4, 6), 10);
  const hour = parseInt(s.slice(6, 8), 10);
  const min = parseInt(s.slice(8, 10), 10);
  const sec = parseInt(s.slice(10, 12), 10);
  return new Date(Date.UTC(year, month, day, hour, min, sec));
}

/**
 * Parse a raw ICT log file.
 *
 * @param filename  Original filename, e.g. "PROD-001_SN-XXXX-000001.log".
 *                  The first underscore is replaced with + to derive product_id and serial_number.
 * @param content   Full file text (LF or CRLF).
 */
export function parseLog(filename: string, content: string): ParsedTest {
  const lines = content.split(/\r?\n/);

  // --- serial_number and product_id from filename ---
  const base = filename.replace(/\.log$/i, '');
  const firstUnderscore = base.indexOf('_');
  const composite =
    firstUnderscore !== -1
      ? base.slice(0, firstUnderscore) + '+' + base.slice(firstUnderscore + 1)
      : base;
  const product_id = composite.split('+')[0] ?? composite;
  const serial_number = composite.split('+')[1] ?? composite;

  // --- collect metadata from &v[123]S lines ---
  const meta: Record<string, string> = {};
  let result: 'pass' | 'fail' | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    // Metadata lines are PCL escape sequences: ESC (0x1b) + &v2S + space + content
    // ESC prefix (\x1b) is optional — some log files omit it in text-mode output
    const metaMatch = line.match(/^(?:\x1b)?&v[123]S\s*(.*)/);
    if (!metaMatch) continue;

    const value = metaMatch[1].trim();

    // Use first-found result: a log file can contain multiple sessions (newest
    // at top); the first metadata block corresponds to the most recent test run.
    if (!result) {
      if (value.includes('BOARD ICT PASS')) { result = 'pass'; continue; }
      if (value.includes('BOARD ICT FAIL')) { result = 'fail'; continue; }
    } else {
      if (value.includes('BOARD ICT PASS') || value.includes('BOARD ICT FAIL')) continue;
    }
    if (value.startsWith('Testplan-')) continue; // dropped field
    if (value.startsWith('***') || value.startsWith('###')) continue; // decorative

    const colonIdx = value.indexOf(':');
    if (colonIdx === -1) continue;
    const key = value.slice(0, colonIdx).trim().toLowerCase();
    const val = value.slice(colonIdx + 1).trim();
    // First occurrence wins (most recent session's data)
    if (!(key in meta)) meta[key] = val;
  }

  // P/N line is "PART-REDACTED-001 Rev:13"
  let rev = '';
  const pn = meta['p/n'] ?? '';
  const revMatch = pn.match(/^(.+?)\s+Rev:(.+)$/);
  if (revMatch) {
    // product_id already comes from the filename; use revision as the board rev
    rev = revMatch[2].trim();
  }

  const start_time = meta['st'] ? parseTimestamp(meta['st']) : new Date(0);
  const end_time   = meta['et'] ? parseTimestamp(meta['et']) : new Date(0);

  // --- collect error blocks from all runs, dedup by location ---
  const errorMap = new Map<string, ParsedError>();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (line !== SEPARATOR) { i++; continue; }

    // We're at a separator — peek ahead to see if this starts an error block
    let j = i + 1;

    // Skip equipment identifier and date line
    while (j < lines.length && lines[j].trimEnd() !== SEPARATOR && !lines[j].includes('HAS FAILED')) {
      j++;
    }

    if (j >= lines.length || lines[j].trimEnd() === SEPARATOR) { i++; continue; }

    // Parse consecutive error blocks until next run header or end
    while (j < lines.length) {
      const l = lines[j].trimEnd();

      if (l === SEPARATOR) {
        let k = j + 1;
        while (k < lines.length && lines[k].trim() === '') k++;
        if (k >= lines.length) break;
        const next = lines[k].trimEnd();
        if (next.includes('HAS FAILED') || next === 'DEVICES IN PARALLEL') {
          j = k;
          continue;
        }
        break;
      }

      if (l === 'DEVICES IN PARALLEL') { j++; continue; }

      const failedMatch = l.match(/^(\S+)\s+HAS FAILED\s*$/i);
      if (!failedMatch) { j++; continue; }

      const location = failedMatch[1].toLowerCase();
      const blockStart = j; // index of the HAS FAILED line itself
      j++;

      // Next line: COMPONENT=value Part# part#  OR  Subtest: ...  OR vector = ...
      const defLine = (lines[j] ?? '').trimEnd();

      // Detect error type and extract fields based on what follows
      let error_type: ParsedError['error_type'] = 'unknown';
      let part_spec = '';
      let subtest: string | null = null;
      let measured_raw = '';
      let nominal_raw = '';
      let high_limit_raw = '';
      let low_limit_raw = '';
      let threshold_raw: string | null = null;
      let unit = '';

      if (/^vector\s*=/i.test(defLine)) {
        // Digital pin failure: vector = <number>
        error_type = 'digital_pin';
        // Skip past the digital pin block (Status, Pass/Fail error, BRRCC NODE PIN, pin list)
        j++;
        // Consume lines until next separator or HAS FAILED
        while (j < lines.length) {
          const dl = lines[j].trimEnd();
          if (dl === SEPARATOR || dl.includes('HAS FAILED')) break;
          j++;
        }
      } else if (/^Subtest:/i.test(defLine)) {
        // Resistance/shorts check with subtest
        error_type = 'shorts_report';
        subtest = defLine.replace(/^Subtest:\s*/i, '').trim();
        j++;
        // measured_raw
        const measLine = (lines[j] ?? '').trimEnd();
        measured_raw = measLine.replace(/^Measured:\s*/i, '').trim();
        j++;
        // threshold_raw
        const threshLine = (lines[j] ?? '').trimEnd();
        if (/^Threshold:/i.test(threshLine)) {
          threshold_raw = threshLine.replace(/^Threshold:\s*/i, '').trim();
          j++;
        }
        // unit line: "Jumper Resistance in OHMS" etc.
        const unitLine = (lines[j] ?? '').trimEnd();
        const unitMatch = unitLine.match(/\bin\s+(FARADS|OHMS)\b/i);
        unit = unitMatch ? unitMatch[1].toUpperCase() : '';
        j++;
      } else {
        // Standard analog or threshold-style (jumper resistance) failure.
        // Try to extract COMP=value from the definition line first.
        const defMatch = defLine.match(/^[^=]+=([^\s]+)(?:\s+Part#\s+(.+))?$/i);
        part_spec = defMatch ? defMatch[1] : '';
        j++;

        // Content-based scan — detects fields by line prefix rather than position.
        // This correctly routes Threshold: lines for jumper-resistance blocks while
        // leaving standard analog blocks (Measured/Nominal/High Limit/Low Limit) intact.
        while (j < lines.length) {
          const scanLine = (lines[j] ?? '').trimEnd();
          if (scanLine === SEPARATOR || /\bHAS FAILED\b/i.test(scanLine)) break;
          if (/^Measured:\s*/i.test(scanLine)) {
            measured_raw = scanLine.replace(/^Measured:\s*/i, '').trim();
          } else if (/^Threshold:\s*/i.test(scanLine)) {
            threshold_raw = scanLine.replace(/^Threshold:\s*/i, '').trim();
          } else if (/^Nominal:\s*/i.test(scanLine)) {
            nominal_raw = scanLine.replace(/^Nominal:\s*/i, '').trim();
          } else if (/^High Limit:\s*/i.test(scanLine)) {
            high_limit_raw = scanLine.replace(/^High Limit:\s*/i, '').trim();
          } else if (/^Low Limit:\s*/i.test(scanLine)) {
            low_limit_raw = scanLine.replace(/^Low Limit:\s*/i, '').trim();
          }
          const unitMatch = scanLine.match(/\bin\s+(FARADS|OHMS)\b/i);
          if (unitMatch) {
            unit = unitMatch[1].toUpperCase();
          }
          j++;
        }

        // Analog: has FARADS/OHMS unit AND no threshold value.
        // Threshold-style (jumper resistance): has OHMS unit but also has threshold_raw → unknown.
        error_type = (unit === 'FARADS' || unit === 'OHMS') && !threshold_raw ? 'analog' : 'unknown';
      }

      // Capture the raw lines that produced this error record (from HAS FAILED up to j).
      const raw_block = lines.slice(blockStart, j).join('\n');

      // Deduplicate by location (keep first occurrence)
      if (!errorMap.has(location)) {
        errorMap.set(location, {
          error_type,
          location,
          subtest,
          part_spec,
          unit,
          measured_raw,
          nominal_raw,
          high_limit_raw,
          low_limit_raw,
          threshold_raw,
          raw_block,
        });
      }
    }

    i = j;
  }

  return {
    serial_number,
    product_id,
    product_name: meta['family'] ?? '',
    rev,
    mac_address:  meta['mac'] ?? '',
    result:       result ?? 'fail',
    start_time,
    end_time,
    operator_id:  meta['operator id'] ?? '',
    tester:       meta['tester'] ?? '',
    fixture_id:   meta['fixture_id'] ?? '',
    source_file:  filename,
    errors:       Array.from(errorMap.values()),
  };
}
