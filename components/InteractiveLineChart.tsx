"use client";

import { useId, useMemo, useState } from "react";

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

// Catmull-Rom spline rendered as cubic Bézier segments — smooths the
// polyline without overshooting the way naive curve fitting can.
export function buildSmoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]},${points[0][1]}`;
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

export function buildAreaPath(points: Array<[number, number]>, baseY: number): string {
  if (points.length === 0) return "";
  const line = buildSmoothPath(points);
  const firstX = points[0][0].toFixed(2);
  const lastX = points[points.length - 1][0].toFixed(2);
  return `${line} L ${lastX},${baseY.toFixed(2)} L ${firstX},${baseY.toFixed(2)} Z`;
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

  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];
  const activeIndex = hoverIndex ?? visible.length - 1;
  const activePoint = visible[activeIndex];
  const gradientId = `nw-area-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const baseY = height - padY;

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
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: colors[0] }} stopOpacity={0.25} />
            <stop offset="100%" style={{ stopColor: colors[0] }} stopOpacity={0} />
          </linearGradient>
        </defs>
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
          const coords = visible.map(
            (row, index) =>
              [xAt(index), yAt(Number(row[item.key] ?? 0))] as [number, number]
          );
          const line = buildSmoothPath(coords);
          return (
            <g key={item.key}>
              {seriesIndex === 0 ? (
                <path d={buildAreaPath(coords, baseY)} fill={`url(#${gradientId})`} stroke="none" />
              ) : null}
              <path
                d={line}
                fill="none"
                style={{ stroke: colors[seriesIndex % colors.length] }}
                strokeWidth={seriesIndex === 0 ? 3 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
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
                style={{ stroke: colors[seriesIndex % colors.length] }}
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
