#!/usr/bin/env bash
# v224 — Spending drift: creeping merchants and brand-new spending patterns
# are detected from the household's own history (complements the existing
# single-transaction/category alerts and Bills Radar).
set -euo pipefail

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $1"; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/lib/spending-drift.ts"
PAGE="$ROOT/app/cash-flow/page.tsx"
CSS="$ROOT/app/globals.css"

# ---------- module shape ----------
if [ -f "$LIB" ]; then ok "lib/spending-drift.ts exists"; else bad "lib/spending-drift.ts exists"; fi
if grep -q "export function buildSpendingDrift" "$LIB"; then ok "pure builder exported"; else bad "pure builder exported"; fi
if grep -q "export async function getSpendingDrift" "$LIB"; then ok "server loader exported"; else bad "server loader exported"; fi
if grep -q "requireActiveHousehold" "$LIB"; then ok "household-scoped query"; else bad "household-scoped query"; fi
# read-only: no writes, no mutations
if grep -Eq "insert|update|delete|upsert" "$LIB"; then bad "read-only (no writes)"; else ok "read-only (no writes)"; fi

# ---------- runtime behavior (pure builder, imports stubbed) ----------
RUNTIME=$(python3 - "$LIB" << 'EOF'
import re, sys, subprocess, tempfile, os
s = open(sys.argv[1]).read()
s = s.replace('import "server-only";\n\n', "")
for imp in ['@/lib/money-auth', '@/lib/cash-flow-intelligence', '@/lib/local-calendar-date']:
    s = re.sub(r'import[^;]*"' + re.escape(imp) + r'";\n', '', s)
s = s[:s.find("export async function getSpendingDrift")].rstrip() + "\n"
d = tempfile.mkdtemp()
open(os.path.join(d, "drift-pure.ts"), "w").write(s)
check = '''
import { buildSpendingDrift } from "./drift-pure.ts";
let n = 0;
const tx = (date, merchant, amount, category="Shopping") =>
  ({ id: `t${n++}`, date, merchant, category, amount, type: "expense" });
const rows = [];
for (const [m, amt] of [["05",200],["06",220],["07",210],["08",420]]) rows.push(tx(`2026-${m}-12`, "Amazon", amt));
for (const m of ["05","06","07","08"]) rows.push(tx(`2026-${m}-03`, "Trader Joes", 100, "Groceries"));
for (const [m, amt] of [["05",20],["06",22],["07",21],["08",45]]) rows.push(tx(`2026-${m}-20`, "Coffee Shop", amt, "Dining"));
rows.push(tx("2026-09-02","Crunchyroll",30,"Entertainment"));
rows.push(tx("2026-09-09","Crunchyroll",30,"Entertainment"));
rows.push(tx("2026-09-16","Crunchyroll",30,"Entertainment"));
rows.push(tx("2026-09-10","OneTime Store",500));
for (const [m, amt] of [["05",15],["06",15],["07",15],["08",30]]) rows.push(tx(`2026-${m}-01`, "Netflix", amt, "Entertainment"));
const out = buildSpendingDrift(rows, new Set(["netflix"]), "2026-09-26");
const kinds = out.map(s => `${s.kind}:${s.merchant}:${s.level}`).join(",");
console.log("SIGNALS=" + kinds);
console.log("COUNT=" + out.length);
const creep = out.find(s => s.kind === "creep");
console.log("CREEPBARS=" + (creep ? creep.months.length : 0));
'''
open(os.path.join(d, "check.ts"), "w").write(check)
r = subprocess.run(["node", "--experimental-strip-types", "check.ts"],
                   capture_output=True, text=True, cwd=d)
print(r.stdout.strip() or r.stderr.strip()[-500:])
EOF
)
echo "$RUNTIME" | grep -q "SIGNALS=creep:Amazon:high,new:Crunchyroll:watch" \
  && ok "creep + new merchant detected" \
  || bad "creep + new merchant detected ($RUNTIME)"
echo "$RUNTIME" | grep -q "COUNT=2" \
  && ok "steady/small/one-off/recurring excluded" \
  || bad "steady/small/one-off/recurring excluded ($RUNTIME)"
echo "$RUNTIME" | grep -q "CREEPBARS=4" \
  && ok "creep signal carries 4-month trend" \
  || bad "creep signal carries 4-month trend ($RUNTIME)"

# ---------- page wiring ----------
if grep -q "getSpendingDrift" "$PAGE"; then ok "cash-flow page loads drift"; else bad "cash-flow page loads drift"; fi
if grep -q "SPENDING DRIFT" "$PAGE"; then ok "drift section rendered"; else bad "drift section rendered"; fi
if grep -q "drift-bars" "$PAGE"; then ok "trend bars rendered"; else bad "trend bars rendered"; fi

# ---------- styles ----------
for cls in drift-list drift-row drift-icon drift-bars drift-bar-fill; do
  if grep -q "\.$cls" "$CSS"; then ok "css .$cls present"; else bad "css .$cls present"; fi
done
UNDEF=$(python3 - "$CSS" << 'EOF'
import re, sys
s = open(sys.argv[1]).read()
defined = set(re.findall(r'^\s*(--[\w-]+)\s*:', s, re.M))
drift = s[s.find(".drift-list"):]
used = set(re.findall(r'var\((--[\w-]+)\)', drift))
print(" ".join(sorted(u for u in used if u not in defined)))
EOF
)
if [ -z "$UNDEF" ]; then ok "drift css vars all defined"; else bad "drift css vars all defined ($UNDEF)"; fi
BAL=$(python3 - "$CSS" << 'EOF'
import re, sys
s = open(sys.argv[1]).read()
s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
print("BALANCED" if s.count("{") == s.count("}") else "BROKEN")
EOF
)
if [ "$BAL" = "BALANCED" ]; then ok "globals.css braces balanced"; else bad "globals.css braces balanced"; fi

echo "----"
echo "v224: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
