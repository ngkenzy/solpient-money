#!/usr/bin/env bash
# v222 — Portfolio home-equity reference line: the house is visible on the
# Portfolio page without polluting the investable allocation math.
set -euo pipefail

PASS=0
FAIL=0

ok()  { PASS=$((PASS + 1)); echo "ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $1"; }

expect_grep() {
  if grep -q "$2" "$1"; then ok "$3"; else bad "$3 (missing: $2)"; fi
}

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PAGE="$ROOT/app/portfolio/page.tsx"
MONEYDAT="$ROOT/lib/money-data.ts"
CSS="$ROOT/app/globals.css"

# ---------- Reference line ----------
expect_grep "$PAGE" 'homeEquity' "portfolio page computes home equity"
expect_grep "$PAGE" 'a.type === "property"' "equity sourced from the property account"
expect_grep "$PAGE" 'mortgage|home' "mortgage auto-detected by name"
expect_grep "$PAGE" 'Home equity' "reference line rendered on the page"
expect_grep "$PAGE" 'portfolio-context-line' "reference line uses its own style hook"

# ---------- Allocation math untouched ----------
expect_grep "$MONEYDAT" 'function buildAllocation(holdings: Holding\[\])' "allocation still built from holdings only"
expect_grep "$PAGE" 'total={metrics.total}' "explorer total still the investable total"

# ---------- Styling ----------
expect_grep "$CSS" '\.portfolio-context-line' "reference line styles present"

echo "----"
echo "v222: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
