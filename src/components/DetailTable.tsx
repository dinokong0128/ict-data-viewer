import React, { useState } from 'react';
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
};

const COLLAPSED_COUNT = 3;

function dash(value: string | null | undefined): string {
  return value == null || value === '' ? '—' : value;
}

function ErrorsCell({ errors, expanded, onToggle }: { errors: TestErrorRecord[]; expanded: boolean; onToggle: () => void }) {
  if (errors.length === 0) return <span>—</span>;

  if (errors.length <= COLLAPSED_COUNT) {
    return <span>{errors.map((e) => e.location).join(', ')}</span>;
  }

  if (!expanded) {
    return (
      <div>
        <span>{errors.slice(0, COLLAPSED_COUNT).map((e) => e.location).join(', ')}</span>
        <div>
          <button
            type="button"
            onClick={onToggle}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#4338ca', padding: '2px 0' }}
          >
            Show all ({errors.length})
          </button>
        </div>
      </div>
    );
  }

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
}: DetailTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  function toggleRow(id: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
                    errors={row.test_errors}
                    expanded={expandedRows.has(row.id)}
                    onToggle={() => toggleRow(row.id)}
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
