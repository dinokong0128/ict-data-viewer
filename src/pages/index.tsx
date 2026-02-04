import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartPanel, type ChartDataset } from '@/components/ChartPanel';
import { DetailTable } from '@/components/DetailTable';
import { FilterPanel } from '@/components/FilterPanel';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildErrorCounts,
  buildState,
  buildSummary,
  fetchSheetData,
  filterRowsByRange,
  formatDate,
  getCategoryOptions,
  getRangeBounds,
  groupByDate,
  SHEET_ID,
  type SheetRow,
  type SheetState
} from '@/lib/sheet';

const DEFAULT_GID = '1147914701';
const PAGE_SIZE = 12;

type ChartConfig = {
  labels: string[];
  datasets: ChartDataset[];
  chartType: 'bar' | 'line';
};

export default function HomePage() {
  const [gid, setGid] = useState(DEFAULT_GID);
  const [sheetState, setSheetState] = useState<SheetState | null>(null);
  const [status, setStatus] = useState<string | null>('Loading data...');
  const [rangePreset, setRangePreset] = useState('30');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [metric, setMetric] = useState('boards');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [categorySelection, setCategorySelection] = useState('top');
  const [selectedErrors, setSelectedErrors] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      setStatus('Loading data...');
      const result = await fetchSheetData(gid.trim() || DEFAULT_GID);
      const nextState = buildState(result);
      setSheetState(nextState);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load data.');
      setSheetState(null);
    }
  }, [gid]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!sheetState) {
      return;
    }
    const { minDate, maxDate } = getRangeBounds(sheetState.rows);
    const rangeDays = Number(rangePreset);
    if (!Number.isNaN(rangeDays)) {
      const start = new Date(maxDate);
      start.setDate(start.getDate() - (rangeDays - 1));
      const boundedStart = start < minDate ? minDate : start;
      setStartDate(formatDate(boundedStart));
      setEndDate(formatDate(maxDate));
    }
  }, [rangePreset, sheetState]);

  const activeRange = useMemo(() => {
    if (!startDate || !endDate) {
      return null;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [startDate, endDate]);

  const rowsInRange = useMemo(() => {
    if (!sheetState || !activeRange) {
      return [] as SheetRow[];
    }
    return filterRowsByRange(sheetState.rows, activeRange.start, activeRange.end);
  }, [sheetState, activeRange]);

  const summaryItems = useMemo(() => {
    if (!sheetState || !rowsInRange.length) {
      return [];
    }
    return buildSummary(rowsInRange, sheetState.mapping);
  }, [sheetState, rowsInRange]);

  const categoryOptions = useMemo(() => {
    if (!sheetState || !rowsInRange.length) {
      return [];
    }
    if (metric === 'tester' && sheetState.mapping.tester !== undefined) {
      return getCategoryOptions(rowsInRange, sheetState.mapping.tester);
    }
    if (metric === 'fixture' && sheetState.mapping.fixture !== undefined) {
      return getCategoryOptions(rowsInRange, sheetState.mapping.fixture);
    }
    if (metric === 'operator' && sheetState.mapping.operator !== undefined) {
      return getCategoryOptions(rowsInRange, sheetState.mapping.operator);
    }
    return [];
  }, [sheetState, rowsInRange, metric]);

  const errorInfo = useMemo(() => {
    if (!rowsInRange.length) {
      return { errors: [], counts: new Map<string, number>() };
    }
    return buildErrorCounts(rowsInRange);
  }, [rowsInRange]);

  const chartConfig = useMemo<ChartConfig>(() => {
    if (!rowsInRange.length) {
      return { labels: [], datasets: [], chartType: 'bar' };
    }

    const labels = Array.from(groupByDate(rowsInRange).keys()).sort();

    if (metric === 'boards') {
      const counts = groupByDate(rowsInRange);
      return {
        labels,
        datasets: [
          {
            label: 'Boards tested',
            data: labels.map((label) => counts.get(label) || 0),
            backgroundColor: 'rgba(37, 99, 235, 0.7)'
          }
        ],
        chartType: 'bar'
      };
    }

    if (metric === 'errors') {
      const selected = selectedErrors.size === 0 ? errorInfo.errors : errorInfo.errors.filter((error) => selectedErrors.has(error));
      const data = labels.map((label) =>
        selected.reduce((sum, error) => sum + (errorInfo.counts.get(`${label}::${error}`) || 0), 0)
      );
      return {
        labels,
        datasets: [
          {
            label: selected.length ? `Errors (${selected.length} types)` : 'Errors',
            data,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.4)'
          }
        ],
        chartType: 'line'
      };
    }

    if (!categoryOptions.length) {
      return { labels, datasets: [], chartType: 'bar' };
    }

    if (categorySelection !== 'top' && categoryOptions.includes(categorySelection)) {
      const data = labels.map((label) =>
        rowsInRange.filter((row) => row.dateKey === label && String(row.raw[sheetState?.mapping[metric] ?? 0]) === categorySelection).length
      );
      return {
        labels,
        datasets: [
          {
            label: categorySelection,
            data,
            backgroundColor: 'rgba(37, 99, 235, 0.7)'
          }
        ],
        chartType: 'bar'
      };
    }

    const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];
    const datasets = categoryOptions.slice(0, 5).map((category, index) => {
      const data = labels.map((label) =>
        rowsInRange.filter((row) => row.dateKey === label && String(row.raw[sheetState?.mapping[metric] ?? 0]) === category).length
      );
      return {
        label: category,
        data,
        backgroundColor: palette[index % palette.length],
        stack: 'categories'
      };
    });

    return { labels, datasets, chartType: 'bar' };
  }, [rowsInRange, metric, selectedErrors, errorInfo, categoryOptions, categorySelection, sheetState]);

  const tableRows = useMemo(() => {
    if (!rowsInRange.length) {
      return [];
    }
    if (!selectedDate) {
      return rowsInRange;
    }
    return rowsInRange.filter((row) => row.dateKey === selectedDate);
  }, [rowsInRange, selectedDate]);

  const tableColumns = useMemo(() => {
    if (!sheetState) {
      return [] as Array<{ index: number; label: string }>;
    }
    const indexes = [
      sheetState.dateColumn,
      sheetState.mapping.sn,
      sheetState.mapping.mac,
      sheetState.mapping.family,
      sheetState.mapping.pn,
      sheetState.mapping.tester,
      sheetState.mapping.operator,
      sheetState.mapping.fixture,
      sheetState.mapping.other,
      sheetState.mapping.result
    ].filter((value): value is number => value !== undefined);
    return Array.from(new Set(indexes)).map((index) => ({ index, label: sheetState.columns[index] }));
  }, [sheetState]);

  const tableTitle = selectedDate
    ? `Details for ${selectedDate} (${tableRows.length} rows)`
    : `Details for selected range (${tableRows.length} rows)`;

  const statusMessage = status || (rowsInRange.length === 0 && sheetState ? 'No rows match the selected range.' : null);

  return (
    <main>
      <header>
        <div>
          <h1>ICT Data Viewer</h1>
          <p>Visualize tester output from the Google Sheet without downloading data locally.</p>
        </div>
        <div>
          <strong>Sheet:</strong> {SHEET_ID}
        </div>
      </header>

      <FilterPanel
        gid={gid}
        onGidChange={setGid}
        onReload={loadData}
        rangePreset={rangePreset}
        onRangePresetChange={(value) => {
          setRangePreset(value);
          if (value === 'custom') {
            return;
          }
        }}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={(value) => {
          setStartDate(value);
          setRangePreset('custom');
        }}
        onEndDateChange={(value) => {
          setEndDate(value);
          setRangePreset('custom');
        }}
        metric={metric}
        onMetricChange={(value) => {
          setMetric(value);
          setSelectedDate(null);
          setCategorySelection('top');
          setSelectedErrors(new Set());
        }}
        categoryOptions={categoryOptions}
        categorySelection={categorySelection}
        onCategoryChange={setCategorySelection}
        errorOptions={errorInfo.errors}
        selectedErrors={selectedErrors}
        onErrorToggle={(value) => {
          const next = new Set(selectedErrors);
          if (next.has(value)) {
            next.delete(value);
          } else {
            next.add(value);
          }
          setSelectedErrors(next);
        }}
      />

      <StatusBanner message={statusMessage} />

      <section className="section chart-section">
        <ChartPanel
          labels={chartConfig.labels}
          datasets={chartConfig.datasets}
          chartType={chartConfig.chartType}
          onSelectDate={(label) => {
            setSelectedDate(label);
            setPage(1);
          }}
        />
        <div className="card">
          <h2>Range summary</h2>
          <ul className="summary-list">
            {summaryItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <DetailTable
        rows={tableRows}
        columns={tableColumns}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        title={tableTitle}
      />

      <footer>
        Data source: Google Sheets. The app reads the sheet live and does not persist any data locally.
      </footer>
    </main>
  );
}
