import React from 'react';
import type { TestRecord } from '@/lib/testUtils';

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
};

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
}: DetailTableProps) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return (
    <section className="section card">
      <div className="pagination" style={{ justifyContent: 'space-between', width: '100%' }}>
        <h2>{title}</h2>
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
                <td>{row.test_errors.length > 0 ? row.test_errors.map((e) => e.location).join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
