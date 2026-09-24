import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  localDate: await readFile("lib/local-calendar-date.ts", "utf8"),
  autopilot: await readFile("lib/money-autopilot.ts", "utf8"),
  prices: await readFile("lib/tsp-prices.ts", "utf8"),
  runner: await readFile("components/AutopilotDailyRunner.tsx", "utf8"),
  page: await readFile("app/tsp/page.tsx", "utf8"),
  scheduled: await readFile("scripts/run-scheduled-autopilot.mjs", "utf8"),
  page: await readFile("app/tsp/page.tsx", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

function atLeast173(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return (
    major > 1 ||
    (major === 1 &&
      (minor > 7 || (minor === 7 && patch >= 3)))
  );
}

const checks = [
  ["release includes V1.7.3 or newer", atLeast173(pkg.version)],
  [
    "local calendar helper does not derive day from UTC ISO",
    files.localDate.includes("getFullYear()") &&
      files.localDate.includes("getMonth()") &&
      files.localDate.includes("getDate()") &&
      !files.localDate.includes("toISOString"),
  ],
  [
    "Autopilot run date uses local calendar day",
    files.autopilot.includes('import { localCalendarDateKey } from "@/lib/local-calendar-date"') &&
      files.autopilot.includes("return localCalendarDateKey(date)"),
  ],
  [
    "TSP fetch window uses local calendar day",
    files.prices.includes('import { localCalendarDateKey } from "@/lib/local-calendar-date"') &&
      files.prices.includes("const today = localCalendarDateKey(now)"),
  ],
  [
    "TSP date handling remains explicit",
    (
      files.page.includes('import { localCalendarDateKey } from "@/lib/local-calendar-date"') &&
      files.page.includes("localCalendarDateKey(new Date())")
    ) ||
      (
        files.page.includes("statement.periodEnd") &&
        files.page.includes("statement.periodStart")
      ),
  ],
  [
    "failed official fetch keeps newest cached price date",
    files.prices.includes('.from("tsp_fund_prices")') &&
      files.prices.includes('.select("price_date")') &&
      files.prices.includes("cachedLatest") &&
      files.prices.includes("cachedLatest?.price_date"),
  ],
  [
    "automatic TSP sync result is retained",
    files.autopilot.includes("tspPriceSync: TspPriceSyncResult | null") &&
      files.autopilot.includes("tspPriceSync = await syncTspSharePrices(now)"),
  ],
  [
    "automatic TSP fetch failure becomes explicit status",
    files.autopilot.includes("ok: false") &&
      files.autopilot.includes("Automatic TSP share-price refresh failed."),
  ],
  [
    "browser does not mark failed TSP sync as successful",
    files.runner.includes("const tspSyncFailed") &&
      files.runner.includes("if (!tspSyncFailed)") &&
      files.runner.includes("window.localStorage.setItem"),
  ],
  [
    "launchd runner retries failed TSP sync",
    files.scheduled.includes("tspPriceSync?.ok === false") &&
      files.scheduled.includes("throw new Error"),
  ],
  [
    "release-label removal does not remove the TSP workspace",
    !files.shell.includes("global-sandbox-badge") &&
      (
        files.page.includes('eyebrow="MILITARY TSP"') ||
        files.page.includes(`V${pkg.version} · MILITARY TSP TRACKER`)
      ),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.7.3 TSP reliability invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.7.3 TSP reliability invariants passed.");
