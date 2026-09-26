#!/usr/bin/env bash
# v222 — Portfolio "Total wealth" chart: the house is visible on the Portfolio
# page as a proper chart without polluting the investable allocation math.
set -euo pipefail

PASS=0
FAIL=0

ok()  { PASS=$((PASS + 1)); echo "ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $1"; }

expect_grep() {
  if grep -q "$2" "$1"; then ok "$3"; else bad "$3 (missing: $2)"; fi
}

expect_absent() {
  if grep -q "$2" "$1"; then bad "$3 (should be gone: $2)"; else ok "$3"; fi
}

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PAGE="$ROOT/app/portfolio/page.tsx"
MONEYDAT="$ROOT/lib/money-data.ts"
CSS="$ROOT/app/globals.css"

# ---------- Wealth chart ----------
expect_grep "$PAGE" 'homeEquity' "portfolio page computes home equity"
expect_grep "$PAGE" 'a.type === "property"' "equity sourced from the property account"
expect_grep "$PAGE" 'mortgage|home' "mortgage auto-detected by name"
expect_grep "$PAGE" 'Total wealth' "total wealth section rendered"
expect_grep "$PAGE" 'wealth-bar' "stacked wealth bar present"
expect_grep "$PAGE" 'wealth-segment' "bar segments present"
expect_grep "$PAGE" 'Home equity' "home equity shown in the legend"
expect_grep "$PAGE" 'combinedWealth' "combined total computed"
expect_absent "$PAGE" 'portfolio-context-line' "old text-only reference line removed"

# ---------- Allocation math untouched ----------
expect_grep "$MONEYDAT" 'function buildAllocation(holdings: Holding\[\])' "allocation still built from holdings only"
expect_grep "$PAGE" 'total={metrics.total}' "explorer total still the investable total"

# ---------- Styling ----------
expect_grep "$CSS" '\.wealth-bar' "wealth bar styles present"
expect_grep "$CSS" '\.wealth-legend' "wealth legend styles present"
expect_absent "$CSS" '\.portfolio-context-line' "old reference line styles removed"

# ---------- CSS brace balance (permanent guard) ----------
BRACE_CHECK=$(python3 - "$CSS" << 'EOF'
import re, sys
s = open(sys.argv[1]).read()
s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
print("BALANCED" if s.count("{") == s.count("}") else "BROKEN")
EOF
)
if [ "$BRACE_CHECK" = "BALANCED" ]; then ok "globals.css braces balanced"; else bad "globals.css braces balanced"; fi

echo "----"
echo "v222: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
