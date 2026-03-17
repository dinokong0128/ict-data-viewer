import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { ChartPanel, type ChartDataset } from '@/components/ChartPanel';
import { DetailTable } from '@/components/DetailTable';
import { FilterPanel } from '@/components/FilterPanel';
import { StatusBanner } from '@/components/StatusBanner';
import { clearGuestMode, useAuth } from '@/lib/auth-context';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { ErrorSearchInput } from '@/components/ErrorSearchInput';
import { useErrorSearch } from '@/lib/useErrorSearch';
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
  const [product, setProduct] = useState('');
  const [fixture, setFixture] = useState('');
  const [sn, setSn] = useState('');
  const [tester, setTester] = useState('');
  const [productOptions, setProductOptions] = useState<string[]>([]);

  // Incremented on every loadData call; each call captures its own snapshot so
  // stale responses (e.g. the default 30-day load racing the URL-seeded load) are
  // discarded before they can overwrite the result of the most recent request.
  const loadIdRef = useRef(0);

  const loadData = useCallback(async (start: string, end: string) => {
    if (!start || !end) return;
    const myId = ++loadIdRef.current;
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
      if (myId !== loadIdRef.current) return;
      setRecords(body.records);
      setStatus(null);
    } catch (err) {
      if (myId !== loadIdRef.current) return;
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

  // Seed filter state from URL query params on first router-ready (Option B: mount only).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!router.isReady || seededRef.current) return;
    seededRef.current = true;
    const q = router.query;
    if (typeof q.product === 'string' && q.product) setProduct(q.product);
    if (typeof q.fixture === 'string' && q.fixture) setFixture(q.fixture);
    if (typeof q.sn === 'string' && q.sn) setSn(q.sn);
    if (typeof q.tester === 'string' && q.tester) setTester(q.tester);
    const VALID_METRICS = ['boards', 'tester', 'fixture', 'operator', 'errors', 'utilization'];
    if (typeof q.metric === 'string' && VALID_METRICS.includes(q.metric)) setMetric(q.metric);
    if (typeof q.dateFrom === 'string' && q.dateFrom && typeof q.dateTo === 'string' && q.dateTo) {
      setStartDate(q.dateFrom);
      setEndDate(q.dateTo);
      setRangePreset('custom');
      void loadData(q.dateFrom, q.dateTo);
    }
  }, [router.isReady, router.query, loadData]);

  // Fetch product list once on mount for the product filter dropdown.
  useEffect(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    void fetch('/api/products', { headers })
      .then((res) => res.ok ? res.json() as Promise<{ products: { id: string; product_name: string }[] }> : Promise.resolve({ products: [] }))
      .then((body) => { setProductOptions(body.products.map((p) => p.product_name)); })
      .catch(() => { /* silently ignore — filter just shows no options */ });
  }, [session]);

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

  // Apply product/fixture/sn/tester filters on top of the date range.
  const rowsFiltered = useMemo(() => {
    let rows = rowsInRange;
    if (product) rows = rows.filter((r) => r.product_name === product);
    if (fixture) rows = rows.filter((r) => r.fixture_id === fixture);
    if (sn) rows = rows.filter((r) => r.serial_number === sn);
    if (tester) rows = rows.filter((r) => r.tester === tester);
    return rows;
  }, [rowsInRange, product, fixture, sn, tester]);

  const filteredRows = useMemo(() => {
    if (!summaryFilter) return rowsFiltered;
    if (summaryFilter === 'pass') return rowsFiltered.filter((r) => r.result === 'pass');
    if (summaryFilter === 'fail') return rowsFiltered.filter((r) => r.result === 'fail');
    if (summaryFilter === 'boards') {
      const seen = new Set<string>();
      return rowsFiltered.filter((r) => {
        if (seen.has(r.serial_number)) return false;
        seen.add(r.serial_number);
        return true;
      });
    }
    return rowsFiltered;
  }, [rowsFiltered, summaryFilter]);

  const categoryOptions = useMemo(() => {
    if (!rowsFiltered.length) return [];
    const field = METRIC_FIELD[metric];
    if (!field) return [];
    return getCategoryOptions(rowsFiltered, field);
  }, [rowsFiltered, metric]);

  const errorInfo = useMemo(() => {
    if (!rowsFiltered.length) return { errors: [], counts: new Map<string, number>() };
    return buildErrorCounts(rowsFiltered);
  }, [rowsFiltered]);

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
    if (!rowsFiltered.length) return [];
    return buildUtilization(rowsFiltered);
  }, [rowsFiltered]);

  // Summary stats based on rowsFiltered so product/fixture/sn/tester filters propagate here.
  const summaryStats = useMemo(() => {
    if (!rowsFiltered.length) return null;
    const uniqueBoards = new Set(rowsFiltered.map((r) => r.serial_number));
    const passCount = rowsFiltered.filter((r) => r.result === 'pass').length;
    const failCount = rowsFiltered.filter((r) => r.result === 'fail').length;

    const errorCounts: Record<string, number> = {};
    rowsFiltered.forEach((r) => {
      r.test_errors.forEach((e) => {
        errorCounts[e.location] = (errorCounts[e.location] ?? 0) + 1;
      });
    });
    const allErrorsSorted = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1]) as Array<[string, number]>;

    return { totalTests: rowsFiltered.length, uniqueBoardCount: uniqueBoards.size, passCount, failCount, allErrorsSorted };
  }, [rowsFiltered]);

  const summaryErrorNames = useMemo(
    () => (summaryStats ? summaryStats.allErrorsSorted.map(([loc]) => loc) : []),
    [summaryStats]
  );
  const { query: summaryErrorQuery, setQuery: setSummaryErrorQuery, filtered: filteredSummaryErrorNames } = useErrorSearch(summaryErrorNames, summaryErrorsExpanded);

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

  function handleFixtureClick(value: string) {
    setFixture((prev) => (prev === value ? '' : value));
    setPage(1);
  }

  function handleSnClick(value: string) {
    setSn((prev) => (prev === value ? '' : value));
    setPage(1);
  }

  function handleTesterClick(value: string) {
    setTester((prev) => (prev === value ? '' : value));
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

          <span className="header-control-group">
            <label className="header-label" htmlFor="product-select">Product</label>
            <select
              id="product-select"
              className="header-select"
              value={product}
              onChange={(e) => { setProduct(e.target.value); setPage(1); }}
            >
              <option value="">All products</option>
              {productOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </span>

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
                  {summaryStats.allErrorsSorted.length > 3 && (
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
                  <>
                    <ErrorSearchInput value={summaryErrorQuery} onChange={setSummaryErrorQuery} />
                    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: '4px' }}>
                      {(summaryErrorQuery.trim()
                        ? summaryStats.allErrorsSorted.filter(([loc]) => filteredSummaryErrorNames.includes(loc))
                        : summaryErrorsExpanded
                          ? summaryStats.allErrorsSorted
                          : summaryStats.allErrorsSorted.slice(0, 3)
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
                  </>
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
        onFixtureClick={handleFixtureClick}
        onSnClick={handleSnClick}
        onTesterClick={handleTesterClick}
        activeFixture={fixture}
        activeSn={sn}
        activeTester={tester}
      />

      <footer>
        Data source: {isGuest ? 'Demo fixture data' : 'Supabase'}. The app reads test records live.
      </footer>
    </main>
  );
}
