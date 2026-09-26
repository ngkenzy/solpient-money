import type { Holding } from "./demo-data";

export type AllocationBucketDef = {
  label: string;
  tone: string;
  matches: (holding: Holding) => boolean;
};

// Single source of truth for allocation buckets. Used by buildAllocation
// (lib/money-data.ts) and by the AllocationExplorer filter.
export const ALLOCATION_BUCKETS: AllocationBucketDef[] = [
  {
    label: "U.S. equities",
    tone: "navy",
    matches: (holding) =>
      (holding.kind === "stock" || holding.kind === "etf") &&
      holding.sector !== "International" &&
      holding.sector !== "Lifecycle",
  },
  {
    label: "International",
    tone: "blue",
    matches: (holding) => holding.sector === "International",
  },
  {
    label: "Bonds",
    tone: "sky",
    matches: (holding) => holding.kind === "bond",
  },
  {
    label: "Cash",
    tone: "green",
    matches: (holding) => holding.kind === "cash",
  },
];

export const OTHER_BUCKET_LABEL = "Other";
export const OTHER_BUCKET_TONE = "slate";

export function allocationBucketFor(holding: Holding): string {
  return ALLOCATION_BUCKETS.find((bucket) => bucket.matches(holding))?.label ?? OTHER_BUCKET_LABEL;
}
