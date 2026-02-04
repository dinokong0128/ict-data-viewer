import React from 'react';
import type { SheetRow } from '@/lib/sheet';

type ColumnDef = {
  index: number;
  label: string;
};

type DetailTableProps = {
  rows: SheetRow[];
  columns: ColumnDef[];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  title: string;
};

export function DetailTable({ rows, columns, page, pageSize, onPageChange, title }: DetailTableProps) {
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
              {columns.map((column) => (
                <th key={column.index}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIndex) => (
              <tr key={`${row.dateKey}-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={column.index}>{row.raw[column.index] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
