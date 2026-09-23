import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  migration: await readFile(
    "supabase/migrations/20260923181500_v171_tsp_daily_prices.sql",
    "utf8"
  ),
  prices: await readFile("lib/tsp-prices.ts", "utf8"),
  tracker: await readFile("lib/tsp-tracker.ts", "utf8"),
  actions: await readFile("app/tsp/actions.ts", "utf8"),
  page: await readFile("app/tsp/page.tsx", "utf8"),
  autopilot: await readFile("lib/money-autopilot.ts", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
  client: await readFile("lib/local-db/client.ts", "utf8"),
  doctor: await readFile("scripts/local-doctor.mjs", "utf8"),
  workflow: await readFile(".github/workflows/build.yml", "utf8"),
  lockWorkflow: await readFile(".github/workflows/lockfile.yml", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

function atLeast171(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return (
    major > 1 ||
    (major === 1 &&
      (minor > 7 || (minor === 7 && patch >= 1)))
  );
}

const checks = [
  ["release includes V1.7.1 or newer", atLeast171(pkg.version)],
  [
    "daily TSP price cache schema exists",
    files.migration.includes("public.tsp_fund_prices") &&
      files.migration.includes("unique (price_date, fund_code)"),
  ],
  [
    "fund positions persist inferred shares and snapshot price anchor",
    files.migration.includes("shares numeric") &&
      files.migration.includes("snapshot_share_price") &&
      files.migration.includes("snapshot_price_date"),
  ],
  [
    "local DB client registers TSP price cache",
    files.client.includes('"tsp_fund_prices"'),
  ],
  [
    "official TSP CSV is the primary price source",
    files.prices.includes(
      '"https://www.tsp.gov/data/fund-price-history.csv"'
    ) &&
      files.prices.includes('"official_tsp_csv"'),
  ],
  [
    "official fetch sends browser-compatible request headers",
    files.prices.includes('"user-agent"') &&
      files.prices.includes('"x-requested-with"') &&
      files.prices.includes("share-price-history"),
  ],
  [
    "CSV parser recognizes individual and Lifecycle funds",
    files.prices.includes("/^([GFCSI])") &&
      files.prices.includes('"LINCOME"') &&
      files.prices.includes("lifecycle"),
  ],
  [
    "shares are inferred from official snapshot balance and anchor price",
    files.prices.includes(
      "balance /\n            anchor.sharePrice"
    ) ||
      (files.prices.includes("balance /") &&
        files.prices.includes("anchor.sharePrice")),
  ],
  [
    "estimated current value uses shares times latest share price",
    files.prices.includes("shares *") &&
      files.prices.includes("latest.sharePrice"),
  ],
  [
    "official participant snapshot is never overwritten by price sync",
    !files.prices.includes('.from("tsp_snapshots")\n          .update') &&
      !files.prices.includes('.from("tsp_snapshots").update'),
  ],
  [
    "tracker exposes estimate and price freshness",
    files.tracker.includes("estimatedCurrentValue") &&
      files.tracker.includes("latestPriceDate") &&
      files.tracker.includes("priceAgeDays"),
  ],
  [
    "tracker warns when daily prices are absent or stale",
    files.tracker.includes("tsp:prices-not-synced") &&
      files.tracker.includes("tsp:prices-stale"),
  ],
  [
    "TSP page clearly separates official snapshot and estimated value",
    files.page.includes("Official TSP snapshot") &&
      files.page.includes("Estimated current value") &&
      files.page.includes("DAILY SHARE-PRICE ESTIMATE"),
  ],
  [
    "manual Sync prices now action exists",
    files.actions.includes("syncTspPricesNow") &&
      files.actions.includes("syncTspSharePrices"),
  ],
  [
    "Autopilot refreshes TSP prices locally",
    files.autopilot.includes("syncTspSharePrices(now)") &&
      files.autopilot.includes('tspPriceSyncVersion: "1.7.1"'),
  ],
  [
    "TSP pricing does not write accounts or holdings",
    !files.prices.includes('.from("accounts")') &&
      !files.prices.includes('.from("holdings")'),
  ],
  [
    "TSP pricing contains no financial execution calls",
    !/submitTrade|placeTrade|executeTrade|sendPayment|payBill|transferFunds|moveMoney/.test(
      files.prices + files.actions
    ),
  ],
  [
    "Local Doctor verifies V1.7.1 price cache",
    files.doctor.includes("V1.7.1 TSP daily price cache present"),
  ],
  [
    "release badge matches current package version",
    files.shell.includes(`MONEY V${pkg.version}`),
  ],
  [
    "GitHub Build remains manual-only",
    files.workflow.includes("workflow_dispatch:") &&
      !files.workflow.includes("push:") &&
      !files.workflow.includes("pull_request:"),
  ],
  [
    "GitHub Lockfile remains manual-only",
    files.lockWorkflow.includes("workflow_dispatch:") &&
      !files.lockWorkflow.includes("push:"),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.7.1 TSP daily price invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.7.1 TSP Daily Price Sync invariants passed.");
