export type ChatIntent = 'summary' | 'trend' | 'top_n' | 'compare' | 'lookup';
export type VisualizationHint = 'none' | 'table' | 'line' | 'bar';

export interface ChatFilter {
  field: 'product' | 'tester' | 'fixture' | 'operator' | 'result' | 'error_type' | 'serial_number' | 'date';
  operator: 'eq' | 'in' | 'contains' | 'gte' | 'lte' | 'between';
  value: string | number | Array<string | number> | { from?: string; to?: string };
}

export interface ChatMetric {
  name: 'test_count' | 'fail_count' | 'pass_count' | 'fail_rate' | 'error_count';
}

export interface ChatSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ChatQueryPlan {
  intent: ChatIntent;
  metrics: ChatMetric[];
  dimensions: string[];
  filters: ChatFilter[];
  timeRange?: {
    preset?: 'today' | 'yesterday' | 'last_7_days' | 'last_14_days' | 'last_30_days' | 'this_month';
    from?: string;
    to?: string;
  } | null;
  sort?: ChatSort[];
  limit?: number;
  visualizationHint: VisualizationHint;
  ambiguities: string[];
}

export interface ChatResponse {
  answer: string;
  sql: string;
  rows: unknown[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
  warnings: string[];
  visualizationHint: VisualizationHint;
}
