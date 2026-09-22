export default function AllocationDonut({
  items,
  totalLabel,
}: {
  items: ReadonlyArray<{ label: string; value: number; tone: string }>;
  totalLabel: string;
}) {
  const segments = items.map((item, index) => {
    const start = items.slice(0, index).reduce((sum, prior) => sum + prior.value, 0);
    const end = start + item.value;
    return `var(--${item.tone}) ${start}% ${end}%`;
  });
  const stops = segments.join(", ");

  return (
    <div className="donut" style={{ background: `conic-gradient(${stops})` }}>
      <div className="donut-hole">
        <strong>{totalLabel}</strong>
        <span>Total</span>
      </div>
    </div>
  );
}
