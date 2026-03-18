type GuardResult = { safe: true } | { safe: false; reason: string };

// Keywords that must not appear anywhere in the query
const FORBIDDEN_KEYWORDS = [
  'DROP',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'ALTER',
  'CREATE',
  'GRANT',
  'REVOKE',
  'EXECUTE',
  'COPY',
];

const FORBIDDEN_STRINGS = [
  '--',
  '/*',
  'supabase_admin',
  'service_role',
  'pg_',
];

export function guardSql(sql: string): GuardResult {
  const trimmed = sql.trimStart();

  // Must start with SELECT
  if (!/^SELECT\b/i.test(trimmed)) {
    return { safe: false, reason: 'SQL must start with SELECT' };
  }

  // Must be a single statement — no semicolons except optionally at the very end
  const withoutTrailingSemi = trimmed.replace(/;\s*$/, '');
  if (withoutTrailingSemi.includes(';')) {
    return { safe: false, reason: 'SQL must be a single statement (no internal semicolons)' };
  }

  // Check for forbidden keywords (whole-word match, case-insensitive)
  const upper = sql.toUpperCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`);
    if (re.test(upper)) {
      return { safe: false, reason: `SQL contains forbidden keyword: ${kw}` };
    }
  }

  // Check for forbidden literal strings (case-insensitive)
  const lower = sql.toLowerCase();
  for (const str of FORBIDDEN_STRINGS) {
    if (lower.includes(str.toLowerCase())) {
      return { safe: false, reason: `SQL contains forbidden string: "${str}"` };
    }
  }

  return { safe: true };
}
