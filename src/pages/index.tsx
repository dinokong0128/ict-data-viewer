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
  formatDate,
  type SummaryResponse,
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

/** Cap frontend queries at this duration; tune here if needed. */
const QUERY_TIMEOUT_MS = 15_000;

type PageFilters = {
  product?: string;
  fixture?: string;
  sn?: string;
  tester?: string;
  q?: string;
  errors?: string[];
  result?: string;
};

export default function HomePage() {
  const router = useRouter();
  const { session, role, isGuest } = useAuth();

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [tableRows, setTableRows] = useState<TestRecord[]>([]);
  const [totalRows, setTotalRows] = useState(0);
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
  const [textFilter, setTextFilter] = useState('');
  const [textFilterDebounced, setTextFilterDebounced] = useState('');
  const [productOptions, setProductOptions] = useState<string[]>([]);

  // Separate load IDs for summary and table fetches so stale responses are discarded independently.
  const summaryLoadIdRef = useRef(0);
  const tableLoadIdRef = useRef(0);
  // True once the first successful table fetch has resolved; drives stale-data fallback message.
  const hasTableDataRef = useRef(false);
  // Tracks the previous user ID to detect identity changes requiring a data clear.
  const prevUserIdRef = useRef<string | undefined>(undefined);

  // When the authenticated user identity changes (sign-out, session expiry, or a
  // different user logging in), discard any stale private data immediately.
  useEffect(() => {
    const currentUserId = session?.user?.id;
    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== currentUserId) {
      setSummary(null);
      setTableRows([]);
      setTotalRows(0);
      hasTableDataRef.current = false;
    }
    prevUserIdRef.current = currentUserId;
  }, [session]);

  // ---------------------------------------------------------------------------
  // loadSummary — fetches /api/summary for chart and range-summary panel
  // ---------------------------------------------------------------------------
  const loadSummary = useCallback(async (
    start: string,
    end: string,
    filters: { product?: string; fixture?: string; sn?: string; tester?: string },
  ) => {
    if (!start || !end) return;
    const myId = ++summaryLoadIdRef.current;

    const params = new URLSearchParams({ start, end });
    if (filters.product) params.set('product', filters.product);
    if (filters.fixture) params.set('fixture', filters.fixture);
    if (filters.sn)      params.set('sn',      filters.sn);
    if (filters.tester)  params.set('tester',  filters.tester);

    const headers: Record<string, string> = {};
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/summary?${params.toString()}`, { headers, signal: controller.signal });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as SummaryResponse;
      if (myId !== summaryLoadIdRef.current) return;
      setSummary(body);
    } catch {
      // Summary failures are non-critical — keep stale summary visible. Status is driven by loadPage.
    } finally {
      clearTimeout(timeoutId);
    }
  }, [session]);

  // ---------------------------------------------------------------------------
  // loadPage — fetches /api/tests (paginated) for the detail table
  // ---------------------------------------------------------------------------
  const loadPage = useCallback(async (
    start: string,
    end: string,
    filters: PageFilters,
    pg: number,
  ) => {
    if (!start || !end) return;
    const myId = ++tableLoadIdRef.current;
    setStatus('Loading data...');

    const params = new URLSearchParams({ start, end, page: String(pg), pageSize: String(PAGE_SIZE) });
    if (filters.product) params.set('product', filters.product);
    if (filters.fixture) params.set('fixture', filters.fixture);
    if (filters.sn)      params.set('sn',      filters.sn);
    if (filters.tester)  params.set('tester',  filters.tester);
    if (filters.result)  params.set('result',  filters.result);
    if (filters.q)       params.set('q',       filters.q);
    if (filters.errors && filters.errors.length > 0) params.set('errors', filters.errors.join(','));

    const headers: Record<string, string> = {};
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/tests?${params.toString()}`, { headers, signal: controller.signal });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { records: TestRecord[]; total: number; page: number; pageSize: number; demo: boolean };
      if (myId !== tableLoadIdRef.current) return;
      setTableRows(body.records);
      setTotalRows(body.total);
      hasTableDataRef.current = true;
      setStatus(null);
    } catch (err) {
      if (myId !== tableLoadIdRef.current) return;
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      const rawMsg = isTimeout
        ? `Request timed out after ${QUERY_TIMEOUT_MS / 1000}s`
        : (err instanceof Error ? err.message : 'Unable to load data.');
      setStatus(hasTableDataRef.current ? `Last refresh failed — showing previous data (${rawMsg})` : rawMsg);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [session]);

  // ---------------------------------------------------------------------------
  // Helper: build page filters from current state
  // ---------------------------------------------------------------------------
  function buildPageFilters(overrides?: Partial<PageFilters>): PageFilters {
    return {
      product,
      fixture,
      sn,
      tester: overrides?.tester ?? tester,
      q:       textFilterDebounced,
      errors:  selectedErrors.size > 0 ? Array.from(selectedErrors) : undefined,
      result:  summaryFilter === 'pass' ? 'pass' : summaryFilter === 'fail' ? 'fail' : undefined,
      ...overrides,
    };
  }

  // Debounce textFilter → textFilterDebounced
  useEffect(() => {
    const timer = setTimeout(() => setTextFilterDebounced(textFilter), 300);
    return () => clearTimeout(timer);
  }, [textFilter]);

  // Range preset effect: update startDate/endDate when preset changes
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
    }
  }, [rangePreset]);

  // Seed filter state from URL query params on first router-ready (mount only).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!router.isReady || seededRef.current) return;
    seededRef.current = true;
    const q = router.query;
    if (typeof q.product === 'string' && q.product) setProduct(q.product);
    if (typeof q.fixture === 'string' && q.fixture) setFixture(q.fixture);
    if (typeof q.sn === 'string' && q.sn) setSn(q.sn);
    if (typeof q.tester === 'string' && q.tester) setTester(q.tester);
    if (typeof q.q === 'string' && q.q) setTextFilter(q.q);
    const VALID_METRICS = ['boards', 'tester', 'fixture', 'operator', 'errors', 'utilization'];
    if (typeof q.metric === 'string' && VALID_METRICS.includes(q.metric)) setMetric(q.metric);
    if (typeof q.dateFrom === 'string' && q.dateFrom && typeof q.dateTo === 'string' && q.dateTo) {
      setStartDate(q.dateFrom);
      setEndDate(q.dateTo);
      setRangePreset('custom');
    }
  }, [router.isReady, router.query]);

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

  // ---------------------------------------------------------------------------
  // Main data loading effects
  // ---------------------------------------------------------------------------

  // Summary effect: triggered by structural filters (date range + product/fixture/sn/tester).
  // Also resets page to 1 so the table effect fires with page=1.
  useEffect(() => {
    if (!startDate || !endDate) return;
    void loadSummary(startDate, endDate, { product, fixture, sn, tester });
    setPage(1);
  }, [startDate, endDate, product, fixture, sn, tester, loadSummary]);

  // Table effect: triggered by all structural filters + pagination/text/error/result filters.
  useEffect(() => {
    if (!startDate || !endDate) return;
    // For date-based selectedDate: narrow the range to that single day.
    // For utilization metric with selectedDate (a tester name): use it as the tester filter.
    const effectiveStart = selectedDate && metric !== 'utilization' ? selectedDate : startDate;
    const effectiveEnd   = selectedDate && metric !== 'utilization' ? selectedDate : endDate;
    const testerOverride = metric === 'utilization' && selectedDate ? selectedDate : undefined;
    void loadPage(effectiveStart, effectiveEnd, buildPageFilters({ tester: testerOverride ?? tester }), page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, product, fixture, sn, tester, page, textFilterDebounced, selectedErrors, summaryFilter, selectedDate, metric, loadPage]);

  async function handleLogout() {
    const sb = getSupabaseBrowser();
    if (sb) await sb.auth.signOut();
    clearGuestMode();
    void router.push('/login');
  }

  // ---------------------------------------------------------------------------
  // Derived data — all computed from `summary` state
  // ---------------------------------------------------------------------------

  const errorOptions = useMemo(
    () => [...new Set(summary?.errorsByDayLocation.map((e) => e.location) ?? [])].sort(),
    [summary],
  );

  const errorTotals = useMemo(() => {
    const m = new Map<string, number>();
    summary?.errorsByDayLocation.forEach((e) => {
      m.set(e.location, (m.get(e.location) ?? 0) + e.error_count);
    });
    return m;
  }, [summary]);

  const categoryOptions = useMemo(() => {
    if (!summary) return [];
    const field = METRIC_FIELD[metric];
    if (!field) return [];
    const counts: Record<string, number> = {};
    summary.byDayFixtureTester.forEach((r) => {
      const v = (field === 'tester' ? r.tester : field === 'fixture_id' ? r.fixture_id : r.operator_id).trim();
      if (v) counts[v] = (counts[v] ?? 0) + r.total;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([v]) => v);
  }, [summary, metric]);

  const utilizationData = useMemo<UtilizationEntry[]>(() => {
    if (!summary) return [];
    const testerDays: Record<string, Set<string>> = {};
    const testerCounts: Record<string, number> = {};
    summary.byDayFixtureTester.forEach((r) => {
      const t = r.tester.trim();
      if (!t) return;
      testerCounts[t] = (testerCounts[t] ?? 0) + r.total;
      if (!testerDays[t]) testerDays[t] = new Set();
      testerDays[t].add(r.day);
    });
    return Object.entries(testerCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([t, count]) => {
        const days = testerDays[t].size;
        return { tester: t, count, days, perDay: Math.round(count / days) };
      });
  }, [summary]);

  const summaryStats = useMemo(() => {
    if (!summary || !summary.byDayFixtureTester.length) return null;
    const rows = summary.byDayFixtureTester;
    const totalTests    = rows.reduce((s, r) => s + r.total, 0);
    const passCount     = rows.reduce((s, r) => s + r.pass, 0);
    const failCount     = rows.reduce((s, r) => s + r.fail, 0);
    // Note: unique_boards per group may overcount boards tested in multiple groups/days
    const uniqueBoardCount = rows.reduce((s, r) => s + r.unique_boards, 0);
    const errorCounts: Record<string, number> = {};
    summary.errorsByDayLocation.forEach((e) => {
      errorCounts[e.location] = (errorCounts[e.location] ?? 0) + e.error_count;
    });
    const allErrorsSorted = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1]) as Array<[string, number]>;
    return { totalTests, uniqueBoardCount, passCount, failCount, allErrorsSorted };
  }, [summary]);

  const summaryErrorNames = useMemo(
    () => (summaryStats ? summaryStats.allErrorsSorted.map(([loc]) => loc) : []),
    [summaryStats],
  );
  const { query: summaryErrorQuery, setQuery: setSummaryErrorQuery, filtered: filteredSummaryErrorNames } = useErrorSearch(summaryErrorNames, summaryErrorsExpanded);

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
    if (!summary || !summary.byDayFixtureTester.length) return { labels: [], datasets: [], chartType: 'bar' };

    if (metric === 'utilization') {
      const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6'];
      return {
        labels: utilizationData.map((u) => u.tester),
        datasets: [{ label: 'Boards tested', data: utilizationData.map((u) => u.count), backgroundColor: utilizationData.map((_, i) => palette[i % palette.length]) }],
        chartType: 'bar',
      };
    }

    if (metric === 'errors') {
      const allDays = [...new Set(summary.errorsByDayLocation.map((e) => e.day))].sort();
      if (!allDays.length) return { labels: [], datasets: [], chartType: 'line' };
      const selectedSet = selectedErrors.size > 0 ? selectedErrors : new Set(summary.errorsByDayLocation.map((e) => e.location));
      const dayTotals: Record<string, number> = {};
      summary.errorsByDayLocation.forEach((e) => {
        if (selectedSet.has(e.location)) dayTotals[e.day] = (dayTotals[e.day] ?? 0) + e.error_count;
      });
      return {
        labels: allDays,
        datasets: [{
          label: selectedErrors.size ? `Errors (${selectedErrors.size} types)` : 'Errors',
          data: allDays.map((d) => dayTotals[d] ?? 0),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.4)',
        }],
        chartType: 'line',
      };
    }

    const allDays = [...new Set(summary.byDayFixtureTester.map((r) => r.day))].sort();

    if (metric === 'boards') {
      const dayData: Record<string, number> = {};
      summary.byDayFixtureTester.forEach((r) => {
        const value = summaryFilter === 'pass' ? r.pass
          : summaryFilter === 'fail' ? r.fail
          : summaryFilter === 'boards' ? r.unique_boards  // approximation — see comment in summaryStats
          : r.total;
        dayData[r.day] = (dayData[r.day] ?? 0) + value;
      });
      return {
        labels: allDays,
        datasets: [{ label: 'Boards tested', data: allDays.map((d) => dayData[d] ?? 0), backgroundColor: 'rgba(37, 99, 235, 0.7)' }],
        chartType: 'bar',
      };
    }

    const field = METRIC_FIELD[metric];
    if (!field || !categoryOptions.length) return { labels: allDays, datasets: [], chartType: 'bar' };

    if (categorySelection !== 'top' && categoryOptions.includes(categorySelection)) {
      const dayData: Record<string, number> = {};
      summary.byDayFixtureTester.forEach((r) => {
        const v = field === 'tester' ? r.tester : field === 'fixture_id' ? r.fixture_id : r.operator_id;
        if (v === categorySelection) dayData[r.day] = (dayData[r.day] ?? 0) + r.total;
      });
      return {
        labels: allDays,
        datasets: [{ label: categorySelection, data: allDays.map((d) => dayData[d] ?? 0), backgroundColor: 'rgba(37, 99, 235, 0.7)' }],
        chartType: 'bar',
      };
    }

    const palette = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];
    const datasets = categoryOptions.slice(0, 5).map((cat, idx) => {
      const dayData: Record<string, number> = {};
      summary.byDayFixtureTester.forEach((r) => {
        const v = field === 'tester' ? r.tester : field === 'fixture_id' ? r.fixture_id : r.operator_id;
        if (v === cat) dayData[r.day] = (dayData[r.day] ?? 0) + r.total;
      });
      return {
        label: cat,
        data: allDays.map((d) => dayData[d] ?? 0),
        backgroundColor: palette[idx % palette.length],
        stack: 'categories',
      };
    });
    return { labels: allDays, datasets, chartType: 'bar' };
  }, [summary, metric, selectedErrors, categoryOptions, categorySelection, summaryFilter, utilizationData]);

  const tableTitle = selectedDate
    ? metric === 'utilization'
      ? `Details for tester ${selectedDate} (${totalRows} rows)`
      : `Details for ${selectedDate} (${totalRows} rows)`
    : `Details for selected range (${totalRows} rows)`;

  const statusMessage =
    status ??
    (summary !== null && totalRows === 0 ? 'No records match the selected range.' : null);

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

  function handleReload() {
    if (!startDate || !endDate) return;
    void loadSummary(startDate, endDate, { product, fixture, sn, tester });
    void loadPage(startDate, endDate, buildPageFilters(), page);
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
            onClick={handleReload}
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
            onReload={handleReload}
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
            errorOptions={errorOptions}
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
        totalRows={totalRows}
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
        textFilter={textFilter}
        onTextFilterChange={(v) => { setTextFilter(v); setPage(1); }}
        authToken={session?.access_token}
      />

      <footer>
        Data source: {isGuest ? 'Demo fixture data' : 'Supabase'}. The app reads test records live.
      </footer>
    </main>
  );
}
