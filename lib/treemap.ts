export type TreemapRect = { x: number; y: number; w: number; h: number };

function worstAspectRatio(rowAreas: number[], side: number): number {
  const sum = rowAreas.reduce((a, b) => a + b, 0);
  if (sum <= 0 || side <= 0) return Infinity;
  const max = Math.max(...rowAreas);
  const min = Math.min(...rowAreas);
  if (min <= 0) return Infinity;
  return Math.max(
    (side * side * max) / (sum * sum),
    (sum * sum) / (side * side * min)
  );
}

/**
 * Squarified treemap: lays out items as non-overlapping rectangles that tile
 * the (x, y, w, h) container, each rect's area proportional to its value.
 * Rects are returned in the same order as the input items.
 */
export function squarifiedTreemap<T extends { value: number }>(
  items: T[],
  x: number,
  y: number,
  w: number,
  h: number
): TreemapRect[] {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const empty = items.map(() => ({ x, y, w: 0, h: 0 }));
  if (total <= 0 || w <= 0 || h <= 0) return empty;

  const sorted = items
    .map((item, index) => ({ index, area: (item.value / total) * w * h }))
    .sort((a, b) => b.area - a.area);

  const rects: TreemapRect[] = new Array(items.length);
  let cx = x;
  let cy = y;
  let cw = w;
  let ch = h;
  let row: Array<{ index: number; area: number }> = [];

  const layoutRow = () => {
    const sum = row.reduce((s, r) => s + r.area, 0);
    if (sum <= 0) {
      row = [];
      return;
    }
    if (cw >= ch) {
      const rowH = sum / cw;
      let rx = cx;
      for (const r of row) {
        const rw = r.area / rowH;
        rects[r.index] = { x: rx, y: cy, w: rw, h: rowH };
        rx += rw;
      }
      cy += rowH;
      ch -= rowH;
    } else {
      const rowW = sum / ch;
      let ry = cy;
      for (const r of row) {
        const rh = r.area / rowW;
        rects[r.index] = { x: cx, y: ry, w: rowW, h: rh };
        ry += rh;
      }
      cx += rowW;
      cw -= rowW;
    }
    row = [];
  };

  for (const item of sorted) {
    const side = Math.min(cw, ch);
    const areas = row.map((r) => r.area);
    const withWorst = worstAspectRatio([...areas, item.area], side);
    const withoutWorst = row.length ? worstAspectRatio(areas, side) : Infinity;
    if (row.length > 0 && withWorst > withoutWorst) layoutRow();
    row.push(item);
  }
  if (row.length) layoutRow();
  return rects;
}

/**
 * Heat color for a day-change percentage: green for up, red for down,
 * neutral slate for flat/missing. Intensity saturates at +/-3%.
 */
export function heatColor(dayChange: number | null | undefined): string {
  const dc =
    typeof dayChange === "number" && Number.isFinite(dayChange) ? dayChange : 0;
  const intensity = Math.min(Math.abs(dc) / 3, 1);
  const alpha = (0.14 + intensity * 0.62).toFixed(2);
  if (dc > 0.005) return `rgba(66, 173, 122, ${alpha})`;
  if (dc < -0.005) return `rgba(217, 88, 92, ${alpha})`;
  return "rgba(153, 165, 179, 0.22)";
}
