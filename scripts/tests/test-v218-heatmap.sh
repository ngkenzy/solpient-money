#!/usr/bin/env bash
# v218: holdings heatmap on Portfolio replaces the gains section.
# Runtime: squarifiedTreemap tiles the container (areas, no overlaps,
# containment, proportionality) and heatColor maps day-change to color.
# Static: wiring of the heatmap section, component, CSS, and docs.
set -u
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); }
fail() { FAIL=$((FAIL+1)); echo "FAIL $1"; }
expect_grep() { # file pattern desc
  if grep -qE "$2" "$1"; then ok; else fail "$3 (missing: $2)"; fi
}
expect_absent() { # file pattern desc
  if grep -qE "$2" "$1"; then fail "$3 (should be absent: $2)"; else ok; fi
}

PAGE=app/portfolio/page.tsx
COMP=components/HoldingsHeatmap.tsx
LIB=lib/treemap.ts
CSS=app/globals.css

# ---------- runtime: treemap math ----------
node --experimental-strip-types -e "
const { squarifiedTreemap, heatColor } = require('./lib/treemap.ts');
const assert = (cond, name) => {
  if (!cond) { console.error('FAIL runtime: ' + name); process.exitCode = 1; }
  else { console.log('ok runtime: ' + name); }
};
const W = 100, H = 62.5, AREA = W * H;

// 1. areas tile the container
let items = [
  { value: 40 }, { value: 25 }, { value: 15 }, { value: 10 },
  { value: 6 }, { value: 3 }, { value: 1 },
];
let rects = squarifiedTreemap(items, 0, 0, W, H);
let totalArea = rects.reduce((s, r) => s + r.w * r.h, 0);
assert(Math.abs(totalArea - AREA) / AREA < 1e-9, 'areas sum to container');

// 2. no overlaps (edges may touch)
let overlap = false;
for (let i = 0; i < rects.length; i++)
  for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (xOverlap > 1e-9 && yOverlap > 1e-9) overlap = true;
  }
assert(!overlap, 'no overlapping rects');

// 3. containment
assert(rects.every((r) => r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= W + 1e-9 && r.y + r.h <= H + 1e-9), 'rects contained');

// 4. proportionality: rect area fraction ~= value fraction
const total = items.reduce((s, i) => s + i.value, 0);
assert(rects.every((r, i) => Math.abs(r.w * r.h / AREA - items[i].value / total) < 0.01), 'area proportional to value');

// 5. single item fills the container
rects = squarifiedTreemap([{ value: 5 }], 0, 0, W, H);
assert(rects.length === 1 && Math.abs(rects[0].w - W) < 1e-9 && Math.abs(rects[0].h - H) < 1e-9, 'single item fills container');

// 6. degenerate input -> zero-size rects, no crash
rects = squarifiedTreemap([{ value: 0 }, { value: 0 }], 0, 0, W, H);
assert(rects.every((r) => r.w === 0 && r.h === 0), 'zero values give zero rects');
rects = squarifiedTreemap([], 0, 0, W, H);
assert(Array.isArray(rects) && rects.length === 0, 'empty input gives empty output');

// 7. heatColor mapping
assert(heatColor(2).includes('66, 173, 122'), 'positive day change is green');
assert(heatColor(-2).includes('217, 88, 92'), 'negative day change is red');
assert(heatColor(0).includes('153, 165, 179'), 'flat day change is slate');
assert(heatColor(NaN).includes('153, 165, 179'), 'NaN day change is slate');
assert(heatColor(undefined).includes('153, 165, 179'), 'missing day change is slate');

// 8. heatColor intensity grows with magnitude
const alpha = (c) => parseFloat(c.match(/([\d.]+)\)$/)[1]);
assert(alpha(heatColor(3)) > alpha(heatColor(0.5)), 'stronger move = stronger color');
assert(alpha(heatColor(10)) === alpha(heatColor(3)), 'intensity saturates');
" > /tmp/v218-runtime.log 2>&1
while IFS= read -r line; do
  case "$line" in
    "ok runtime:"*) ok ;;
    "FAIL runtime:"*) fail "${line#FAIL runtime: }" ;;
  esac
done < /tmp/v218-runtime.log
if ! grep -q "FAIL runtime" /tmp/v218-runtime.log; then ok; else fail "runtime suite had failures"; fi

# ---------- static: wiring ----------
expect_grep "$PAGE" 'id="heatmap"' "portfolio has a heatmap section"
expect_grep "$PAGE" 'HoldingsHeatmap' "portfolio renders HoldingsHeatmap"
expect_grep "$PAGE" 'Where your money sits' "heatmap heading present"
expect_absent "$PAGE" 'computeGains|lib/gains|gains-hero|id="performance"' "gains/performance fully removed from portfolio"
expect_grep "$PAGE" 'id="allocation"' "allocation section still present"

# allocation stays above the heatmap
ALLO=$(grep -n 'id="allocation"' "$PAGE" | head -1 | cut -d: -f1)
HEAT=$(grep -n 'id="heatmap"' "$PAGE" | head -1 | cut -d: -f1)
if [ "$ALLO" -lt "$HEAT" ]; then ok; else fail "allocation should render above the heatmap"; fi

expect_grep "$COMP" 'squarifiedTreemap' "heatmap component uses the treemap layout"
expect_grep "$COMP" 'heatColor' "heatmap component colors by day change"
expect_grep "$COMP" '/portfolio/.*holding\.ticker\.toLowerCase' "heatmap tiles link to ticker pages"
expect_grep "$COMP" 'role="img" aria-label="Holdings heatmap"' "heatmap has an accessible label"

expect_grep "$CSS" '\.heatmap-tile' "heatmap tile styles present"
expect_grep "$CSS" '\.heatmap-legend' "heatmap legend styles present"
expect_grep "$CSS" 'aspect-ratio: 100 / 62.5' "heatmap keeps a fixed aspect ratio"
expect_grep "$CSS" '\.heatmap-tile \{ transition: none; \}' "heatmap honors reduced motion"
expect_absent "$CSS" '\.gains-row' "gains styles removed from CSS"

if [ -f "$LIB" ]; then ok; else fail "lib/treemap.ts exists"; fi
if [ ! -f lib/gains.ts ]; then ok; else fail "lib/gains.ts deleted"; fi
if [ ! -f scripts/tests/test-v217-gains.sh ]; then ok; else fail "v217 gains test deleted"; fi

expect_grep package.json '"test:v218"' "package.json wires test:v218"
expect_absent package.json '"test:v217"' "package.json no longer wires test:v217"
expect_grep .github/workflows/build.yml 'test:v218' "CI runs test:v218"
expect_absent .github/workflows/build.yml 'test:v217' "CI no longer runs test:v217"

# CSS must be brace-balanced: one stray brace breaks the entire stylesheet.
if python3 -c "
import re, sys
text = re.sub(r'/\*.*?\*/', '', open('app/globals.css').read(), flags=re.S)
o, c = text.count('{'), text.count('}')
sys.exit(0 if o == c and o > 0 else 1)
"; then ok; else fail "globals.css has unbalanced braces"; fi

echo "v218: $PASS passed, $FAIL failed"
exit $([ "$FAIL" -eq 0 ])
