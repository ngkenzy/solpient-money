import Link from "next/link";
import { money } from "@/lib/finance";
import { heatColor, squarifiedTreemap } from "@/lib/treemap";
import type { Holding } from "@/lib/demo-data";

const MAP_W = 100;
const MAP_H = 62.5;

export default function HoldingsHeatmap({
  holdings,
}: {
  holdings: Holding[];
}) {
  const active = holdings.filter((h) => h.value > 0);
  const total = active.reduce((sum, h) => sum + h.value, 0);

  const bySector = new Map<string, Holding[]>();
  for (const holding of active) {
    const list = bySector.get(holding.sector);
    if (list) list.push(holding);
    else bySector.set(holding.sector, [holding]);
  }
  const sectors = [...bySector.entries()]
    .map(([sector, items]) => ({
      sector,
      items,
      value: items.reduce((sum, h) => sum + h.value, 0),
    }))
    .sort((a, b) => b.value - a.value);

  const sectorRects = squarifiedTreemap(sectors, 0, 0, MAP_W, MAP_H);
  const hasDayData = active.some((h) => h.dayChange !== 0);

  return (
    <div>
      <div className="heatmap" role="img" aria-label="Holdings heatmap">
        {sectors.map((group, gi) => {
          const sr = sectorRects[gi];
          const pad = 1.1;
          const labelH = 3.2;
          const showLabel = sr.h > 10 && sr.w > 14;
          const topPad = pad + (showLabel ? labelH : 0);
          const tiles = squarifiedTreemap(
            group.items,
            sr.x + pad,
            sr.y + topPad,
            Math.max(0, sr.w - pad * 2),
            Math.max(0, sr.h - topPad - pad)
          );
          return (
            <div
              key={group.sector}
              className="heatmap-sector"
              style={{
                left: `${sr.x}%`,
                top: `${(sr.y / MAP_H) * 100}%`,
                width: `${sr.w}%`,
                height: `${(sr.h / MAP_H) * 100}%`,
              }}
            >
              {showLabel && (
                <span className="heatmap-sector-label">{group.sector}</span>
              )}
              {group.items.map((holding, hi) => {
                const tile = tiles[hi];
                if (!tile || tile.w <= 0 || tile.h <= 0) return null;
                const weight = total > 0 ? (holding.value / total) * 100 : 0;
                const showDetail = tile.w > 10 && tile.h > 9;
                const day = holding.dayChange;
                return (
                  <Link
                    key={holding.ticker}
                    href={`/portfolio/${holding.ticker.toLowerCase()}`}
                    className="heatmap-tile"
                    style={{
                      left: `${tile.x}%`,
                      top: `${(tile.y / MAP_H) * 100}%`,
                      width: `${tile.w}%`,
                      height: `${(tile.h / MAP_H) * 100}%`,
                      background: heatColor(day),
                    }}
                    title={`${holding.name} · ${money(holding.value)} (${weight.toFixed(1)}% of portfolio)${
                      day ? ` · ${day > 0 ? "+" : ""}${day.toFixed(2)}% today` : ""
                    }`}
                  >
                    <strong>{holding.ticker}</strong>
                    {showDetail && (
                      <span>
                        {day > 0 ? "+" : ""}
                        {day.toFixed(2)}%
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="heatmap-legend">
        <span className="heatmap-legend-item">
          <i className="heatmap-sw" style={{ background: heatColor(2) }} /> Up
          today
        </span>
        <span className="heatmap-legend-item">
          <i className="heatmap-sw" style={{ background: heatColor(0) }} />
          Flat / no data
        </span>
        <span className="heatmap-legend-item">
          <i className="heatmap-sw" style={{ background: heatColor(-2) }} />
          Down today
        </span>
        {!hasDayData && (
          <span className="small-muted">
            Day changes appear after a price refresh.
          </span>
        )}
      </div>
    </div>
  );
}
