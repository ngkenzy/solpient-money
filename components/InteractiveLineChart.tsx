"use client";

import { useMemo, useState } from "react";

type Point = {
  label: string;
  [key: string]: string | number;
};

type Series = {
  key: string;
  label: string;
  format?: "currency" | "percent" | "number";
};

const rangeSizes: Record<string, number> = {
  "1M": 2,
  "3M": 4,
  YTD: 12,
  "1Y": 12,
  ALL: 999,
};

function formatValue(value: number, format: Series["format"]) {
  if (format === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (format === "percent") return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  return value.toLocaleString("en-US");
}

export default function InteractiveLineChart({
  data,
  series,
  defaultRange = "YTD",
  height = 210,
}: {
  data: Point[];
  series: Series[];
  defaultRange?: string;
  height?: number;
}) {
  const [range, setRange] = useState(defaultRange);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const visible = useMemo(() => {
    const size = rangeSizes[range] ?? data.length;
    return data.slice(Math.max(0, data.length - size));
  }, [data, range]);

  const width = 780;
  const padX = 38;
  const padY = 24;
  const values = visible.flatMap((row) =>
    series.map((item) => Number(row[item.key] ?? 0))
  );
  const lowRaw = Math.min(...values);
  const highRaw = Math.max(...values);
  const spread = Math.max(highRaw - lowRaw, 1);
  const low = lowRaw - spread * 0.12;
  const high = highRaw + spread * 0.12;

  const xAt = (index: number) =>
    padX + (index / Math.max(visible.length - 1, 1)) * (width - padX * 2);
  const yAt = (value: number) =>
    height - padY - ((value - low) / Math.max(high - low, 1)) * (height - padY * 2);

  const colors = ["#1769e0", "#8a99ad", "#2f8d68"];
  const activeIndex = hoverIndex ?? visible.length - 1;
  const activePoint = visible[activeIndex];

  function onMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = (x - padX) / (width - padX * 2);
    const index = Math.round(Math.max(0, Math.min(1, ratio)) * (visible.length - 1));
    setHoverIndex(index);
  }

  return (
    <div className="interactive-chart">
      <div className="chart-toolbar">
        <div className="chart-live-values">
          {series.map((item, index) => (
            <span key={item.key}>
              <i style={{ background: colors[index % colors.length] }} />
              {item.label}
              <strong>{formatValue(Number(activePoint?.[item.key] ?? 0), item.format)}</strong>
            </span>
          ))}
        </div>
        <div className="periods">
          {Object.keys(rangeSizes).map((option) => (
            <button
              key={option}
              className={range === option ? "period-active" : ""}
              onClick={() => {
                setRange(option);
                setHoverIndex(null);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <svg
        className="line-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Interactive financial history chart"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {[0.2, 0.5, 0.8].map((ratio) => (
          <line
            key={ratio}
            x1={padX}
            x2={width - padX}
            y1={padY + (height - padY * 2) * ratio}
            y2={padY + (height - padY * 2) * ratio}
            className="chart-grid"
          />
        ))}
        {series.map((item, seriesIndex) => {
          const points = visible
            .map((row, index) => `${xAt(index)},${yAt(Number(row[item.key] ?? 0))}`)
            .join(" ");
          return (
            <polyline
              key={item.key}
              points={points}
              fill="none"
              stroke={colors[seriesIndex % colors.length]}
              strokeWidth={seriesIndex === 0 ? 3 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {activePoint ? (
          <>
            <line
              x1={xAt(activeIndex)}
              x2={xAt(activeIndex)}
              y1={padY}
              y2={height - padY}
              className="chart-cursor"
            />
            {series.map((item, seriesIndex) => (
              <circle
                key={item.key}
                cx={xAt(activeIndex)}
                cy={yAt(Number(activePoint[item.key] ?? 0))}
                r="5"
                fill="white"
                stroke={colors[seriesIndex % colors.length]}
                strokeWidth="3"
              />
            ))}
          </>
        ) : null}
      </svg>

      <div className="chart-label-row">
        {visible.map((row, index) =>
          index === 0 || index === visible.length - 1 || index === Math.floor(visible.length / 2) ? (
            <span key={row.label}>{row.label}</span>
          ) : null
        )}
      </div>
    </div>
  );
}
