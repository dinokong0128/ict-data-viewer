import React from 'react';

type FilterPanelProps = {
  gid: string;
  onGidChange: (value: string) => void;
  onReload: () => void;
  rangePreset: string;
  onRangePresetChange: (value: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  metric: string;
  onMetricChange: (value: string) => void;
  categoryOptions: string[];
  categorySelection: string;
  onCategoryChange: (value: string) => void;
  errorOptions: string[];
  selectedErrors: Set<string>;
  onErrorToggle: (value: string) => void;
};

export function FilterPanel({
  gid,
  onGidChange,
  onReload,
  rangePreset,
  onRangePresetChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  metric,
  onMetricChange,
  categoryOptions,
  categorySelection,
  onCategoryChange,
  errorOptions,
  selectedErrors,
  onErrorToggle
}: FilterPanelProps) {
  return (
    <section className="section controls">
      <div className="card control-card">
        <label htmlFor="sheet-gid">Sheet GID</label>
        <input
          id="sheet-gid"
          type="text"
          value={gid}
          onChange={(event) => onGidChange(event.target.value)}
        />
        <button type="button" onClick={onReload} style={{ marginTop: 8 }}>
          Reload data
        </button>
      </div>
      <div className="card control-card">
        <label htmlFor="range-select">Date range</label>
        <select
          id="range-select"
          value={rangePreset}
          onChange={(event) => onRangePresetChange(event.target.value)}
        >
          <option value="7">Past 7 days</option>
          <option value="14">Past 14 days</option>
          <option value="30">Past 30 days</option>
          <option value="custom">Custom</option>
        </select>
        <div className="custom-range">
          <label>
            Start
            <input
              type="date"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
            />
          </label>
          <label>
            End
            <input
              type="date"
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="card control-card">
        <label htmlFor="metric-select">Metric</label>
        <select
          id="metric-select"
          value={metric}
          onChange={(event) => onMetricChange(event.target.value)}
        >
          <option value="boards">Boards tested per day</option>
          <option value="tester">Boards per tester per day</option>
          <option value="fixture">Boards per fixture per day</option>
          <option value="operator">Boards per operator per day</option>
          <option value="errors">Errors per day</option>
        </select>
      </div>
      {categoryOptions.length > 0 && metric !== 'errors' ? (
        <div className="card control-card">
          <label htmlFor="category-select">Category</label>
          <select
            id="category-select"
            value={categorySelection}
            onChange={(event) => onCategoryChange(event.target.value)}
          >
            <option value="top">Top 5 (stacked)</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {errorOptions.length > 0 && metric === 'errors' ? (
        <div className="card control-card">
          <label>Error types</label>
          <div>
            {errorOptions.map((error) => (
              <label key={error} className="badge">
                <input
                  type="checkbox"
                  checked={selectedErrors.size === 0 || selectedErrors.has(error)}
                  onChange={() => onErrorToggle(error)}
                />
                <span>{error}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
