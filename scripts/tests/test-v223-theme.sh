#!/usr/bin/env bash
# v223 — Dark/light mode: the whole palette is CSS variables, a [data-theme]
# block restyles them, and the toggle + palette action switch themes.
set -euo pipefail

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $1"; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CSS="$ROOT/app/globals.css"

# ---------- theme blocks ----------
if grep -q '\[data-theme="dark"\]' "$CSS"; then ok "dark theme block exists"; else bad "dark theme block exists"; fi
if grep -q 'color-scheme: light' "$CSS" && grep -q 'color-scheme: dark' "$CSS"; then
  ok "color-scheme set for both themes"
else
  bad "color-scheme set for both themes"
fi

# ---------- no hardcoded colors outside the theme definitions ----------
STRIPPED=$(python3 - "$CSS" << 'EOF'
import re, sys
s = open(sys.argv[1]).read()
s = re.sub(r':root\s*\{.*?\n\}\s*\n\[data-theme="dark"\]\s*\{.*?\n\}', '', s, flags=re.S)
s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
s = re.sub(r'url\([^)]*\)', 'url()', s)
print(s)
EOF
)
if echo "$STRIPPED" | grep -Eq '#[0-9a-fA-F]{3,8}\b'; then
  bad "no hardcoded hex outside theme blocks"
  echo "$STRIPPED" | grep -Eo '#[0-9a-fA-F]{3,8}\b' | sort -u | head -5
else
  ok "no hardcoded hex outside theme blocks"
fi
# rgba() may only remain for the intentional pure-white overlays
if echo "$STRIPPED" | grep -Eo 'rgba?\([^)]*\)' | grep -Ev 'rgba?\(\s*255\s*,\s*255\s*,\s*255|rgba?\(\s*0\s*,\s*0\s*,\s*0' | grep -q .; then
  bad "only white/black rgba() remain outside theme blocks"
else
  ok "only white/black rgba() remain outside theme blocks"
fi

# ---------- every referenced var is defined ----------
UNDEF=$(python3 - "$CSS" << 'EOF'
import re, sys
s = open(sys.argv[1]).read()
defined = set(re.findall(r'^\s*(--[\w-]+)\s*:', s, re.M))
used = set(re.findall(r'var\((--[\w-]+)\)', s))
undef = sorted(u for u in used if u not in defined)
print(" ".join(undef))
EOF
)
if [ -z "$UNDEF" ]; then ok "every var() reference is defined"; else bad "every var() reference is defined ($UNDEF)"; fi

# ---------- dark values actually differ on key surfaces ----------
DIFFERS=$(python3 - "$CSS" << 'EOF'
import re, sys
s = open(sys.argv[1]).read()
light = dict(re.findall(r'(--(?:canvas|surface|ink|line))\s*:\s*#([0-9a-fA-F]{6})', s.split('[data-theme="dark"]')[0]))
m = re.search(r'\[data-theme="dark"\]\s*\{(.*?)\n\}', s, re.S)
dark = dict(re.findall(r'(--(?:canvas|surface|ink|line))\s*:\s*#([0-9a-fA-F]{6})', m.group(1)))
print(all(light[k].lower() != dark[k].lower() for k in light))
EOF
)
if [ "$DIFFERS" = "True" ]; then ok "dark theme restyles key surfaces"; else bad "dark theme restyles key surfaces"; fi

# ---------- toggle component ----------
T="$ROOT/components/ThemeToggle.tsx"
if [ -f "$T" ] && grep -q "solpient-theme" "$T" && grep -q "dataset.theme" "$T"; then
  ok "ThemeToggle persists and applies the theme"
else
  bad "ThemeToggle persists and applies the theme"
fi
if grep -q "toggleTheme" "$T" && grep -q "THEME_CHANGE_EVENT" "$T"; then
  ok "ThemeToggle exports a shared toggle"
else
  bad "ThemeToggle exports a shared toggle"
fi
if grep -q "Sun" "$T" && grep -q "Moon" "$T"; then ok "toggle shows sun/moon icons"; else bad "toggle shows sun/moon icons"; fi

# ---------- wiring ----------
if grep -q "ThemeToggle" "$ROOT/components/AppShell.tsx"; then ok "toggle mounted in the sidebar"; else bad "toggle mounted in the sidebar"; fi
if grep -q "solpient-theme" "$ROOT/app/layout.tsx" && grep -q "prefers-color-scheme" "$ROOT/app/layout.tsx"; then
  ok "layout pre-paints the saved/system theme"
else
  bad "layout pre-paints the saved/system theme"
fi
if grep -q "Toggle dark mode" "$ROOT/components/CommandPalette.tsx" && grep -q "toggleTheme" "$ROOT/components/CommandPalette.tsx"; then
  ok "command palette can toggle the theme"
else
  bad "command palette can toggle the theme"
fi

# ---------- chart uses theme-aware colors ----------
C="$ROOT/components/InteractiveLineChart.tsx"
if grep -Eq '#[0-9a-fA-F]{3,8}\b' "$C"; then
  bad "chart has no hardcoded hex"
else
  ok "chart has no hardcoded hex"
fi
if grep -q "var(--chart-1)" "$C"; then ok "chart uses theme chart colors"; else bad "chart uses theme chart colors"; fi
if grep -q -- "--chart-1:" "$CSS" && grep -q -- "--chart-2:" "$CSS"; then ok "chart color vars defined"; else bad "chart color vars defined"; fi

# ---------- toggle styles ----------
if grep -q '\.theme-toggle' "$CSS"; then ok "toggle styles present"; else bad "toggle styles present"; fi

# ---------- brace balance (permanent guard) ----------
BAL=$(python3 - "$CSS" << 'EOF'
import re, sys
s = open(sys.argv[1]).read()
s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
print("BALANCED" if s.count("{") == s.count("}") else "BROKEN")
EOF
)
if [ "$BAL" = "BALANCED" ]; then ok "globals.css braces balanced"; else bad "globals.css braces balanced"; fi

echo "----"
echo "v223: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
