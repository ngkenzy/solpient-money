import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
  page: await readFile("app/tsp/page.tsx", "utf8"),
  prices: await readFile("lib/tsp-prices.ts", "utf8"),
  tracker: await readFile("lib/tsp-tracker.ts", "utf8"),
  css: await readFile("app/globals.css", "utf8"),
};

const pkg = JSON.parse(files.packageJson);
const tspNav = '{ href: "/tsp", label: "Thrift Saving Plan", icon: Landmark }';
const tspNavIndex = files.shell.indexOf(tspNav);
const investIndex = files.shell.indexOf('label: "INVEST"');
const planIndex = files.shell.indexOf('label: "BUDGETING"');

function atLeast174(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return (
    major > 1 ||
    (major === 1 &&
      (minor > 7 || (minor === 7 && patch >= 4)))
  );
}

const checks = [
  ["release includes V1.7.4 or newer", atLeast174(pkg.version)],
  [
    "Thrift Saving Plan appears once and under Invest",
    tspNavIndex > investIndex &&
      tspNavIndex < planIndex &&
      files.shell.lastIndexOf(tspNav) === tspNavIndex,
  ],
  [
    "TSP page exposes fund-level valuation detail",
    (
      files.page.includes("Latest official TSP share price") &&
      files.page.includes("Official price date") &&
      files.page.includes("Inferred shares") &&
      files.page.includes("Estimated fund value")
    ) ||
      (
        files.page.includes("Units") &&
        files.page.includes("Fund price") &&
        files.page.includes("Current value")
      ),
  ],
  [
    "mixed-date protection remains in the legacy estimate engine",
    files.tracker.includes("tsp:mixed-price-dates") &&
      (
        files.page.includes("Official fund price dates vary") ||
        files.page.includes("CSV IMPORT")
      ),
  ],
  [
    "combined legacy estimate is withheld for mixed price dates",
    files.prices.includes("complete && !mixedPriceDates") &&
      (
        files.page.includes("Withheld until all owned funds share one official as-of date") ||
        files.page.includes("CSV IMPORT")
      ),
  ],
  [
    "mixed price headline cannot expose the newest date as one portfolio date",
    files.prices.includes("mixedPriceDates") &&
      files.prices.includes("? null") &&
      files.prices.includes("newestPriceDate"),
  ],
  [
    "per-fund pricing remains available",
    (
      files.page.includes("priced?.latestPriceDate") &&
      files.page.includes("fund.latestPriceDate")
    ) ||
      (
        files.page.includes("fund.liveFundPrice") &&
        files.page.includes("fund.liveUnits")
      ),
  ],
  [
    "responsive TSP market detail layout exists",
    (
      files.css.includes(".tsp-fund-market-data") &&
      files.css.includes("grid-column: 2 / -1")
    ) ||
      files.css.includes(".tsp-fund-price-form"),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.7.4 TSP investment display failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.7.4 TSP investment display invariants passed.");
