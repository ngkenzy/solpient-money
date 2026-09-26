#!/usr/bin/env bash
# v225 — Automatic dividend calendar + value proxies.
# Declared dividend history (Yahoo chart events=div) drives a 12-month
# income calendar with zero manual entry; Nasdaq quote summaries drive
# 52-week-high / analyst-target value proxies. All market data is cached
# per household and refreshed on demand.
set -euo pipefail

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $1"; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIVLIB="$ROOT/lib/dividends.ts"
VALLIB="$ROOT/lib/value-proxies.ts"
ACTIONS="$ROOT/app/portfolio/actions.ts"
PORTFOLIO_PAGE="$ROOT/app/portfolio/page.tsx"
INTEL_PAGE="$ROOT/app/portfolio-intelligence/page.tsx"
CSS="$ROOT/app/globals.css"
PALETTE="$ROOT/components/CommandPalette.tsx"
MIGRATION="$ROOT/supabase/migrations/20260926120000_v31_dividend_value_cache.sql"

# ---------- module shape ----------
for f in "$DIVLIB" "$VALLIB" "$MIGRATION" "$ROOT/app/portfolio/RefreshIncomeValueButton.tsx"; do
  if [ -f "$f" ]; then ok "exists: $(basename "$f")"; else bad "exists: $(basename "$f")"; fi
done
for fn in "export function buildDividendIntelligence" "export async function getDividendIntelligence" "export async function fetchDividendHistories" "export function projectDividendPayments" "export function detectDividendFrequency" "export function parseDividendEvents"; do
  if grep -q "$fn" "$DIVLIB"; then ok "dividends exports ${fn##* }"; else bad "dividends exports ${fn##* }"; fi
done
for fn in "export function buildValueCheck" "export async function getValueCheck" "export async function fetchValueSnapshots" "export function parseNasdaqSummary"; do
  if grep -q "$fn" "$VALLIB"; then ok "value-proxies exports ${fn##* }"; else bad "value-proxies exports ${fn##* }"; fi
done
# libs stay read-only: the refresh action owns all writes
if grep -Eq "insert|update|delete|upsert" "$DIVLIB"; then bad "dividends lib read-only"; else ok "dividends lib read-only"; fi
if grep -Eq "insert|update|delete|upsert" "$VALLIB"; then bad "value-proxies lib read-only"; else ok "value-proxies lib read-only"; fi
if grep -q "requireActiveHousehold" "$DIVLIB"; then ok "dividend cache household-scoped"; else bad "dividend cache household-scoped"; fi
if grep -q "requireActiveHousehold" "$VALLIB"; then ok "value cache household-scoped"; else bad "value cache household-scoped"; fi

# ---------- refresh action ----------
if grep -q "export async function refreshIncomeAndValue" "$ACTIONS"; then ok "refreshIncomeAndValue action exists"; else bad "refreshIncomeAndValue action exists"; fi
# redirect-safety: no internal next/dist redirect helpers (broke on Next 16 at runtime);
# the household call runs before the try block so a redirect can never be swallowed
if grep -q "isRedirectError\|redirect-status-code\|redirect-boundary" "$ACTIONS"; then bad "no internal redirect helpers imported"; else ok "no internal redirect helpers imported"; fi
REDIRECTSAFE=$(python3 - "$ACTIONS" << 'EOF'
import re, sys
s = open(sys.argv[1]).read()
bad_fns = []
for m in re.finditer(r"export async function (refresh\w+)\(\)[^{]*\{", s):
    name, start = m.group(1), m.end()
    # find the function's requireActiveHousehold and first try {
    fn_tail = s[start:start + 2000]
    hh = fn_tail.find("requireActiveHousehold()")
    tr = fn_tail.find("try {")
    if hh == -1 or tr == -1 or hh > tr:
        bad_fns.append(name)
print("REDIRECTSAFE=" + (",".join(bad_fns) if bad_fns else "ok"))
EOF
)
if [ "$REDIRECTSAFE" = "REDIRECTSAFE=ok" ]; then ok "actions hoist household before try"; else bad "actions hoist household before try ($REDIRECTSAFE)"; fi
if grep -q '"/portfolio-intelligence"' "$ACTIONS"; then ok "action revalidates intelligence page"; else bad "action revalidates intelligence page"; fi
if grep -q "dividend_cache" "$ACTIONS" && grep -q "value_snapshot_cache" "$ACTIONS"; then ok "action writes both caches"; else bad "action writes both caches"; fi

