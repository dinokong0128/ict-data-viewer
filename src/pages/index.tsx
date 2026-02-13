import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChartPanel, type ChartDataset } from '@/components/ChartPanel';
import { DetailTable } from '@/components/DetailTable';
import { FilterPanel } from '@/components/FilterPanel';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildErrorCounts,
  buildState,
  buildSummary,
  buildUtilization,
  filterRowsByRange,
  formatDate,
  getCategoryOptions,
  groupByDate,
  SHEET_ID,
  type SheetRow,
  type SheetState,
  type UtilizationEntry
} from '@/lib/sheet';
import { fetchData, getDataSourceType } from '@/lib/adapters';
import { generateSampleData } from '@/lib/sampleData';
const PAGE_SIZE = 12;

type ChartConfig = {
  labels: string[];
  datasets: ChartDataset[];
  chartType: 'bar' | 'line';
};

export default function HomePage() {
  const [sheetState, setSheetState] = useState<SheetState | null>(null);
  const [status, setStatus] = useState<string | null>('Loading data...');
  const [rangePreset, setRangePreset] = useState('7');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [metric, setMetric] = useState('boards');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [categorySelection, setCategorySelection] = useState('top');
  const [selectedErrors, setSelectedErrors] = useState<Set<string>>(new Set());

  const [demoMode, setDemoMode] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setStatus('Loading data...');
      const sourceType = getDataSourceType();
      if (sourceType === 'sheet' && !SHEET_ID) {
        const sample = generateSampleData();
        const nextState = buildState(sample);
        setSheetState(nextState);
        setDemoMode(true);
        setStatus(null);
        return;
      }
      const result = await fetchData();
      const nextState = buildState(result);
      setSheetState(nextState);
      setDemoMode(false);
      setStatus(null);
    } catch (error) {
      // If live fetch fails, fall back to sample data so the app still works
      try {
        const sample = generateSampleData();
        const nextState = buildState(sample);
        setSheetState(nextState);
        setDemoMode(true);
        setStatus(
          `Live data failed: ${error instanceof Error ? error.message : 'Unknown error'}. Showing demo data.`
        );
      } catch {
        setStatus(error instanceof Error ? error.message : 'Unable to load data.');
        setSheetState(null);
      }
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const rangeDays = Number(rangePreset);
    if (!Number.isNaN(rangeDays) && rangePreset !== 'custom') {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - (rangeDays - 1));
      setStartDate(formatDate(start));
      setEndDate(formatDate(today));
    }
  }, [rangePreset]);

  const activeRange = useMemo(() => {
    if (!startDate || !endDate) {
      return null;
    }
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59.999');
    return { start, end };
  }, [startDate, endDate]);

  const rowsInRange = useMemo(() => {
    if (!sheetState || !activeRange) {
      return [] as SheetRow[];
    }
    return filterRowsByRange(sheetState.rows, activeRange.start, activeRange.end);
  }, [sheetState, activeRange]);

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

  const utilizationData = useMemo<UtilizationEntry[]>(() => {
    if (!sheetState || !rowsInRange.length || sheetState.mapping.tester === undefined) {
      return [];
    }
    return buildUtilization(rowsInRange, sheetState.mapping.tester);
  }, [sheetState, rowsInRange]);

  const summaryItems = useMemo(() => {
    if (!sheetState || !rowsInRange.length) {
      return [];
    }
    if (metric === 'utilization' && utilizationData.length) {
      const total = utilizationData.reduce((sum, u) => sum + u.count, 0);
      const items = [
        `Total tests: ${total}`,
        `Active testers: ${utilizationData.length}`
      ];
      utilizationData.slice(0, 5).forEach((u) => {
        const pct = total > 0 ? Math.round((u.count / total) * 100) : 0;
        items.push(`${u.tester}: ${u.count} boards (${pct}%, ~${u.perDay}/day)`);
      });
      return items;
    }
    return buildSummary(rowsInRange, sheetState.mapping);
  }, [sheetState, rowsInRange, metric, utilizationData]);

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

    if (metric === 'utilization') {
      const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6'];
      return {
        labels: utilizationData.map((u) => u.tester),
        datasets: [
          {
            label: 'Boards tested',
            data: utilizationData.map((u) => u.count),
            backgroundColor: utilizationData.map((_, i) => palette[i % palette.length])
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
  }, [rowsInRange, metric, selectedErrors, errorInfo, categoryOptions, categorySelection, sheetState, utilizationData]);

  const tableRows = useMemo(() => {
    if (!rowsInRange.length) {
      return [];
    }
    if (!selectedDate) {
      return rowsInRange;
    }
    if (metric === 'utilization' && sheetState?.mapping.tester !== undefined) {
      return rowsInRange.filter(
        (row) => String(row.raw[sheetState.mapping.tester] ?? '') === selectedDate
      );
    }
    return rowsInRange.filter((row) => row.dateKey === selectedDate);
  }, [rowsInRange, selectedDate, metric, sheetState]);

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
    ? metric === 'utilization'
      ? `Details for tester ${selectedDate} (${tableRows.length} rows)`
      : `Details for ${selectedDate} (${tableRows.length} rows)`
    : `Details for selected range (${tableRows.length} rows)`;

  const statusMessage = status || (rowsInRange.length === 0 && sheetState ? 'No rows match the selected range.' : null);

  return (
    <main>
      <header>
        <div>
          <h1>ICT Data Viewer</h1>
          <p>Visualize tester output from the Google Sheet without downloading data locally.</p>
          {demoMode && (
            <p style={{ color: '#f59e0b', fontWeight: 'bold' }}>
              Demo mode: Showing generated sample data. Set SHEET_ID to load real data.
            </p>
          )}
        </div>
      </header>

      <FilterPanel
        onReload={loadData}
        rangePreset={rangePreset}
        onRangePresetChange={(value) => {
          setRangePreset(value);
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
          <h2>{metric === 'utilization' ? 'Utilization summary' : 'Range summary'}</h2>
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
        {getDataSourceType() === 'json'
          ? 'Data source: Cached JSON (refreshed daily).'
          : 'Data source: Google Sheets (live).'}
      </footer>
    </main>
  );
}
