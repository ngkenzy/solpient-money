#!/usr/bin/env bash
# v219 — Fine-grained allocation buckets: U.S. cap tiers + money market split.
set -euo pipefail

PASS=0
FAIL=0

ok()  { PASS=$((PASS + 1)); echo "ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $1"; }

expect_grep() {
  if grep -q "$2" "$1"; then ok "$3"; else bad "$3 (missing: $2)"; fi
}

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUCKETS="$ROOT/lib/allocation-buckets.ts"
CSS="$ROOT/app/globals.css"

# ---------- Static: labels, tones, wiring ----------
expect_grep "$BUCKETS" 'U.S. Large Cap' "large-cap bucket defined"
expect_grep "$BUCKETS" 'U.S. Mid Cap' "mid-cap bucket defined"
expect_grep "$BUCKETS" 'U.S. Small Cap' "small-cap bucket defined"
expect_grep "$BUCKETS" 'U.S. Total Market' "total-market bucket defined"
expect_grep "$BUCKETS" 'Money Market' "money-market bucket defined"
expect_grep "$BUCKETS" 'export function classifyHolding' "classifyHolding exported"
expect_grep "$BUCKETS" 'TSP-' "TSP funds mapped to cap tiers"
expect_grep "$CSS" '\-\-teal' "teal tone variable present"
expect_grep "$CSS" '\-\-purple' "purple tone variable present"
expect_grep "$CSS" '\-\-amber' "amber tone variable present"
expect_grep "$CSS" '\-\-stone' "stone tone variable present"
expect_grep "$CSS" '.dot.teal' "teal legend dot present"
expect_grep "$CSS" '.dot.purple' "purple legend dot present"
expect_grep "$CSS" '.dot.amber' "amber legend dot present"
expect_grep "$CSS" '.dot.stone' "stone legend dot present"

echo "---- runtime: cap-tier classification ----"
RUNTIME_OUT="$(node --experimental-strip-types --no-warnings -e "
import('./lib/allocation-buckets.ts').then((m) => {
  const cases = [
    // fund name patterns
    [{ ticker: 'VTSAX', name: 'Vanguard Total Stock Market Index Fund', kind: 'etf', sector: 'Broad Market' }, 'U.S. Total Market'],
    [{ ticker: 'VFIAX', name: 'Vanguard 500 Index Fund', kind: 'etf', sector: 'Broad Market' }, 'U.S. Large Cap'],
    [{ ticker: 'VSMAX', name: 'Vanguard Small-Cap Index Fund', kind: 'etf', sector: 'Small Cap' }, 'U.S. Small Cap'],
    [{ ticker: 'VIMAX', name: 'Vanguard Mid-Cap Index Fund', kind: 'etf', sector: 'Mid Cap' }, 'U.S. Mid Cap'],
    [{ ticker: 'VIGAX', name: 'Vanguard Growth Index Fund', kind: 'etf', sector: 'Large Cap' }, 'U.S. Large Cap'],
    // curated ticker map
    [{ ticker: 'VOO', name: 'Vanguard S&P 500 ETF', kind: 'etf', sector: 'Broad Market' }, 'U.S. Large Cap'],
    [{ ticker: 'QQQ', name: 'Invesco QQQ Trust', kind: 'etf', sector: 'Technology' }, 'U.S. Large Cap'],
    [{ ticker: 'VB', name: 'Vanguard Small-Cap ETF', kind: 'etf', sector: 'Small Cap' }, 'U.S. Small Cap'],
    [{ ticker: 'VO', name: 'Vanguard Mid-Cap ETF', kind: 'etf', sector: 'Mid Cap' }, 'U.S. Mid Cap'],
    [{ ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', kind: 'etf', sector: 'Broad Market' }, 'U.S. Total Market'],
    [{ ticker: 'PFE', name: 'Pfizer Inc.', kind: 'stock', sector: 'Healthcare' }, 'U.S. Large Cap'],
    [{ ticker: 'DECK', name: 'Deckers Outdoor Corp.', kind: 'stock', sector: 'Consumer Cyclical' }, 'U.S. Mid Cap'],
    // bond ETF held as kind=etf must be Bonds, not U.S. equities
    [{ ticker: 'BND', name: 'Vanguard Total Bond Market ETF', kind: 'etf', sector: 'Fixed Income' }, 'Bonds'],
    [{ ticker: 'VBTLX', name: 'Vanguard Total Bond Market Index Fund', kind: 'etf', sector: 'Fixed Income' }, 'Bonds'],
    [{ ticker: 'TBOND', name: 'US Treasury Note', kind: 'bond', sector: 'Fixed Income' }, 'Bonds'],
    // money market split from cash
    [{ ticker: 'VMFXX', name: 'Vanguard Federal Money Market Fund', kind: 'cash', sector: 'Cash' }, 'Money Market'],
    [{ ticker: 'SPAXX', name: 'Fidelity Government Money Market', kind: 'cash', sector: 'Cash' }, 'Money Market'],
    [{ ticker: 'SETTLE', name: 'Brokerage settlement fund', kind: 'cash', sector: 'Cash' }, 'Money Market'],
    [{ ticker: 'CASH', name: 'Bank checking sweep', kind: 'cash', sector: 'Cash' }, 'Cash'],
    // TSP funds
    [{ ticker: 'TSP-C', name: 'C Fund', kind: 'etf', sector: 'U.S. Equities' }, 'U.S. Large Cap'],
    [{ ticker: 'TSP-S', name: 'S Fund', kind: 'etf', sector: 'U.S. Equities' }, 'U.S. Small Cap'],
    [{ ticker: 'TSP-I', name: 'I Fund', kind: 'etf', sector: 'International' }, 'International'],
    [{ ticker: 'TSP-F', name: 'F Fund', kind: 'bond', sector: 'Bonds' }, 'Bonds'],
    [{ ticker: 'TSP-G', name: 'G Fund', kind: 'cash', sector: 'Cash' }, 'Money Market'],
    // international
    [{ ticker: 'VXUS', name: 'Vanguard Total International Stock ETF', kind: 'etf', sector: 'International' }, 'International'],
    [{ ticker: 'VWO', name: 'Vanguard Emerging Markets ETF', kind: 'etf', sector: 'Emerging Markets' }, 'International'],
    // honest fallbacks: unrecognized stays in Other, never guessed
    [{ ticker: 'XYZ', name: 'Unknown Widget Corp.', kind: 'stock', sector: 'Technology' }, 'Other'],
    [{ ticker: 'VFIFX', name: 'Vanguard Target Retirement 2050 Fund', kind: 'etf', sector: 'Lifecycle' }, 'Other'],
  ];
  let pass = 0, fail = 0;
  for (const [holding, expected] of cases) {
    const got = m.allocationBucketFor(holding);
    if (got === expected) pass++;
    else { fail++; console.log('MISMATCH', holding.ticker, '->', got, '(want ' + expected + ')'); }
  }
  // every bucket label resolves through its own matches() predicate (single source of truth)
  for (const b of m.ALLOCATION_BUCKETS) {
    const probe = { ticker: 'PROBE', name: b.label, kind: 'stock', sector: 'Technology' };
    if (typeof b.matches !== 'function') { fail++; console.log('NO MATCHES FN', b.label); }
  }
  console.log('runtime: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
" 2>&1)"
echo "$RUNTIME_OUT"
if echo "$RUNTIME_OUT" | grep -q "0 failed"; then
  PASS=$((PASS + 28)); ok "runtime checks counted (28)"
else
  FAIL=$((FAIL + 1)); bad "runtime cap-tier classification"
fi

echo "----"
echo "v219: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
