import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  migration: await readFile(
    "supabase/migrations/20260923173000_v17_military_tsp_tracker.sql",
    "utf8"
  ),
  engine: await readFile("lib/tsp-tracker.ts", "utf8"),
  actions: await readFile("app/tsp/actions.ts", "utf8"),
  page: await readFile("app/tsp/page.tsx", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
  client: await readFile("lib/local-db/client.ts", "utf8"),
  doctor: await readFile("scripts/local-doctor.mjs", "utf8"),
  workflow: await readFile(".github/workflows/build.yml", "utf8"),
  lockWorkflow: await readFile(".github/workflows/lockfile.yml", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

function atLeast17(version) {
  const [major = 0, minor = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return major > 1 || (major === 1 && minor >= 7);
}

const checks = [
  ["release includes V1.7 or newer", atLeast17(pkg.version)],
  [
    "TSP profile, snapshot, and fund schema exists",
    files.migration.includes("public.tsp_profiles") &&
      files.migration.includes("public.tsp_snapshots") &&
      files.migration.includes("public.tsp_fund_positions"),
  ],
  [
    "TSP tables are household isolated",
    files.migration.includes("tsp_profiles_household_access") &&
      files.migration.includes("tsp_snapshots_household_access") &&
      files.migration.includes("tsp_fund_positions_household_access"),
  ],
  [
    "local client registers all TSP tables",
    files.client.includes('"tsp_profiles"') &&
      files.client.includes('"tsp_snapshots"') &&
      files.client.includes('"tsp_fund_positions"'),
  ],
  [
    "2026 regular elective-deferral limit is dated and explicit",
    files.engine.includes("employeeDeferralLimit: 24_500") &&
      files.engine.includes("year: 2026"),
  ],
  [
    "2026 age 50 catch-up is encoded",
    files.engine.includes("catchUp50Plus: 8_000"),
  ],
  [
    "2026 age 60-63 catch-up is encoded",
    files.engine.includes("catchUpAge60To63: 11_250"),
  ],
  [
    "BRS full-match member threshold is 5 percent",
    files.engine.includes("fullMatchContributionPct = 5"),
  ],
  [
    "BRS match formula caps service match at four percent",
    files.engine.includes("return 4;") &&
      files.engine.includes("(safeRate - 3) * 0.5"),
  ],
  [
    "BRS matching waits until 24 months and tracks 26-year boundary",
    files.engine.includes("serviceMonths >= 24") &&
      files.engine.includes("26 * 12"),
  ],
  [
    "BRS automatic contribution checks 60 days",
    files.engine.includes("serviceDays >= 60"),
  ],
  [
    "outside-plan deferrals reduce remaining employee limit",
    files.engine.includes("externalDeferralsYtd") &&
      files.engine.includes("remainingEmployeeLimit"),
  ],
  [
    "tracker warns about early max-out risk",
    files.engine.includes("maxEarlyRisk") &&
      files.engine.includes("tsp:max-too-early"),
  ],
  [
    "Traditional and Roth elections combine for match tracking",
    files.engine.includes(
      "profile.traditionalContributionPct + profile.rothContributionPct"
    ),
  ],
  [
    "fund allocation supports core G/F/C/S/I plus Lifecycle",
    ["G", "F", "C", "S", "I"].every((fund) =>
      files.actions.includes(`["${fund}"`)
    ) &&
      files.actions.includes("lifecycleCode"),
  ],
  [
    "TSP workspace exists",
    (
      files.page.includes("MILITARY TSP TRACKER") &&
      files.page.includes("CONTRIBUTION PACE") &&
      files.page.includes("BRS MATCH") &&
      files.page.includes("FUND ALLOCATION")
    ) ||
      (
        files.page.includes('eyebrow="THRIFT SAVING PLAN"') &&
        files.page.includes("FUND HOLDINGS") &&
        files.page.includes("Current plan value")
      ),
  ],
  [
    "TSP tracker is in navigation",
    files.shell.includes('href: "/tsp"') &&
      files.shell.includes("Thrift Saving Plan") &&
      files.shell.indexOf('label: "INVEST"') <
        files.shell.indexOf('href: "/tsp"') &&
      files.shell.indexOf('href: "/tsp"') <
        files.shell.indexOf('label: "BUDGETING"'),
  ],
  [
    "Local Doctor verifies V1.7 TSP schema",
    files.doctor.includes("V1.7 Military TSP Tracker present"),
  ],
  [
    "TSP code stores no account password or login credential",
    !/tsp_password|tsp_username|tsp\.gov.*password|password.*tsp\.gov/i.test(
      files.migration + files.actions + files.engine
    ),
  ],
  [
    "CSV-first TSP actions update household-scoped account and holdings only",
    files.actions.includes('.from("accounts")') &&
      files.actions.includes('.from("holdings")') &&
      files.actions.includes("householdId") &&
      !files.actions.includes('.from("transactions")'),
  ],
  [
    "TSP tracker contains no financial execution calls",
    !/submitTrade|placeTrade|executeTrade|sendPayment|payBill|transferFunds|moveMoney/.test(
      files.engine + files.actions
    ),
  ],
  [
    "GitHub Build supports manual and pull-request verification",
    files.workflow.includes("workflow_dispatch:") &&
      files.workflow.includes("pull_request:"),
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
    `V1.7 Military TSP Tracker invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.7 Military TSP Tracker invariants passed.");
