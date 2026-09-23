import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  migration: await readFile(
    "supabase/migrations/20260923130000_v13_money_autopilot.sql",
    "utf8"
  ),
  engine: await readFile("lib/money-autopilot.ts", "utf8"),
  api: await readFile("app/api/autopilot/route.ts", "utf8"),
  page: await readFile("app/autopilot/page.tsx", "utf8"),
  runner: await readFile(
    "components/AutopilotDailyRunner.tsx",
    "utf8"
  ),
  shell: await readFile("components/AppShell.tsx", "utf8"),
  copilotApi: await readFile(
    "app/api/copilot/route.ts",
    "utf8"
  ),
  copilotUi: await readFile(
    "components/MoneyCopilot.tsx",
    "utf8"
  ),
  localClient: await readFile(
    "lib/local-db/client.ts",
    "utf8"
  ),
};

const pkg = JSON.parse(files.packageJson);

function atLeast13(version) {
  const [major = 0, minor = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return major > 1 || (major === 1 && minor >= 3);
}

const checks = [
  ["release includes V1.3 or newer", atLeast13(pkg.version)],
  [
    "Autopilot ledger migration exists",
    files.migration.includes("create table if not exists public.money_autopilot_runs"),
  ],
  [
    "one daily run per household",
    files.migration.includes("unique (household_id, run_date)"),
  ],
  [
    "Autopilot ledger is household isolated",
    files.migration.includes("enable row level security") &&
      files.migration.includes("money_autopilot_runs_household_access"),
  ],
  [
    "local DB client registers Autopilot ledger",
    files.localClient.includes('"money_autopilot_runs"'),
  ],
  [
    "engine is deterministic V1.3",
    files.engine.includes('version: "1.3"') &&
      files.engine.includes("MoneyAutopilotBriefing"),
  ],
  [
    "daily run is idempotent unless manually forced",
    files.engine.includes("if (existing && !force)") &&
      files.engine.includes("skippedBecauseAlreadyRun"),
  ],
  [
    "automatic refresh respects connector capability",
    files.engine.includes("manifest.capabilities.automaticSync") &&
      files.engine.includes("instance.canSync"),
  ],
  [
    "manual file sources are not auto-synced",
    files.engine.includes("if (!overview.manifest.capabilities.automaticSync) continue"),
  ],
  [
    "Autopilot compares prior daily snapshot",
    files.engine.includes('.lt("run_date", beforeDate)') &&
      files.engine.includes("metricChanges"),
  ],
  [
    "Autopilot reuses cash-flow anomaly engine",
    files.engine.includes("getCashFlowIntelligence"),
  ],
  [
    "Autopilot reuses V1.2 plan monitor read-only",
    files.engine.includes("getPlanMonitoring(now") &&
      files.engine.includes("createBaseline: false"),
  ],
  [
    "Autopilot persists only derived daily briefing state",
    files.engine.includes('.from("money_autopilot_runs")') &&
      files.engine.includes("connector_report") &&
      files.engine.includes("briefing"),
  ],
  [
    "Autopilot API supports read and run",
    files.api.includes("export async function GET") &&
      files.api.includes("export async function POST"),
  ],
  [
    "daily runner runs at most once per browser day",
    files.runner.includes("localStorage.getItem") &&
      files.runner.includes("solpient-money-autopilot-last-run"),
  ],
  [
    "Autopilot workspace exposes changes and source freshness",
    files.page.includes("WHAT CHANGED") &&
      files.page.includes("Freshness and connector health") &&
      files.page.includes("DESERVES ATTENTION"),
  ],
  [
    "Copilot supports daily briefing",
    files.copilotApi.includes('intent: "money_autopilot"') &&
      files.copilotUi.includes("Give me my daily briefing"),
  ],
  [
    "global shell runs and links Autopilot",
    files.shell.includes("<AutopilotDailyRunner />") &&
      files.shell.includes('{ href: "/autopilot"'),
  ],
  [
    "release badge shows V1.3",
    files.shell.includes("MONEY V1."),
  ],
  [
    "engine contains no payment or trading connector calls",
    !/submitTrade|placeTrade|executeTrade|sendPayment|payBill|transferFunds|moveMoney/.test(
      files.engine
    ),
  ],
  [
    "engine does not edit goals or planning assumptions",
    !files.engine.includes('.from("goals").update') &&
      !files.engine.includes('.from("planning_assumptions").update'),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.3 Money Autopilot invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.3 Money Autopilot invariants passed.");
