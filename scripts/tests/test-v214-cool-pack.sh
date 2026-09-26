#!/usr/bin/env bash
# v214 — Cool pack: command palette, count-up figures, chart glow-up,
# real net-worth trend badge, micro-interaction CSS.
set -euo pipefail

PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); echo "ok   $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "FAIL $1"; }

expect_grep() { # file, pattern, label
  if grep -q "$2" "$1"; then ok "$3"; else bad "$3 (missing: $2)"; fi
}

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PALETTE="$ROOT/components/CommandPalette.tsx"
COUNTUP="$ROOT/components/CountUp.tsx"
CHART="$ROOT/components/InteractiveLineChart.tsx"
OVERVIEW="$ROOT/app/page.tsx"
SHELL="$ROOT/components/AppShell.tsx"
CSS="$ROOT/app/globals.css"

# ---------- Command palette ----------
[ -f "$PALETTE" ] && ok "CommandPalette.tsx exists" || bad "CommandPalette.tsx exists"
expect_grep "$PALETTE" 'event.key.toLowerCase() === "k"' "palette listens for Cmd/Ctrl+K"
expect_grep "$PALETTE" 'role="dialog"' "palette dialog has dialog role"
expect_grep "$PALETTE" 'aria-modal="true"' "palette dialog is modal"
expect_grep "$PALETTE" 'role="listbox"' "palette list has listbox role"
expect_grep "$PALETTE" 'router.push(item.href)' "palette navigates on select"
expect_grep "$PALETTE" 'ArrowDown' "palette supports arrow navigation"
expect_grep "$PALETTE" 'Escape' "palette closes on Escape"
for href in '"/"' '"/accounts"' '"/connect"' '"/transactions"' '"/cash-flow"' '"/portfolio"' '"/portfolio-intelligence"' '"/tsp"' '"/budget"' '"/plan"' '"/monitor"' '"/goals"' '"/data-health"' '"/data"'; do
  expect_grep "$PALETTE" "href: $href" "palette links to $href"
done
expect_grep "$SHELL" 'import CommandPalette from "./CommandPalette"' "AppShell imports CommandPalette"
expect_grep "$SHELL" '<CommandPalette />' "AppShell mounts CommandPalette"

# ---------- CountUp ----------
[ -f "$COUNTUP" ] && ok "CountUp.tsx exists" || bad "CountUp.tsx exists"
expect_grep "$COUNTUP" 'requestAnimationFrame' "CountUp animates with rAF"
expect_grep "$COUNTUP" 'prefers-reduced-motion' "CountUp respects reduced motion"
expect_grep "$COUNTUP" 'style: "currency"' "CountUp formats as currency"
expect_grep "$OVERVIEW" 'import CountUp from "@/components/CountUp"' "overview imports CountUp"
expect_grep "$OVERVIEW" '<CountUp value={summary.netWorth}' "overview hero uses CountUp"
expect_grep "$OVERVIEW" '<CountUp value={summary.assets}' "overview assets use CountUp"
expect_grep "$OVERVIEW" '<CountUp value={summary.liabilities}' "overview liabilities use CountUp"
expect_grep "$OVERVIEW" '<CountUp value={portfolio.total}' "overview investments use CountUp"

# ---------- Real net-worth trend ----------
expect_grep "$OVERVIEW" 'netWorthTrend' "overview computes netWorthTrend"
expect_grep "$OVERVIEW" 'data.netWorthSeries.length < 2' "trend needs at least 2 snapshots"
expect_grep "$OVERVIEW" 'negative-row' "overview renders negative trend row"
expect_grep "$OVERVIEW" 'TrendingDown' "overview imports TrendingDown"
expect_grep "$CSS" '\.negative-row' "CSS defines .negative-row"

# ---------- Chart glow-up ----------
expect_grep "$CHART" 'linearGradient' "chart defines area gradient"
expect_grep "$CHART" 'buildSmoothPath' "chart uses smooth path builder"
expect_grep "$CHART" 'buildAreaPath' "chart uses area path builder"
expect_grep "$CHART" 'useId()' "chart generates unique gradient id"
expect_grep "$CHART" 'fill={`url(#${gradientId})`}' "area fill references gradient"
if grep -q '<polyline' "$CHART"; then bad "chart no longer uses polyline"; else ok "chart no longer uses polyline"; fi

