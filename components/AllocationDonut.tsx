export default function AllocationDonut({
  items,
  totalLabel,
}: {
  items: ReadonlyArray<{ label: string; value: number; tone: string }>;
  totalLabel: string;
}) {
  let cursor = 0;
  const stops = items
    .map((item) => {
      const start = cursor;
      cursor += item.value;
      return `var(--${item.tone}) ${start}% ${cursor}%`;
    })
    .join(", ");

  return (
    <div className="donut" style={{ background: `conic-gradient(${stops})` }}>
      <div className="donut-hole">
        <strong>{totalLabel}</strong>
        <span>Total</span>
      </div>
    </div>
  );
}
