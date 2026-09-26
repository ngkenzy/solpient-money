#!/usr/bin/env bash
# v217 — Portfolio performance replaced with real Gains; the dead
# /performance page (demo-seeded benchmark chart) is removed.
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
PORTFOLIO="$ROOT/app/portfolio/page.tsx"
SHELL="$ROOT/components/AppShell.tsx"
PALETTE="$ROOT/components/CommandPalette.tsx"
GAINS="$ROOT/lib/gains.ts"
CSS="$ROOT/app/globals.css"

# ---------- Dead performance page removed ----------
if [ -f "$ROOT/app/performance/page.tsx" ]; then bad "app/performance/page.tsx deleted"; else ok "app/performance/page.tsx deleted"; fi
expect_absent "$SHELL" '"/performance"' "nav no longer links to /performance"
expect_absent "$PALETTE" '"/performance"' "palette no longer links to /performance"
expect_absent "$SHELL" 'LineChart' "nav no longer imports LineChart"
expect_absent "$PALETTE" 'LineChart' "palette no longer imports LineChart"
expect_grep "$PALETTE" 'href: "/tsp"' "palette still links to remaining pages"

# ---------- Gains library ----------
[ -f "$GAINS" ] && ok "lib/gains.ts exists" || bad "lib/gains.ts exists"
expect_grep "$GAINS" 'export function computeGains' "computeGains exported"
expect_grep "$GAINS" 'costBasis > 0' "holdings without cost basis are excluded"

# ---------- Portfolio gains section ----------
expect_grep "$PORTFOLIO" 'computeGains' "portfolio computes real gains"
expect_grep "$PORTFOLIO" 'id="performance"' "portfolio keeps the performance anchor"
expect_grep "$PORTFOLIO" 'Total gain / loss' "gains hero present"
expect_grep "$PORTFOLIO" 'gains-list' "ranked gains list present"
expect_grep "$PORTFOLIO" 'bar-gain' "diverging gain bars present"
expect_grep "$PORTFOLIO" 'bar-loss' "diverging loss bars present"
expect_grep "$PORTFOLIO" 'report cost basis' "cost-basis coverage note present"
expect_absent "$PORTFOLIO" 'InteractiveLineChart' "dead chart removed from portfolio"
expect_absent "$PORTFOLIO" 'portfolioPerformance' "demo-seeded series no longer rendered"
expect_absent "$PORTFOLIO" 'Portfolio vs benchmark' "benchmark headline gone"
expect_absent "$PORTFOLIO" 'Open performance' "link to deleted page gone"
expect_absent "$PORTFOLIO" 'portfolio-layout' "sections stack full-width"

# ---------- Styles ----------
expect_grep "$CSS" 'gains-hero' "gains hero styles present"
expect_grep "$CSS" 'gains-track' "diverging bar track styles present"
expect_grep "$CSS" 'bar-gain' "gain bar styles present"

echo "---- runtime: gains math ----"
RUNTIME_OUT="$(node --experimental-strip-types --no-warnings -e "
import('./lib/gains.ts').then((m) => {
  const holdings = [
    { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', kind: 'etf', shares: 820.5, price: 292.5, costBasis: 204100, value: 240000, dayChange: 0.6, ytdReturn: 11.8, sector: 'Broad Market' },
    { ticker: 'ADBE', name: 'Adobe', kind: 'stock', shares: 372.2, price: 317.03, costBasis: 132500, value: 118000, dayChange: -0.8, ytdReturn: -10.9, sector: 'Technology' },
    { ticker: 'CASH', name: 'Cash', kind: 'cash', shares: 5000, price: 1, costBasis: 0, value: 5000, dayChange: 0, ytdReturn: 0, sector: 'Cash' },
  ];
  const g = m.computeGains(holdings);
  const checks = [
    ['ranked winner first', g.ranked[0].ticker === 'VTI'],
    ['ranked loser second', g.ranked[1].ticker === 'ADBE'],
    ['zero-basis excluded', g.ranked.length === 2 && g.withCostBasis === 2],
    ['winner gain', g.ranked[0].gain === 35900],
    ['winner pct', Math.abs(g.ranked[0].gainPct - 17.5894) < 0.001],
    ['loser gain', g.ranked[1].gain === -14500],
    ['total cost', g.totalCost === 336600],
    ['total gain', g.totalGain === 21400],
    ['total pct', Math.abs(g.totalGainPct - 6.3578) < 0.001],
    ['max abs', g.maxAbsGain === 35900],
  ];
  let fail = 0;
  for (const [label, cond] of checks) { if (!cond) { fail++; console.log('MISMATCH', label); } }
  console.log('runtime: ' + (checks.length - fail) + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
" 2>&1)"
echo "$RUNTIME_OUT"
if echo "$RUNTIME_OUT" | grep -q "0 failed"; then
  PASS=$((PASS + 10)); ok "runtime checks counted (10)"
else
  FAIL=$((FAIL + 1)); bad "runtime gains math"
fi

echo "----"
echo "v217: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
