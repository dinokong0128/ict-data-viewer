import React, { useEffect, useRef } from 'react';

export type ChartDataset = {
  label: string;
  data: number[];
  backgroundColor?: string;
  borderColor?: string;
  stack?: string;
};

type ChartPanelProps = {
  labels: string[];
  datasets: ChartDataset[];
  chartType: 'bar' | 'line';
  onSelectDate: (label: string) => void;
};

export function ChartPanel({ labels, datasets, chartType, onSelectDate }: ChartPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadChart = async () => {
      if (!canvasRef.current) {
        return;
      }

      const mod = await import('chart.js/auto');
      if (!isMounted) {
        return;
      }

      if (chartRef.current) {
        chartRef.current.destroy();
      }

      const ChartConstructor = mod.default;
      chartRef.current = new ChartConstructor(canvasRef.current, {
        type: chartType,
        data: {
          labels,
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0
              }
            }
          },
          onClick: (_event, elements) => {
            if (!elements.length) {
              return;
            }
            const index = elements[0].index;
            const label = labels[index];
            if (label) {
              onSelectDate(label);
            }
          }
        }
      });
    };

    void loadChart();

    return () => {
      isMounted = false;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [labels, datasets, chartType, onSelectDate]);

  return (
    <div className="card chart-card" style={{ position: 'relative' }}>
      <canvas ref={canvasRef} />
      <p className="chart-hint">Click a bar/point to view detailed test rows for that date.</p>
    </div>
  );
}
