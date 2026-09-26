"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/finance";
import { allocationBucketFor } from "@/lib/allocation-buckets";
import type { Holding } from "@/lib/demo-data";

type AllocationItem = { label: string; value: number; tone: string };

const SIZE = 220;
const RADIUS = 84;
const STROKE = 36;
const CIRC = 2 * Math.PI * RADIUS;

export default function AllocationExplorer({
  items,
  holdings,
  total,
}: {
  items: ReadonlyArray<AllocationItem>;
  holdings: Holding[];
  total: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const visible = useMemo(() => items.filter((item) => item.value > 0), [items]);

  const bucketed = useMemo(() => {
    const map = new Map<string, Holding[]>();
    for (const holding of holdings) {
      const bucket = allocationBucketFor(holding);
      const list = map.get(bucket);
      if (list) list.push(holding);
      else map.set(bucket, [holding]);
    }
    for (const list of map.values()) list.sort((a, b) => b.value - a.value);
    return map;
  }, [holdings]);

  const selectedHoldings = selected ? bucketed.get(selected) ?? [] : [];
  const selectedValue = selectedHoldings.reduce((sum, h) => sum + h.value, 0);
  const selectedPct = total > 0 ? (selectedValue / total) * 100 : 0;

  let cursor = 0;
  const segments = visible.map((item) => {
    const start = cursor;
    cursor += item.value / 100;
    return { ...item, start, frac: item.value / 100 };
  });

  const toggle = (label: string) =>
    setSelected((current) => (current === label ? null : label));

  return (
    <div className="alloc-explorer">
      <div className="alloc-explorer-top">
        <div className="alloc-donut-wrap">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="alloc-donut"
            role="img"
            aria-label="Asset allocation donut. Select a segment to filter positions."
          >
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke="var(--line)"
                strokeWidth={STROKE}
                opacity={0.35}
              />
              {segments.map((segment) => (
                <circle
                  key={segment.label}
                  className="alloc-seg"
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={`var(--${segment.tone})`}
                  strokeWidth={STROKE}
                  strokeDasharray={`${segment.frac * CIRC} ${CIRC}`}
                  strokeDashoffset={-(segment.start * CIRC)}
                  opacity={!selected || selected === segment.label ? 1 : 0.16}
                  onClick={() => toggle(segment.label)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggle(segment.label);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === segment.label}
                  aria-label={`${segment.label}, ${segment.value} percent`}
                >
                  <title>{`${segment.label} — ${segment.value}%`}</title>
                </circle>
              ))}
            </g>
          </svg>
          <div className="alloc-donut-center">
            <strong>{selected ? money(selectedValue) : money(total)}</strong>
            <span>
              {selected ? `${selectedPct.toFixed(1)}% · ${selected}` : "Total invested"}
            </span>
          </div>
        </div>

        <ul className="alloc-legend">
          {visible.map((item) => {
            const active = selected === item.label;
            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => toggle(item.label)}
                  aria-pressed={active}
                  className={active ? "is-active" : ""}
                >
                  <span className={"dot " + item.tone} />
                  <span className="alloc-legend-label">{item.label}</span>
                  <span className="alloc-legend-values">
                    {item.value}% · {money((item.value / 100) * total)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {selected ? (
        <div className="alloc-filter-panel">
          <div className="alloc-filter-head">
            <strong>
              {selected} · {selectedHoldings.length} position
              {selectedHoldings.length === 1 ? "" : "s"} · {money(selectedValue)}
            </strong>
            <button type="button" className="text-button" onClick={() => setSelected(null)}>
              Clear filter
            </button>
          </div>
          {selectedHoldings.length ? (
            <div className="alloc-holdings">
              {selectedHoldings.map((holding) => {
                const weight = total > 0 ? (holding.value / total) * 100 : 0;
                return (
                  <Link
                    className="alloc-holding-row"
                    href={`/portfolio/${holding.ticker.toLowerCase()}`}
                    key={holding.ticker}
                  >
                    <span className="holding-name">
                      <strong>{holding.ticker}</strong>
                      <small>{holding.name}</small>
                    </span>
                    <strong>{money(holding.value)}</strong>
                    <span>{weight.toFixed(1)}%</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="small-muted">No positions in this class.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
