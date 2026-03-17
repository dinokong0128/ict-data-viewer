import React, { useState } from 'react';

type FilterPanelProps = {
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
  errorCounts?: Map<string, number>;
};

export function FilterPanel({
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
  onErrorToggle,
  errorCounts = new Map(),
}: FilterPanelProps) {
  const [errorListExpanded, setErrorListExpanded] = useState(false);
  return (
    <>
      <span className="header-control-group">
        <label className="header-label" htmlFor="range-select">Date Range</label>
        <select
          id="range-select"
          className="header-select"
          value={rangePreset}
          onChange={(event) => onRangePresetChange(event.target.value)}
        >
          <option value="7">Past 7 days</option>
          <option value="14">Past 14 days</option>
          <option value="30">Past 30 days</option>
          <option value="custom">Custom</option>
        </select>
        {rangePreset === 'custom' ? (
          <>
            <input
              type="date"
              className="header-select"
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
              aria-label="Start date"
            />
            <span className="header-label">–</span>
            <input
              type="date"
              className="header-select"
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
              aria-label="End date"
            />
          </>
        ) : null}
      </span>

      <span className="header-control-group">
        <label className="header-label" htmlFor="metric-select">Metrics</label>
        <select
          id="metric-select"
          className="header-select"
          value={metric}
          onChange={(event) => onMetricChange(event.target.value)}
        >
          <option value="boards">Boards tested per day</option>
          <option value="tester">Boards per tester per day</option>
          <option value="fixture">Boards per fixture per day</option>
          <option value="operator">Boards per operator per day</option>
          <option value="errors">Errors per day</option>
          <option value="utilization">Machine utilization</option>
        </select>
      </span>

      {categoryOptions.length > 0 && metric !== 'errors' ? (
        <span className="header-control-group">
          <label className="header-label" htmlFor="category-select">Category</label>
          <select
            id="category-select"
            className="header-select"
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
        </span>
      ) : null}

      {errorOptions.length > 0 && metric === 'errors' ? (
        <span className="header-control-group header-control-group--wrap">
          <span className="header-label">
            Error types ({selectedErrors.size === 0 ? errorOptions.length : selectedErrors.size} of {errorOptions.length})
          </span>
          {(errorListExpanded ? errorOptions : errorOptions.slice(0, 5)).map((error) => (
            <label key={error} className="badge">
              <input
                type="checkbox"
                checked={selectedErrors.size === 0 || selectedErrors.has(error)}
                onChange={() => onErrorToggle(error)}
              />
              <span>{error} ({errorCounts.get(error) ?? 0})</span>
            </label>
          ))}
          {errorOptions.length > 5 && (
            <button
              type="button"
              onClick={() => setErrorListExpanded((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#4338ca', padding: '2px 4px' }}
            >
              {errorListExpanded ? '▲ Show less' : `▼ +${errorOptions.length - 5} more`}
            </button>
          )}
        </span>
      ) : null}
    </>
  );
}
