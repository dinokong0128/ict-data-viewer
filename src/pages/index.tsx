import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { ChartPanel, type ChartDataset } from '@/components/ChartPanel';
import { DetailTable } from '@/components/DetailTable';
import { FilterPanel } from '@/components/FilterPanel';
import { StatusBanner } from '@/components/StatusBanner';
import { clearGuestMode, useAuth } from '@/lib/auth-context';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import {
  buildErrorCounts,
  buildUtilization,
  filterByRange,
  formatDate,
  getCategoryOptions,
  getDateKey,
  groupByDate,
  type TestRecord,
  type UtilizationEntry,
} from '@/lib/testUtils';

const PAGE_SIZE = 12;

type ChartConfig = {
  labels: string[];
  datasets: ChartDataset[];
  chartType: 'bar' | 'line';
};

type MetricToField = Record<string, 'tester' | 'fixture_id' | 'operator_id'>;
const METRIC_FIELD: MetricToField = {
  tester:   'tester',
  fixture:  'fixture_id',
  operator: 'operator_id',
};

type SummaryFilter = 'pass' | 'fail' | 'boards' | null;

export default function HomePage() {
  const router = useRouter();
  const { session, role, isGuest } = useAuth();

  const [records, setRecords] = useState<TestRecord[]>([]);
  const [status, setStatus] = useState<string | null>('Loading data...');
  const [rangePreset, setRangePreset] = useState('30');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [metric, setMetric] = useState('boards');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [categorySelection, setCategorySelection] = useState('top');
  const [selectedErrors, setSelectedErrors] = useState<Set<string>>(new Set());
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>(null);
  const [summaryErrorsExpanded, setSummaryErrorsExpanded] = useState(false);

  const loadData = useCallback(async (start: string, end: string) => {
    if (!start || !end) return;
    try {
      setStatus('Loading data...');

      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/tests?start=${start}&end=${end}`, { headers });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { records: TestRecord[]; demo: boolean };
      setRecords(body.records);
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Unable to load data.');
      setRecords([]);
    }
  }, [session]);

  useEffect(() => {
    const rangeDays = Number(rangePreset);
    if (!Number.isNaN(rangeDays) && rangePreset !== 'custom') {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - (rangeDays - 1));
      const s = formatDate(start);
      const e = formatDate(today);
      setStartDate(s);
      setEndDate(e);
      setSummaryFilter(null);
      void loadData(s, e);
    }
  }, [rangePreset, loadData]);

  async function handleLogout() {
    const sb = getSupabaseBrowser();
    if (sb) await sb.auth.signOut();
    clearGuestMode();
    void router.push('/login');
  }

  const activeRange = useMemo(() => {
    if (!startDate || !endDate) return null;
    return {
      start: new Date(startDate + 'T00:00:00'),
      end:   new Date(endDate   + 'T23:59:59.999'),
    };
  }, [startDate, endDate]);

  const rowsInRange = useMemo(() => {
    if (!activeRange) return [] as TestRecord[];
    return filterByRange(records, activeRange.start, activeRange.end);
  }, [records, activeRange]);

  const filteredRows = useMemo(() => {
    if (!summaryFilter) return rowsInRange;
    if (summaryFilter === 'pass') return rowsInRange.filter((r) => r.result === 'pass');
    if (summaryFilter === 'fail') return rowsInRange.filter((r) => r.result === 'fail');
    if (summaryFilter === 'boards') {
      const seen = new Set<string>();
      return rowsInRange.filter((r) => {
        if (seen.has(r.serial_number)) return false;
        seen.add(r.serial_number);
        return true;
      });
    }
    return rowsInRange;
  }, [rowsInRange, summaryFilter]);

  const categoryOptions = useMemo(() => {
    if (!rowsInRange.length) return [];
    const field = METRIC_FIELD[metric];
    if (!field) return [];
    return getCategoryOptions(rowsInRange, field);
  }, [rowsInRange, metric]);

  const errorInfo = useMemo(() => {
    if (!rowsInRange.length) return { errors: [], counts: new Map<string, number>() };
    return buildErrorCounts(rowsInRange);
  }, [rowsInRange]);

  const errorTotals = useMemo(() => {
    const m = new Map<string, number>();
    filteredRows.forEach((r) => {
      r.test_errors.forEach((e) => {
        m.set(e.location, (m.get(e.location) ?? 0) + 1);
      });
    });
    return m;
  }, [filteredRows]);

  const utilizationData = useMemo<UtilizationEntry[]>(() => {
    if (!rowsInRange.length) return [];
    return buildUtilization(rowsInRange);
  }, [rowsInRange]);

  // Summary stats (always based on full rowsInRange, not filteredRows)
  const summaryStats = useMemo(() => {
    if (!rowsInRange.length) return null;
    const uniqueBoards = new Set(rowsInRange.map((r) => r.serial_number));
    const passCount = rowsInRange.filter((r) => r.result === 'pass').length;
    const failCount = rowsInRange.filter((r) => r.result === 'fail').length;

    const errorCounts: Record<string, number> = {};
    rowsInRange.forEach((r) => {
      r.test_errors.forEach((e) => {
        errorCounts[e.location] = (errorCounts[e.location] ?? 0) + 1;
      });
    });
    const allErrorsSorted = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1]) as Array<[string, number]>;

    return { totalTests: rowsInRange.length, uniqueBoardCount: uniqueBoards.size, passCount, failCount, allErrorsSorted };
  }, [rowsInRange]);

  // Utilization summary items (for utilization metric)
  const utilizationSummaryItems = useMemo(() => {
    if (!utilizationData.length) return [];
    const total = utilizationData.reduce((sum, u) => sum + u.count, 0);
    const items = [
      `Total tests: ${total}`,
      `Active testers: ${utilizationData.length}`,
    ];
    utilizationData.slice(0, 5).forEach((u) => {
      const pct = total > 0 ? Math.round((u.count / total) * 100) : 0;
      items.push(`${u.tester}: ${u.count} boards (${pct}%, ~${u.perDay}/day)`);
    });
    return items;
  }, [utilizationData]);

  const chartConfig = useMemo<ChartConfig>(() => {
    if (!filteredRows.length) return { labels: [], datasets: [], chartType: 'bar' };

    const labels = Array.from(groupByDate(filteredRows).keys()).sort();

    if (metric === 'boards') {
      const counts = groupByDate(filteredRows);
      return {
        labels,
        datasets: [{ label: 'Boards tested', data: labels.map((l) => counts.get(l) ?? 0), backgroundColor: 'rgba(37, 99, 235, 0.7)' }],
        chartType: 'bar',
      };
    }

    if (metric === 'utilization') {
      const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6'];
      return {
        labels: utilizationData.map((u) => u.tester),
        datasets: [{ label: 'Boards tested', data: utilizationData.map((u) => u.count), backgroundColor: utilizationData.map((_, i) => palette[i % palette.length]) }],
        chartType: 'bar',
      };
    }

    if (metric === 'errors') {
      const selected = selectedErrors.size === 0 ? errorInfo.errors : errorInfo.errors.filter((e) => selectedErrors.has(e));
      const data = labels.map((label) =>
        selected.reduce((sum, error) => sum + (errorInfo.counts.get(`${label}::${error}`) ?? 0), 0)
      );
      return {
        labels,
        datasets: [{ label: selected.length ? `Errors (${selected.length} types)` : 'Errors', data, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.4)' }],
        chartType: 'line',
      };
    }

    const field = METRIC_FIELD[metric];
    if (!field || !categoryOptions.length) return { labels, datasets: [], chartType: 'bar' };

    if (categorySelection !== 'top' && categoryOptions.includes(categorySelection)) {
      const data = labels.map((label) =>
        filteredRows.filter((r) => getDateKey(r) === label && r[field] === categorySelection).length
      );
      return {
        labels,
        datasets: [{ label: categorySelection, data, backgroundColor: 'rgba(37, 99, 235, 0.7)' }],
        chartType: 'bar',
      };
    }

    const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];
    const datasets = categoryOptions.slice(0, 5).map((cat, idx) => ({
      label: cat,
      data: labels.map((label) => filteredRows.filter((r) => getDateKey(r) === label && r[field] === cat).length),
      backgroundColor: palette[idx % palette.length],
      stack: 'categories',
    }));
    return { labels, datasets, chartType: 'bar' };
  }, [filteredRows, metric, selectedErrors, errorInfo, categoryOptions, categorySelection, utilizationData]);

  const tableRows = useMemo(() => {
    if (!filteredRows.length) return [] as TestRecord[];

    let rows = filteredRows;
    if (metric === 'errors' && selectedErrors.size > 0) {
      rows = rows.filter((r) =>
        r.test_errors.some((e) => selectedErrors.has(e.location))
      );
    }

    if (!selectedDate) return rows;
    if (metric === 'utilization') {
      return rows.filter((r) => r.tester === selectedDate);
    }
    return rows.filter((r) => getDateKey(r) === selectedDate);
  }, [filteredRows, selectedDate, metric, selectedErrors]);

  const tableTitle = selectedDate
    ? metric === 'utilization'
      ? `Details for tester ${selectedDate} (${tableRows.length} rows)`
      : `Details for ${selectedDate} (${tableRows.length} rows)`
    : `Details for selected range (${tableRows.length} rows)`;

  const statusMessage =
    status ??
    (rowsInRange.length === 0 && records.length > 0 ? 'No records match the selected range.' : null);

  // Show AI chat entry point for ict-manager and ict-admin only.
  // TODO: implement AI chat feature here — replace the placeholder below.
  const showAiChat = !isGuest && role !== null && role !== 'ict-member';

  function handleSummaryFilterToggle(filter: NonNullable<SummaryFilter>) {
    setSummaryFilter((prev) => (prev === filter ? null : filter));
    setSelectedDate(null);
    setPage(1);
  }

  function handleSummaryErrorClick(errorLocation: string) {
    setMetric('errors');
    setSelectedErrors(new Set([errorLocation]));
    setSummaryFilter(null);
    setSelectedDate(null);
    setPage(1);
  }

  return (
    <main>
      <header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h1>ICT Data Viewer</h1>
          {isGuest && (
            <span style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 600 }}>
              Guest mode —{' '}
              <a href="/login" style={{ color: '#f59e0b' }}>Sign in</a>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-reload"
            title="Reload data"
            onClick={() => { void loadData(startDate, endDate); }}
          >
            ↻
          </button>

          <FilterPanel
            onReload={() => void loadData(startDate, endDate)}
            rangePreset={rangePreset}
            onRangePresetChange={(value) => { setRangePreset(value); }}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={(value) => { setStartDate(value); setRangePreset('custom'); }}
            onEndDateChange={(value) => { setEndDate(value); setRangePreset('custom'); }}
            metric={metric}
            onMetricChange={(value) => {
              setMetric(value);
              setSelectedDate(null);
              setCategorySelection('top');
              setSelectedErrors(new Set());
              setSummaryFilter(null);
            }}
            categoryOptions={categoryOptions}
            categorySelection={categorySelection}
            onCategoryChange={setCategorySelection}
            errorOptions={errorInfo.errors}
            errorCounts={errorTotals}
            selectedErrors={selectedErrors}
            onErrorToggle={(value) => {
              const next = new Set(selectedErrors);
              if (next.has(value)) { next.delete(value); } else { next.add(value); }
              setSelectedErrors(next);
            }}
          />

          {/* TODO: AI chat entry point — place chat button/panel here.
              Visible to ict-manager and ict-admin only (see showAiChat flag). */}
          {showAiChat && (
            <span style={{ fontSize: '13px', color: '#6b7280' }}>{/* AI chat placeholder */}</span>
          )}

          {!isGuest && (
            <button
              type="button"
              onClick={() => { void handleLogout(); }}
              style={{
                background: 'none',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '5px 12px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#4b5563',
              }}
            >
              Log out
            </button>
          )}
        </div>
      </header>

      <StatusBanner message={statusMessage} />

      <section className="section chart-section">
        <ChartPanel
          labels={chartConfig.labels}
          datasets={chartConfig.datasets}
          chartType={chartConfig.chartType}
          onSelectDate={(label) => { setSelectedDate(label); setPage(1); }}
        />
        <div className="card">
          <h2>{metric === 'utilization' ? 'Utilization summary' : 'Range summary'}</h2>
          {metric === 'utilization' ? (
            <ul className="summary-list">
              {utilizationSummaryItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : summaryStats ? (
            <ul className="summary-list">
              <li>
                Total tests:{' '}
                <button
                  type="button"
                  className={`summary-num${!summaryFilter ? ' summary-num--active' : ''}`}
                  onClick={() => { setSummaryFilter(null); setSelectedDate(null); setPage(1); }}
                >
                  {summaryStats.totalTests}
                </button>
              </li>
              <li>
                Total # of boards:{' '}
                <button
                  type="button"
                  className={`summary-num${summaryFilter === 'boards' ? ' summary-num--active' : ''}`}
                  onClick={() => handleSummaryFilterToggle('boards')}
                >
                  {summaryStats.uniqueBoardCount}
                </button>
              </li>
              <li>
                Pass:{' '}
                <button
                  type="button"
                  className={`summary-num${summaryFilter === 'pass' ? ' summary-num--active' : ''}`}
                  onClick={() => handleSummaryFilterToggle('pass')}
                >
                  {summaryStats.passCount}
                </button>
                {' | '}
                Fail:{' '}
                <button
                  type="button"
                  className={`summary-num${summaryFilter === 'fail' ? ' summary-num--active' : ''}`}
                  onClick={() => handleSummaryFilterToggle('fail')}
                >
                  {summaryStats.failCount}
                </button>
              </li>
              <li>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Top errors</span>
                  {summaryStats.allErrorsSorted.length > 5 && (
                    <button
                      type="button"
                      className="summary-num"
                      onClick={() => setSummaryErrorsExpanded((v) => !v)}
                    >
                      {summaryErrorsExpanded ? '▲' : `▼ ${summaryStats.allErrorsSorted.length}`}
                    </button>
                  )}
                </div>
                {summaryStats.allErrorsSorted.length === 0 ? (
                  <span style={{ color: '#6b7280', fontSize: '13px' }}>None</span>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: '4px' }}>
                    {(summaryErrorsExpanded
                      ? summaryStats.allErrorsSorted
                      : summaryStats.allErrorsSorted.slice(0, 5)
                    ).map(([loc, count]) => (
                      <li key={loc} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span>{loc}</span>
                        <button
                          type="button"
                          className="summary-num"
                          onClick={() => handleSummaryErrorClick(loc)}
                        >
                          {count}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>
          ) : null}
        </div>
      </section>

      <DetailTable
        rows={tableRows}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        title={tableTitle}
      />

      <footer>
        Data source: {isGuest ? 'Demo fixture data' : 'Supabase'}. The app reads test records live.
      </footer>
    </main>
  );
}
