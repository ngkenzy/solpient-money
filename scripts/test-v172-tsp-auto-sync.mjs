import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  layout: await readFile("app/layout.tsx", "utf8"),
  runner: await readFile("components/AutopilotDailyRunner.tsx", "utf8"),
  autopilot: await readFile("lib/money-autopilot.ts", "utf8"),
  scheduler: await readFile("scripts/install-autopilot-scheduler.mjs", "utf8"),
  page: await readFile("app/tsp/page.tsx", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

const syncIndex = files.autopilot.indexOf("await syncTspSharePrices(now)");
const existingIndex = files.autopilot.indexOf("const existing = await todayRun");

function atLeast172(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return (
    major > 1 ||
    (major === 1 &&
      (minor > 7 || (minor === 7 && patch >= 2)))
  );
}

const checks = [
  ["release includes V1.7.2 or newer", atLeast172(pkg.version)],
  [
    "body suppresses extension-injected hydration attributes",
    files.layout.includes("<body suppressHydrationWarning>"),
  ],
  [
    "automatic client refresh runs on a four-hour cadence",
    files.runner.includes("REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000") &&
      files.runner.includes("window.setInterval"),
  ],
  [
    "TSP page refreshes after background sync",
    files.runner.includes('pathname === "/tsp"') &&
      files.runner.includes("router.refresh()"),
  ],
  [
    "TSP prices refresh before daily Autopilot early-return gate",
    syncIndex >= 0 &&
      existingIndex >= 0 &&
      syncIndex < existingIndex,
  ],
  [
    "TSP background failure does not break Money navigation",
    files.autopilot.includes("Automatic TSP share-price refresh failed"),
  ],
  [
    "local scheduler runs morning plus later daily refresh",
    files.scheduler.includes('arg("tsp-hour", "20")') &&
      files.scheduler.includes('arg("tsp-minute", "30")') &&
      files.scheduler.includes("<key>StartCalendarInterval</key>") &&
      files.scheduler.includes("tspHour") &&
      files.scheduler.includes("tspMinute"),
  ],
  [
    "visible Money release badge matches package version",
    files.shell.includes(`MONEY V${pkg.version}`),
  ],
  [
    "TSP page release label matches package version",
    files.page.includes(`V${pkg.version} · MILITARY TSP TRACKER`),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.7.2 TSP automatic sync invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.7.2 TSP automatic sync invariants passed.");
