/**
 * @jest-environment node
 */
import { guardSql } from '../sql-guard';

describe('guardSql — valid SELECT', () => {
  it('passes a simple SELECT', () => {
    const result = guardSql('SELECT COUNT(*) FROM tests');
    expect(result).toEqual({ safe: true });
  });

  it('passes a SELECT with joins and WHERE', () => {
    const result = guardSql(
      "SELECT tests.fixture_id, COUNT(*) FROM tests JOIN boards ON boards.id = tests.board_id WHERE tests.start_time >= now() - interval '7 days' GROUP BY tests.fixture_id ORDER BY 2 DESC LIMIT 200"
    );
    expect(result).toEqual({ safe: true });
  });

  it('passes a SELECT with optional trailing semicolon', () => {
    const result = guardSql('SELECT 1;');
    expect(result).toEqual({ safe: true });
  });

  it('is case-insensitive for SELECT keyword', () => {
    expect(guardSql('select * from tests limit 1')).toEqual({ safe: true });
    expect(guardSql('Select * from tests limit 1')).toEqual({ safe: true });
  });
});

describe('guardSql — forbidden: does not start with SELECT', () => {
  it('rejects a query starting with FROM', () => {
    const result = guardSql('FROM tests SELECT *');
    expect(result.safe).toBe(false);
    expect((result as { safe: false; reason: string }).reason).toMatch(/SELECT/i);
  });

  it('rejects empty string', () => {
    expect(guardSql('')).toMatchObject({ safe: false });
  });
});

describe('guardSql — forbidden: DROP', () => {
  it('rejects SQL containing DROP keyword (single statement)', () => {
    // No semicolon so the DROP keyword check fires (not the semicolon check)
    const result = guardSql('SELECT * FROM tests WHERE DROP IS NOT NULL');
    expect(result.safe).toBe(false);
    expect((result as { safe: false; reason: string }).reason).toMatch(/DROP/i);
  });

  it('rejects SQL with DROP TABLE (caught by multi-statement or keyword check)', () => {
    // Semicolon fires first, but the query is still rejected
    expect(guardSql('SELECT 1; DROP TABLE boards')).toMatchObject({ safe: false });
  });
});

describe('guardSql — forbidden: multiple statements', () => {
  it('rejects SQL with internal semicolon before DELETE', () => {
    const result = guardSql('SELECT 1; DELETE FROM tests');
    expect(result.safe).toBe(false);
    // Either multiple-statement or DELETE keyword is the reason
    expect((result as { safe: false; reason: string }).reason).toBeTruthy();
  });

  it('rejects SQL with two SELECTs separated by semicolon', () => {
    const result = guardSql('SELECT 1; SELECT 2');
    expect(result.safe).toBe(false);
  });
});

describe('guardSql — forbidden: comment injection', () => {
  it('rejects SQL containing --', () => {
    const result = guardSql("SELECT * FROM tests -- WHERE 1=2");
    expect(result.safe).toBe(false);
    expect((result as { safe: false; reason: string }).reason).toMatch(/--/);
  });

  it('rejects SQL containing /* block comment */', () => {
    const result = guardSql('SELECT /* comment */ * FROM tests');
    expect(result.safe).toBe(false);
    expect((result as { safe: false; reason: string }).reason).toMatch(/\/\*/);
  });
});

describe('guardSql — forbidden keywords', () => {
  const mutationCases: [string, string][] = [
    ['INSERT', 'SELECT 1 UNION ALL INSERT INTO tests VALUES()'],
    ['UPDATE', 'SELECT * FROM tests; UPDATE tests SET result = NULL'],
    ['DELETE', 'SELECT 1; DELETE FROM tests'],
    ['TRUNCATE', 'SELECT 1; TRUNCATE TABLE tests'],
    ['ALTER', 'SELECT 1; ALTER TABLE tests ADD COLUMN foo TEXT'],
    ['CREATE', 'SELECT 1; CREATE TABLE evil AS SELECT * FROM tests'],
    ['GRANT', 'SELECT 1; GRANT ALL ON tests TO evil_user'],
    ['REVOKE', 'SELECT 1; REVOKE ALL ON tests FROM anon'],
    ['EXECUTE', 'SELECT 1; EXECUTE proc()'],
    ['COPY', 'COPY tests TO STDOUT'],
  ];

  it.each(mutationCases)('rejects SQL containing %s keyword', (_kw, sql) => {
    expect(guardSql(sql)).toMatchObject({ safe: false });
  });
});

describe('guardSql — forbidden strings', () => {
  it('rejects SQL referencing supabase_admin', () => {
    expect(guardSql('SELECT * FROM supabase_admin.tests')).toMatchObject({ safe: false });
  });

  it('rejects SQL referencing service_role', () => {
    expect(guardSql('SELECT set_config(\'role\', \'service_role\', false)')).toMatchObject({ safe: false });
  });

  it('rejects SQL referencing pg_ system tables', () => {
    expect(guardSql('SELECT * FROM pg_tables')).toMatchObject({ safe: false });
  });
});
