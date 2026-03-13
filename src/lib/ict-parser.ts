/**
 * ict-parser.ts — pure ICT log parser, no DB dependencies.
 *
 * Log format (one file = one test session):
 *   - One or more test "runs" separated by 40-dash dividers.
 *     Each run appears TWICE (ICT tester artifact); we deduplicate by component name.
 *   - A single metadata section at end of file, lines prefixed with &v1S / &v2S / &v3S.
 */

export interface ParsedTest {
  board_id: string;       // "465136J+2609F808HH"  (canonical: + not _)
  product_id: string;     // part before +: "465136J"
  family: string;
  part_number: string;    // "8215911"
  revision: string;       // "13"
  mac_address: string;
  result: 'PASS' | 'FAIL';
  start_time: Date;
  end_time: Date;
  operator_id: string;
  tester: string;
  fixture_id: string;
  testplan: string;
  platform: string;
  errors: ParsedError[];
}

export interface ParsedError {
  component: string;
  component_value: string;
  part_number: string;
  measured_raw: string;
  measured: number | null;
  nominal_raw: string;
  nominal: number | null;
  high_limit_raw: string;
  high_limit: number | null;
  low_limit_raw: string;
  low_limit: number | null;
  unit: string;
}

const SEPARATOR = '----------------------------------------';

/**
 * Convert a value string with optional SI suffix to its SI base unit.
 * Suffixes: u → ×10⁻⁶, p → ×10⁻¹², k → ×10³, M → ×10⁶
 * Returns null when the string cannot be parsed.
 */