# ---------- Micro-interaction CSS ----------
expect_grep "$CSS" '\.cmdk-trigger' "CSS styles palette trigger"
expect_grep "$CSS" '\.cmdk-backdrop' "CSS styles palette backdrop"
expect_grep "$CSS" '\.cmdk-panel' "CSS styles palette panel"
expect_grep "$CSS" '@keyframes page-in' "CSS defines page-in keyframes"
expect_grep "$CSS" '\.card:hover' "CSS lifts cards on hover"
expect_grep "$CSS" 'prefers-reduced-motion: reduce' "CSS disables motion for reduced-motion users"
expect_grep "$CSS" 'font-variant-numeric: tabular-nums' "CSS uses tabular numerals for money figures"

# ---------- Runtime: smooth-path math (extracted from the real file) ----------
node -e '
const fs = require("fs");
const src = fs.readFileSync("'"$CHART"'", "utf8");
function extract(name) {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => l.startsWith("export function " + name));
  if (start < 0) throw new Error("missing " + name);
  const end = lines.findIndex((l, i) => i > start && l === "}");
  let code = lines.slice(start, end + 1).join("\n")
    .replace("export function", "function")
    .replace(/: Array<\[[^\]]*\]>/g, "")
    .replace(/: number/g, "")
    .replace(/: string/g, "");
  return code;
}
const smooth = extract("buildSmoothPath");
const area = extract("buildAreaPath");
eval(smooth + "\n" + area);
const assert = (cond, label) => { if (!cond) { console.error("FAIL " + label); process.exit(1); } console.log("ok   " + label); };

const p4 = buildSmoothPath([[0,10],[10,20],[20,15],[30,25]]);
assert(p4.startsWith("M 0,10"), "smooth path starts at first point");
assert((p4.match(/ C /g) || []).length === 3, "smooth path has one bezier per segment");
assert(p4.includes("30.00,25.00"), "smooth path ends at last point");

assert(buildSmoothPath([]) === "", "smooth path empty for no points");
assert(buildSmoothPath([[5,7]]) === "M 5,7", "smooth path handles single point");

const a = buildAreaPath([[0,10],[10,20],[30,25]], 100);
assert(a.endsWith(" Z"), "area path is closed");
assert(a.includes(" L 30.00,100.00 L 0.00,100.00"), "area path drops to baseline");
assert(buildAreaPath([], 100) === "", "area path empty for no points");
'

# ---------- Runtime: palette fuzzy matcher (extracted from the real file) ----------
node -e '
const fs = require("fs");
const src = fs.readFileSync("'"$PALETTE"'", "utf8");
const lines = src.split("\n");
const start = lines.findIndex((l) => l.startsWith("function matches("));
const end = lines.findIndex((l, i) => i > start && l === "}");
let code = lines.slice(start, end + 1).join("\n").replace(/: PaletteItem|: string|: boolean/g, "");
eval(code);
const item = (label, keywords) => ({ label, hint: "", keywords, section: "Pages" });
const assert = (cond, label) => { if (!cond) { console.error("FAIL " + label); process.exit(1); } console.log("ok   " + label); };
assert(matches(item("Thrift Saving Plan", "tsp thrift"), "tsp"), "matcher finds tsp by keyword");
assert(matches(item("Budget", "monthly budget"), "bdg"), "matcher supports subsequence");
assert(matches(item("Portfolio", "holdings"), ""), "empty query matches everything");
assert(!matches(item("Budget", "monthly"), "xyz"), "matcher rejects non-matches");
'

# ---------- Runtime: money-format contract ----------
node -e '
const fmt = (v, d) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: d ? 2 : 0 }).format(v);
const assert = (cond, label) => { if (!cond) { console.error("FAIL " + label); process.exit(1); } console.log("ok   " + label); };
assert(fmt(1234.5, false) === "$1,235", "count-up rounds like money()");
assert(fmt(-987.65, false) === "-$988", "count-up formats negatives like money()");
assert(fmt(42.5, true) === "$42.50", "count-up decimals match money(value, true)");
'

echo "----"
echo "v214: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
