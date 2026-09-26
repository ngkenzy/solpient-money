#!/usr/bin/env bash
# v215 — Allocation merged into Portfolio: the standalone /allocation route is
# gone; its content (donut + class list with dollar values + sector exposures)
# lives in the portfolio allocation section.
set -euo pipefail

PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); echo "ok   $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "FAIL $1"; }

expect_grep() { # file, pattern, label
  if grep -q "$2" "$1"; then ok "$3"; else bad "$3 (missing: $2)"; fi
}

expect_absent() { # file, pattern, label
  if grep -q "$2" "$1"; then bad "$3 (still present: $2)"; else ok "$3"; fi
}

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORTFOLIO="$ROOT/app/portfolio/page.tsx"
SHELL="$ROOT/components/AppShell.tsx"
PALETTE="$ROOT/components/CommandPalette.tsx"
TSP_ACTIONS="$ROOT/app/tsp/actions.ts"
PORT_ACTIONS="$ROOT/app/portfolio/actions.ts"

# ---------- Route removed ----------
if [ -f "$ROOT/app/allocation/page.tsx" ]; then bad "app/allocation/page.tsx deleted"; else ok "app/allocation/page.tsx deleted"; fi
expect_absent "$SHELL" '"/allocation"' "nav no longer links to /allocation"
expect_absent "$PALETTE" '"/allocation"' "palette no longer links to /allocation"
expect_absent "$PORTFOLIO" 'href="/allocation"' "portfolio no longer links out to /allocation"
expect_absent "$TSP_ACTIONS" '"/allocation"' "tsp actions no longer revalidate /allocation"
expect_absent "$PORT_ACTIONS" '"/allocation"' "portfolio actions no longer revalidate /allocation"
expect_absent "$SHELL" 'BarChart3' "nav no longer imports BarChart3"
expect_absent "$PALETTE" 'BarChart3' "palette no longer imports BarChart3"

# ---------- Content merged into the portfolio allocation section ----------
expect_grep "$PORTFOLIO" 'id="allocation"' "portfolio keeps the allocation anchor"
expect_grep "$PORTFOLIO" 'allocation-page-grid' "portfolio uses the two-column allocation grid"
expect_grep "$PORTFOLIO" 'AllocationDonut' "portfolio renders the allocation donut"
expect_grep "$PORTFOLIO" 'By sector / sleeve' "portfolio includes sector exposures"
expect_grep "$PORTFOLIO" 'bar-track' "portfolio renders exposure bars"
expect_grep "$PORTFOLIO" 'bySector' "portfolio computes sector aggregation"
expect_grep "$PORTFOLIO" 'money(classDollars)' "class list shows dollar values"
expect_grep "$PORTFOLIO" '{item.value}% ·' "class list still shows percentages"

# ---------- Palette still covers every remaining page ----------
for href in '"/"' '"/accounts"' '"/connect"' '"/transactions"' '"/cash-flow"' '"/portfolio"' '"/portfolio-intelligence"' '"/performance"' '"/tsp"' '"/budget"' '"/plan"' '"/monitor"' '"/goals"' '"/data-health"' '"/data"'; do
  expect_grep "$PALETTE" "href: $href" "palette still links to $href"
done

echo "----"
echo "v215: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
