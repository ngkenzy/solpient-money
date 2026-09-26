import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  snapshotsLib: await readFile(
    "lib/net-worth-snapshots.ts",
    "utf8"
  ),
  homePage: await readFile("app/page.tsx", "utf8"),
  moneyData: await readFile("lib/money-data.ts", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

function atLeast310(version) {
  const [major = 0, minor = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return major > 3 || (major === 3 && minor >= 1);
}

const checks = [
  ["release includes V3.1.0 or newer", atLeast310(pkg.version)],
  [
    "snapshot lib exports the daily recorder",
    files.snapshotsLib.includes(
      "export async function recordDailyNetWorthSnapshot"
    ),
  ],
  [
    "snapshot upserts on the household/date unique key",
    files.snapshotsLib.includes(
      '{ onConflict: "household_id,snapshot_date" }'
    ),
  ],
  [
    "snapshot splits assets and liabilities by balance sign",
    files.snapshotsLib.includes("balance > 0") &&
      files.snapshotsLib.includes("balance < 0"),
  ],
  [
    "snapshot failure path explains the failing step",
    files.snapshotsLib.includes(
      "Could not read account balances"
    ) && files.snapshotsLib.includes("Could not record"),
  ],
  [
    "overview records a snapshot on database loads only",
    files.homePage.includes("recordDailyNetWorthSnapshot") &&
      files.homePage.includes("if (persistent)"),
  ],
  [
    "overview never lets a snapshot break the dashboard",
    files.homePage.includes(".catch(() => {})"),
  ],
  [
    "net-worth series labels snapshots at day precision",
    files.moneyData.includes("label: dayLabel(row.snapshot_date)"),
  ],
];

const failures = checks
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

if (failures.length) {
  console.error(
    "test:v208 FAILED:\n" +
      failures.map((name) => ` - ${name}`).join("\n")
  );
  process.exit(1);
}

console.log(
  `test:v208 passed (${checks.length} checks): daily net-worth snapshots are wired into the overview.`
);
