#!/usr/bin/env bash
# v216 — Allocation explorer: full-width interactive asset mix on Portfolio.
set -euo pipefail

PASS=0
FAIL=0

ok()  { PASS=$((PASS + 1)); echo "ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $1"; }

expect_grep() {
  if grep -q "$2" "$1"; then ok "$3"; else bad "$3 (missing: $2)"; fi
}

expect_absent() {
  if grep -q "$2" "$1"; then bad "$3 (still present: $2)"; else ok "$3"; fi
}

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
EXPLORER="$ROOT/components/AllocationExplorer.tsx"
BUCKETS="$ROOT/lib/allocation-buckets.ts"
MONEY_DATA="$ROOT/lib/money-data.ts"
PORTFOLIO="$ROOT/app/portfolio/page.tsx"
CSS="$ROOT/app/globals.css"

# ---------- Shared bucket definitions ----------
[ -f "$BUCKETS" ] && ok "lib/allocation-buckets.ts exists" || bad "lib/allocation-buckets.ts exists"
expect_grep "$BUCKETS" 'export const ALLOCATION_BUCKETS' "ALLOCATION_BUCKETS exported"
expect_grep "$BUCKETS" 'export function allocationBucketFor' "allocationBucketFor exported"
expect_grep "$MONEY_DATA" 'ALLOCATION_BUCKETS' "buildAllocation uses shared bucket definitions"
expect_absent "$MONEY_DATA" 'label: "U.S. equities"' "money-data no longer hardcodes bucket literals"

# ---------- Explorer component ----------
[ -f "$EXPLORER" ] && ok "components/AllocationExplorer.tsx exists" || bad "components/AllocationExplorer.tsx exists"
expect_grep "$EXPLORER" '"use client"' "explorer is a client component"
expect_grep "$EXPLORER" '<svg' "explorer renders an SVG donut"
expect_grep "$EXPLORER" 'alloc-seg' "explorer has clickable segments"
expect_grep "$EXPLORER" 'role="button"' "segments are keyboard-accessible"
expect_grep "$EXPLORER" 'aria-pressed' "selection state is announced"
expect_grep "$EXPLORER" 'Clear filter' "explorer has a clear-filter control"
expect_grep "$EXPLORER" 'allocationBucketFor' "explorer filters holdings with the shared bucketing"

# ---------- Portfolio wiring ----------
expect_grep "$PORTFOLIO" 'AllocationExplorer' "portfolio renders AllocationExplorer"
expect_absent "$PORTFOLIO" 'AllocationDonut' "portfolio no longer uses the static donut"
expect_absent "$PORTFOLIO" 'allocation-page-grid' "squeezed two-column grid removed"
expect_grep "$PORTFOLIO" 'alloc-exposures' "exposures sit below the explorer"
expect_grep "$PORTFOLIO" 'bar-grid two-col' "exposures use a two-column bar grid"
expect_grep "$PORTFOLIO" 'Select a class to see its positions' "filter hint present"

# ---------- Styles ----------
expect_grep "$CSS" 'alloc-explorer-top' "explorer layout styles present"
expect_grep "$CSS" 'alloc-donut-wrap' "donut sizing styles present"
expect_grep "$CSS" 'alloc-legend button' "legend button styles present"
expect_grep "$CSS" 'alloc-filter-panel' "filter panel styles present"
expect_grep "$CSS" 'bar-grid.two-col' "two-column bar grid styles present"

echo "---- runtime: bucket classification ----"
RUNTIME_OUT="$(node --experimental-strip-types --no-warnings -e "
import('./lib/allocation-buckets.ts').then((m) => {
  const cases = [
    [{ ticker: 'VFIAX', name: 'Vanguard 500 Index Fund', kind: 'etf', sector: 'Broad Market' }, 'U.S. Large Cap'],
    [{ ticker: 'VIMAX', name: 'Vanguard Mid-Cap Index Fund', kind: 'etf', sector: 'Mid Cap' }, 'U.S. Mid Cap'],
    [{ ticker: 'VSMAX', name: 'Vanguard Small-Cap Index Fund', kind: 'etf', sector: 'Small Cap' }, 'U.S. Small Cap'],
    [{ ticker: 'VTSAX', name: 'Vanguard Total Stock Market Index', kind: 'etf', sector: 'Broad Market' }, 'U.S. Total Market'],
    [{ ticker: 'VXUS', name: 'Vanguard Total International Stock ETF', kind: 'etf', sector: 'International' }, 'International'],
    [{ ticker: 'BND', name: 'Vanguard Total Bond Market ETF', kind: 'etf', sector: 'Fixed Income' }, 'Bonds'],
    [{ ticker: 'VMFXX', name: 'Vanguard Federal Money Market Fund', kind: 'cash', sector: 'Cash' }, 'Money Market'],
    [{ ticker: 'CASH', name: 'Bank sweep', kind: 'cash', sector: 'Cash' }, 'Cash'],
    [{ ticker: 'VFIFX', name: 'Vanguard Target Retirement 2050', kind: 'etf', sector: 'Lifecycle' }, 'Other'],
  ];
  let pass = 0, fail = 0;
  for (const [holding, expected] of cases) {
    if (m.allocationBucketFor(holding) === expected) pass++;
    else { fail++; console.log('MISMATCH', JSON.stringify(holding), '->', m.allocationBucketFor(holding)); }
  }
  const labels = m.ALLOCATION_BUCKETS.map((b) => b.label).join('|');
  const want = 'U.S. Large Cap|U.S. Mid Cap|U.S. Small Cap|U.S. Total Market|International|Bonds|Money Market|Cash';
  if (labels === want) pass++; else { fail++; console.log('ORDER', labels); }
  console.log('runtime: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
" 2>&1)"
echo "$RUNTIME_OUT"
if echo "$RUNTIME_OUT" | grep -q "0 failed"; then
  PASS=$((PASS + 10)); ok "runtime checks counted (10)"
else
  FAIL=$((FAIL + 1)); bad "runtime bucket classification"
fi

echo "----"
echo "v216: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
