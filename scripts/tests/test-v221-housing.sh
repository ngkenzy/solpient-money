#!/usr/bin/env bash
# v221 — Housing: home value + mortgage debt in one place; accounts area cleanup.
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
ACTIONS="$ROOT/app/data/actions.ts"
PAGE="$ROOT/app/data/page.tsx"
CSS="$ROOT/app/globals.css"

# ---------- saveHousing server action ----------
expect_grep "$ACTIONS" 'export async function saveHousing' "saveHousing exported"
expect_grep "$ACTIONS" 'balance_cents: cents(homeValue)' "home value stored as a positive balance"
expect_grep "$ACTIONS" 'balance_cents: cents(-mortgageOwed)' "mortgage owed stored as a negative balance"
expect_grep "$ACTIONS" 'mortgageOwed > 0' "mortgage account only created when something is owed"
expect_grep "$ACTIONS" 'mortgageSelection === "none"' "'No mortgage' selection skips the debt account"
expect_grep "$ACTIONS" '.eq("account_type", "property")' "home update guarded to property accounts"
expect_grep "$ACTIONS" '.eq("account_type", "debt")' "mortgage update guarded to debt accounts"

# ---------- Housing UI ----------
expect_grep "$PAGE" 'saveHousing' "data page imports saveHousing"
expect_grep "$PAGE" 'action={saveHousing}' "housing form submits to saveHousing"
expect_grep "$PAGE" 'name="home_value"' "home value field present"
expect_grep "$PAGE" 'name="mortgage_balance"' "mortgage owed field present"
expect_grep "$PAGE" 'name="home_account_id"' "home account picker present"
expect_grep "$PAGE" 'name="mortgage_account_id"' "mortgage account picker present"
expect_grep "$PAGE" 'Home equity' "equity readout present"
expect_grep "$PAGE" 'mortgage|home' "mortgage account auto-detected by name"

# ---------- Cleanup: slimmer add-account form ----------
expect_absent "$PAGE" 'APR % if debt' "add-account form no longer carries debt-only APR fields"

# ---------- Styling ----------
expect_grep "$CSS" '\.housing-form' "housing form styles present"
expect_grep "$CSS" '\.accounts-editor-row' "accounts editor styles present"

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
echo "v221: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