export function parseSiValue(raw: string): number | null {
  const match = raw.trim().match(/^([\d.]+)([upkM]?)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = match[2];
  const multipliers: Record<string, number> = { u: 1e-6, p: 1e-12, k: 1e3, M: 1e6, '': 1 };
  return num * (multipliers[suffix] ?? 1);
}

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
 * @param filename  Original filename, e.g. "465136J_2609F808HH.log".
 *                  The first underscore is replaced with + to form board_id.
 * @param content   Full file text (LF or CRLF).
 */
export function parseLog(filename: string, content: string): ParsedTest {
  const lines = content.split(/\r?\n/);

  // --- board_id from filename ---
  const base = filename.replace(/\.log$/i, '');
  const firstUnderscore = base.indexOf('_');
  const board_id =
    firstUnderscore !== -1
      ? base.slice(0, firstUnderscore) + '+' + base.slice(firstUnderscore + 1)
      : base;
  const product_id = board_id.split('+')[0] ?? board_id;

  // --- collect metadata from &v[123]S lines ---
  const meta: Record<string, string> = {};
  let result: 'PASS' | 'FAIL' | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    // Metadata lines are PCL escape sequences: ESC (0x1b) + &v2S + space + content
    const metaMatch = line.match(/^\x1b&v[123]S\s*(.*)/);
    if (!metaMatch) continue;

    const value = metaMatch[1].trim();

    if (value.includes('BOARD ICT PASS')) { result = 'PASS'; continue; }
    if (value.includes('BOARD ICT FAIL')) { result = 'FAIL'; continue; }
    if (value.startsWith('Testplan-')) { meta['testplan'] = value.slice('Testplan-'.length); continue; }
    if (value.startsWith('***') || value.startsWith('###')) continue; // decorative

    const colonIdx = value.indexOf(':');
    if (colonIdx === -1) continue;
    const key = value.slice(0, colonIdx).trim().toLowerCase();
    const val = value.slice(colonIdx + 1).trim();
    meta[key] = val;
  }

  // P/N line is "8215911 Rev:13"
  let part_number = '';
  let revision = '';
  const pn = meta['p/n'] ?? '';
  const revMatch = pn.match(/^(.+?)\s+Rev:(.+)$/);
  if (revMatch) {
    part_number = revMatch[1].trim();
    revision = revMatch[2].trim();
  } else {
    part_number = pn;
  }

  const start_time = meta['st'] ? parseTimestamp(meta['st']) : new Date(0);
  const end_time = meta['et'] ? parseTimestamp(meta['et']) : new Date(0);

  // --- collect error blocks from all runs, dedup by component name ---
  const errorMap = new Map<string, ParsedError>();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (line !== SEPARATOR) { i++; continue; }

    // We're at a separator — peek ahead to see if this starts an error block
    // A separator followed by a "X HAS FAILED" line (after skipping blank/machine/date lines)
    let j = i + 1;

    // Skip equipment identifier (C2-ROTFIRM4.1) and date line
    while (j < lines.length && lines[j].trimEnd() !== SEPARATOR && !lines[j].includes('HAS FAILED')) {
      j++;
    }

    if (j >= lines.length || lines[j].trimEnd() === SEPARATOR) { i++; continue; }

    // Parse consecutive error blocks until next run header or end
    while (j < lines.length) {
      const l = lines[j].trimEnd();

      if (l === SEPARATOR) {
        // Could be: end of error block, start of next error, or end of run
        // Peek at next non-empty line
        let k = j + 1;
        while (k < lines.length && lines[k].trim() === '') k++;
        if (k >= lines.length) break;
        const next = lines[k].trimEnd();
        // If next line starts a new error: continue parsing
        if (next.includes('HAS FAILED') || next === 'DEVICES IN PARALLEL') {
          j = k;
          continue;
        }
        // Otherwise end of this run block
        break;
      }

      if (l === 'DEVICES IN PARALLEL') { j++; continue; }

      const failedMatch = l.match(/^(\S+)\s+HAS FAILED\s*$/i);
      if (!failedMatch) { j++; continue; }

      const component = failedMatch[1].toLowerCase();
      j++;

      // Next line: COMPONENT=value Part# part#
      const defLine = (lines[j] ?? '').trimEnd();
      const defMatch = defLine.match(/^[^=]+=([^\s]+)\s+Part#\s+(.+)$/i);
      const component_value = defMatch ? defMatch[1] : '';
      const part_number_err = defMatch ? defMatch[2].trim() : '';
      j++;

      const measLine = (lines[j] ?? '').trimEnd();
      const measured_raw = measLine.replace(/^Measured:\s*/i, '').trim();
      j++;

      const nomLine = (lines[j] ?? '').trimEnd();
      const nominal_raw = nomLine.replace(/^Nominal:\s*/i, '').trim();
      j++;

      const hiLine = (lines[j] ?? '').trimEnd();
      const high_limit_raw = hiLine.replace(/^High Limit:\s*/i, '').trim();
      j++;

      const loLine = (lines[j] ?? '').trimEnd();
      const low_limit_raw = loLine.replace(/^Low Limit:\s*/i, '').trim();
      j++;

      const unitLine = (lines[j] ?? '').trimEnd();
      // e.g. "Capacitance in FARADS" or "Resistance in OHMS"
      const unitMatch = unitLine.match(/\bin\s+(FARADS|OHMS)\b/i);
      const unit = unitMatch ? unitMatch[1].toUpperCase() : unitLine.trim();
      j++;

      // Deduplicate by component name (keep first occurrence)
      if (!errorMap.has(component)) {
        errorMap.set(component, {
          component,
          component_value,
          part_number: part_number_err,
          measured_raw,
          measured: parseSiValue(measured_raw),
          nominal_raw,
          nominal: parseSiValue(nominal_raw),
          high_limit_raw,
          high_limit: parseSiValue(high_limit_raw),
          low_limit_raw,
          low_limit: parseSiValue(low_limit_raw),
          unit,
        });
      }
    }

    i = j;
  }

  return {
    board_id,
    product_id,
    family: meta['family'] ?? '',
    part_number,
    revision,
    mac_address: meta['mac'] ?? '',
    result: result ?? 'FAIL',
    start_time,
    end_time,
    operator_id: meta['operator id'] ?? '',
    tester: meta['tester'] ?? '',
    fixture_id: meta['fixture_id'] ?? '',
    testplan: meta['testplan'] ?? '',
    platform: meta['pf'] ?? '',
    errors: Array.from(errorMap.values()),
  };
}