# ---------- UI wiring ----------
if grep -q 'id="dividends"' "$PORTFOLIO_PAGE"; then ok "portfolio dividends section"; else bad "portfolio dividends section"; fi
if grep -q "RefreshIncomeValueButton" "$PORTFOLIO_PAGE"; then ok "portfolio refresh button wired"; else bad "portfolio refresh button wired"; fi
if grep -q "getDividendIntelligence" "$PORTFOLIO_PAGE"; then ok "portfolio loads dividend intel"; else bad "portfolio loads dividend intel"; fi
if grep -q "VALUE CHECK" "$INTEL_PAGE"; then ok "intelligence value-check section"; else bad "intelligence value-check section"; fi
if grep -q "getValueCheck" "$INTEL_PAGE"; then ok "intelligence loads value check"; else bad "intelligence loads value check"; fi
if grep -q "Refresh dividends & value" "$PALETTE"; then ok "command palette action"; else bad "command palette action"; fi

# ---------- CSS ----------
for cls in "div-calendar" "div-bar-declared" "div-bar-projected" "div-badge" "div-table" "value-table" "value-signal-high-yield" "value-signal-deep-discount" "div-coverage"; do
  if grep -q "\.$cls" "$CSS"; then ok "css .$cls"; else bad "css .$cls"; fi
done
# every var() referenced by the v3.1 block must be defined in a theme
MISSING_VARS=$(python3 - "$CSS" << 'EOF'
import re, sys
css = open(sys.argv[1]).read()
block = css.split("/* ============ Dividends + value check (v3.1) ============ */")[1]
refs = set(re.findall(r"var\((--[a-z0-9-]+)\)", block))
defs = set(re.findall(r"^\s*(--[a-z0-9-]+)\s*:", css, flags=re.M))
missing = sorted(r for r in refs if r not in defs)
print(",".join(missing))
EOF
)
if [ -z "$MISSING_VARS" ]; then ok "all v3.1 css vars defined"; else bad "undefined css vars: $MISSING_VARS"; fi
# permanent brace-balance guard
BALANCED=$(python3 - "$CSS" << 'EOF'
import re, sys
css = re.sub(r"/\*.*?\*/", "", open(sys.argv[1]).read(), flags=re.S)
o, c = css.count("{"), css.count("}")
print(f"{o}/{c}")
print("BALANCED" if o == c else "BROKEN")
EOF
)
if echo "$BALANCED" | grep -q "BALANCED"; then ok "css braces balanced ($(echo "$BALANCED" | head -1))"; else bad "css braces unbalanced"; fi

