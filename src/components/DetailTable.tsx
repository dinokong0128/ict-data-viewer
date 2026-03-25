import React, { useCallback, useState } from 'react';
import type { TestErrorRecord, TestRecord } from '@/lib/testUtils';

type DetailTableProps = {
  rows: TestRecord[];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  title: string;
  onFixtureClick?: (value: string) => void;
  onSnClick?: (value: string) => void;
  onTesterClick?: (value: string) => void;
  activeFixture?: string;
  activeSn?: string;
  activeTester?: string;
  textFilter?: string;
  onTextFilterChange?: (value: string) => void;
  authToken?: string;
  /** When provided, drives pagination from the server-reported total instead of rows.length.
   *  rows is assumed to already be the current page (no client-side slicing). */
  totalRows?: number;
};

const COLLAPSED_COUNT = 3;

function dash(value: string | null | undefined): string {
  return value == null || value === '' ? '—' : value;
}

function ErrorsCell({
  errorLocations,
  errors,
  expanded,
  onToggle,
  loading,
}: {
  errorLocations: string[];
  errors: TestErrorRecord[];
  expanded: boolean;
  onToggle: () => void;
  loading: boolean;
}) {
  if (errorLocations.length === 0 && errors.length === 0) return <span>—</span>;

  const locations = errors.length > 0 ? errors.map((e) => e.location) : errorLocations;

  if (!expanded) {
    const display = locations.length <= COLLAPSED_COUNT
      ? locations.join(', ')
      : locations.slice(0, COLLAPSED_COUNT).join(', ');
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>{display}</span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand errors"
          title="Show error details"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#4338ca', padding: '0 2px', lineHeight: 1 }}
        >
          {locations.length > COLLAPSED_COUNT ? `+${locations.length - COLLAPSED_COUNT}` : ''}
          <span style={{ fontSize: '12px', verticalAlign: 'middle' }}> ▶</span>
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>Loading error details...</span>
      </div>
    );
  }

  // Expanded — if full errors are available show the detail table, otherwise just locations
  if (errors.length > 0) {
    return (
      <div>
        <table style={{ fontSize: '12px', borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '2px 6px 2px 0', whiteSpace: 'nowrap' }}>Error</th>
              <th style={{ textAlign: 'left', padding: '2px 6px 2px 0', whiteSpace: 'nowrap' }}>Measured</th>
              <th style={{ textAlign: 'left', padding: '2px 6px 2px 0', whiteSpace: 'nowrap' }}>High limit</th>
              <th style={{ textAlign: 'left', padding: '2px 6px 2px 0', whiteSpace: 'nowrap' }}>Low limit</th>
              <th style={{ textAlign: 'left', padding: '2px 6px 2px 0', whiteSpace: 'nowrap' }}>Threshold</th>
              <th style={{ textAlign: 'left', padding: '2px 6px 2px 0', whiteSpace: 'nowrap' }}>Unit</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((e) => (
              <tr key={e.location}>
                <td style={{ padding: '2px 6px 2px 0' }}>{e.location}</td>
                <td style={{ padding: '2px 6px 2px 0' }}>{dash(e.measured_raw)}</td>
                <td style={{ padding: '2px 6px 2px 0' }}>{dash(e.high_limit_raw)}</td>
                <td style={{ padding: '2px 6px 2px 0' }}>{dash(e.low_limit_raw)}</td>
                <td style={{ padding: '2px 6px 2px 0' }}>{dash(e.threshold_raw)}</td>
                <td style={{ padding: '2px 6px 2px 0' }}>{dash(e.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={onToggle}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#4338ca', padding: '2px 0' }}
        >
          Show less
        </button>
      </div>
    );
  }

  // Fallback: only locations available (fetch may have returned empty)
  return (
    <div>
      <span>{locations.join(', ')}</span>
      <div>
        <button
          type="button"
          onClick={onToggle}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#4338ca', padding: '2px 0' }}
        >
          Show less
        </button>
      </div>
    </div>
  );
}

export function DetailTable({
  rows,
  page,
  pageSize,
  onPageChange,
  title,
  onFixtureClick,
  onSnClick,
  onTesterClick,
  activeFixture,
  activeSn,
  activeTester,
  textFilter,
  onTextFilterChange,
  authToken,
  totalRows,
}: DetailTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [fetchedErrors, setFetchedErrors] = useState<Map<number, TestErrorRecord[]>>(new Map());
  const [loadingRows, setLoadingRows] = useState<Set<number>>(new Set());
  const totalPages = Math.max(1, Math.ceil((totalRows ?? rows.length) / pageSize));
  const currentPage = Math.min(page, totalPages);
  // When totalRows is provided, rows is already the current page — no slicing needed
  const pageRows = totalRows != null ? rows : rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleRow = useCallback((id: number, row: TestRecord) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      next.add(id);

      // Fetch error details on-demand if not already loaded
      if (row.test_errors.length === 0 && row.error_locations.length > 0 && !fetchedErrors.has(id) && !loadingRows.has(id)) {
        setLoadingRows((p) => new Set(p).add(id));
        const headers: Record<string, string> = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        fetch(`/api/test-errors?testIds=${id}`, { headers })
          .then((res) => res.ok ? res.json() as Promise<{ errors: Record<string, TestErrorRecord[]> }> : Promise.resolve({ errors: {} as Record<string, TestErrorRecord[]> }))
          .then((body) => {
            setFetchedErrors((prev) => {
              const next = new Map(prev);
              next.set(id, body.errors[String(id)] ?? []);
              return next;
            });
          })
          .catch(() => {
            // On failure, store empty array so we don't retry endlessly
            setFetchedErrors((prev) => {
              const next = new Map(prev);
              next.set(id, []);
              return next;
            });
          })
          .finally(() => {
            setLoadingRows((p) => {
              const next = new Set(p);
              next.delete(id);
              return next;
            });
          });
      }

      return next;
    });
  }, [authToken, fetchedErrors, loadingRows]);

  function getRowErrors(row: TestRecord): TestErrorRecord[] {
    if (row.test_errors.length > 0) return row.test_errors;
    return fetchedErrors.get(row.id) ?? [];
  }

  return (
    <section className="section card">
      <div className="pagination" style={{ justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2>{title}</h2>
          {onTextFilterChange && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="text"
                value={textFilter ?? ''}
                onChange={(e) => onTextFilterChange(e.target.value)}
                placeholder="Search SN, product, tester, fixture, operator, errors..."
                className="header-select"
                aria-label="Filter table rows"
                style={{ fontSize: '13px', minWidth: '280px' }}
              />
              {textFilter && (
                <button
                  type="button"
                  onClick={() => onTextFilterChange('')}
                  aria-label="Clear filter"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#6b7280' }}
                >
                  ✕
                </button>
              )}
            </span>
          )}
        </div>
        <div className="pagination">
          <button type="button" onClick={() => onPageChange(Math.max(1, currentPage - 1))}>
            Prev
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button type="button" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}>
            Next
          </button>
        </div>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>SN</th>
              <th>Rev</th>
              <th>Product</th>
              <th>Result</th>
              <th>Tester</th>
              <th>Fixture</th>
              <th>Operator</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id}>
                <td>{row.start_time.slice(0, 10)}</td>
                <td>
                  {onSnClick ? (
                    <button
                      type="button"
                      onClick={() => onSnClick(row.serial_number)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        textDecoration: 'underline dotted',
                        fontWeight: activeSn === row.serial_number ? 'bold' : undefined,
                        color: 'inherit',
                        font: 'inherit',
                      }}
                    >
                      {row.serial_number}
                    </button>
                  ) : row.serial_number}
                </td>
                <td>{row.rev}</td>
                <td>{row.product_name}</td>
                <td style={{ color: row.result === 'pass' ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                  {row.result}
                </td>
                <td>
                  {onTesterClick ? (
                    <button
                      type="button"
                      onClick={() => onTesterClick(row.tester)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        textDecoration: 'underline dotted',
                        fontWeight: activeTester === row.tester ? 'bold' : undefined,
                        color: 'inherit',
                        font: 'inherit',
                      }}
                    >
                      {row.tester}
                    </button>
                  ) : row.tester}
                </td>
                <td>
                  {onFixtureClick ? (
                    <button
                      type="button"
                      onClick={() => onFixtureClick(row.fixture_id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        textDecoration: 'underline dotted',
                        fontWeight: activeFixture === row.fixture_id ? 'bold' : undefined,
                        color: 'inherit',
                        font: 'inherit',
                      }}
                    >
                      {row.fixture_id}
                    </button>
                  ) : row.fixture_id}
                </td>
                <td>{row.operator_id}</td>
                <td>
                  <ErrorsCell
                    errorLocations={row.error_locations}
                    errors={getRowErrors(row)}
                    expanded={expandedRows.has(row.id)}
                    onToggle={() => toggleRow(row.id, row)}
                    loading={loadingRows.has(row.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
