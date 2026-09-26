#!/usr/bin/env bash
# v220 — Edit accounts: updateAccount action + Data page edit section.
set -euo pipefail

PASS=0
FAIL=0

ok()  { PASS=$((PASS + 1)); echo "ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $1"; }

expect_grep() {
  if grep -q "$2" "$1"; then ok "$3"; else bad "$3 (missing: $2)"; fi
}

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ACTIONS="$ROOT/app/data/actions.ts"
PAGE="$ROOT/app/data/page.tsx"

# ---------- Server action ----------
[ -f "$ACTIONS" ] && ok "app/data/actions.ts exists" || bad "app/data/actions.ts exists"
expect_grep "$ACTIONS" 'export async function updateAccount' "updateAccount exported"
expect_grep "$ACTIONS" 'account_type === "debt" ? -Math.abs' "debt balances stay negative on update"
expect_grep "$ACTIONS" '.eq("household_id", householdId)' "update scoped to household"
expect_grep "$ACTIONS" 'revalidatePath' "update revalidates pages"

# ---------- Data page UI ----------
expect_grep "$PAGE" 'updateAccount' "data page imports updateAccount"
expect_grep "$PAGE" 'Edit accounts' "edit accounts section present"
expect_grep "$PAGE" 'action={updateAccount}' "edit forms submit to updateAccount"
expect_grep "$PAGE" 'name="balance"' "balance field editable"
expect_grep "$PAGE" 'account.type === "debt"' "debt accounts show APR/minimum payment fields"

echo "----"
echo "v220: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