# ---------- runtime behavior (pure builders, server fns cut) ----------
RUNTIME=$(python3 - "$DIVLIB" "$VALLIB" "$ROOT/lib/market-prices.ts" << 'EOF'
import re, sys, subprocess, tempfile, os
divlib, vallib, pricelib = sys.argv[1], sys.argv[2], sys.argv[3]
d = tempfile.mkdtemp()
def pure(path, cut):
    s = open(path).read()
    s = re.sub(r'import\s*\{[^}]*\}\s*from\s*"\./money-auth";\n', '', s)
    s = s.replace('from "./market-prices"', 'from "./market-prices.ts"')
    s = s[:s.find(cut)].rstrip() + "\n"
    return s
open(os.path.join(d, "dividends-pure.ts"), "w").write(pure(divlib, "export async function getDividendIntelligence"))
open(os.path.join(d, "value-pure.ts"), "w").write(pure(vallib, "export async function getValueCheck"))
open(os.path.join(d, "market-prices.ts"), "w").write(open(pricelib).read())
check = '''
import { parseDividendEvents, detectDividendFrequency, projectDividendPayments, buildDividendIntelligence } from "./dividends-pure.ts";
import { parseNasdaqSummary, buildValueCheck } from "./value-pure.ts";
const lines = [];
const nowS = Math.floor(new Date("2026-09-26T12:00:00Z").getTime() / 1000);
// synthetic Yahoo payload: 8 quarterly PFE payments, last two declared in the future
const q = (y, m, day, amt, py, pm, pday) => [Date.UTC(y, m - 1, day) / 1000, { amount: amt, date: Date.UTC(py, pm - 1, pday) / 1000 }];
const divs = {};
for (const [ex, v] of [q(2025,2,7,0.42,2025,3,7),q(2025,5,9,0.43,2025,6,6),q(2025,8,8,0.43,2025,9,5),q(2025,11,7,0.43,2025,12,5),q(2026,2,6,0.43,2026,3,6),q(2026,5,8,0.43,2026,6,5),q(2026,8,7,0.43,2026,9,4),q(2026,11,6,0.44,2026,12,4)]) divs[String(ex)] = v;
const payload = { chart: { result: [{ events: { dividends: divs } }] } };
const events = parseDividendEvents(payload);
lines.push("EVENTS=" + events.length);
lines.push("FREQ=" + detectDividendFrequency(events, nowS));
lines.push("FREQ_SINGLE=" + detectDividendFrequency(events.slice(0, 1), nowS));
const proj = projectDividendPayments(events, detectDividendFrequency(events, nowS), nowS);
lines.push("PROJ=" + proj.length);
lines.push("PROJ_DECLARED=" + proj.filter(p => p.declared).length);
const holdings = [{ ticker: "PFE", name: "Pfizer", kind: "stock", shares: 100, price: 28.67, value: 2867 }];
const intel = buildDividendIntelligence(holdings, [{ ticker: "PFE", events, frequency: "quarterly" }], new Date("2026-09-26T12:00:00Z"));
lines.push("PAYERS=" + intel.payerCount);
lines.push("ANNUAL=" + intel.annualIncome.toFixed(2));
lines.push("YIELD=" + (intel.payers[0]?.yieldPct ?? -1).toFixed(2));
// only 3 of the 4 projected payments land inside the Sep-2026→Aug-2027 bucket
// window: (0.44 + 0.43 + 0.43) x 100 = 130.00
lines.push("MONTHSUM=" + intel.months.reduce((s, m) => s + m.declared + m.projected, 0).toFixed(2));
// value proxies
const nasdaq = { data: { summaryData: {
  FiftTwoWeekHighLow: { value: "$150.00/$95.00" },
  OneYrTarget: { value: "$130.00" },
  Sector: { value: "Healthcare" },
  Industry: { value: "Drug Manufacturers" },
}}};
const snap = parseNasdaqSummary("PFE", nasdaq);
lines.push("HIGH=" + snap.fiftyTwoWeekHigh + " LOW=" + snap.fiftyTwoWeekLow + " TGT=" + snap.analystTarget + " SEC=" + snap.sector);
const yields = new Map([["PFE", 6.0], ["AAA", null]]);
const vhold = [
  { ticker: "PFE", name: "Pfizer", kind: "stock", shares: 100, price: 100, value: 10000 },
  { ticker: "AAA", name: "NoData", kind: "stock", shares: 1, price: 50, value: 50 },
];
const check2 = buildValueCheck(vhold, yields, [snap]);
lines.push("VROWS=" + check2.rows.length);
const pfe = check2.rows.find(r => r.ticker === "PFE");
lines.push("BELOWHIGH=" + pfe.belowHighPct.toFixed(1));
lines.push("TGAP=" + pfe.targetGapPct.toFixed(1));
lines.push("SIGNALS=" + pfe.signals.join("+"));
lines.push("HIYIELD=" + check2.highYieldCount + " DISC=" + check2.discountCount);
console.log(lines.join("\\n"));
'''
open(os.path.join(d, "check.ts"), "w").write(check)
r = subprocess.run(["node", "--experimental-strip-types", "check.ts"],
                   capture_output=True, text=True, cwd=d)
print(r.stdout.strip() or ("STDERR:" + r.stderr.strip()[-800:]))
EOF
)
echo "$RUNTIME"
check_val() {
  if echo "$RUNTIME" | grep -q "^$1=$2$"; then ok "runtime $3"; else bad "runtime $3 (want $1=$2)"; fi
}
check_val "EVENTS" "8" "parse 8 dividend events"
check_val "FREQ" "quarterly" "detect quarterly frequency"
check_val "FREQ_SINGLE" "unknown" "single event → unknown"
check_val "PROJ_DECLARED" "1" "declared future payment kept"
check_val "PAYERS" "1" "one payer detected"
# 100 shares × (3×0.43 projected + 1×0.44 declared) = 173.00
check_val "ANNUAL" "173.00" "annual income math"
check_val "YIELD" "6.03" "yield math"
check_val "MONTHSUM" "130.00" "12-month buckets sum (in-window payments)"
check_val "HIGH" "150 LOW=95 TGT=130 SEC=Healthcare" "nasdaq summary parse"
check_val "VROWS" "1" "value rows skip missing snapshot"
check_val "BELOWHIGH" "33.3" "distance from 52-week high"
check_val "TGAP" "30.0" "analyst target gap"
check_val "SIGNALS" "high-yield+deep-discount+analyst-upside" "value signals"
check_val "HIYIELD" "1 DISC=1" "value summary counts"

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
