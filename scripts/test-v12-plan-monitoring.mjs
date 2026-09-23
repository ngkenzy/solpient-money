import { readFile } from "node:fs/promises";

const files = {
  migration: await readFile(
    "supabase/migrations/20260923104500_v12_plan_monitoring.sql",
    "utf8"
  ),
  engine: await readFile("lib/plan-monitor-engine.ts", "utf8"),
  page: await readFile("app/monitor/page.tsx", "utf8"),
  actions: await readFile("app/monitor/actions.ts", "utf8"),
  client: await readFile("lib/local-db/client.ts", "utf8"),
  live: await readFile("scripts/test-local-db-live.mjs", "utf8"),
  copilotRoute: await readFile("app/api/copilot/route.ts", "utf8"),
  copilotUi: await readFile("components/MoneyCopilot.tsx", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
};

const refreshStart = files.actions.indexOf(
  "export async function refreshPlanMonitoring"
);
const resetStart = files.actions.indexOf(
  "export async function resetPlanMonitoringBaseline"
);
const refreshBlock = files.actions.slice(
  refreshStart,
  resetStart > refreshStart ? resetStart : undefined
);

const checks = [
  ["V1.2 monitoring table migration exists", files.migration.includes("financial_plan_snapshots")],
  ["monthly baseline is unique per household", files.migration.includes("unique (household_id, plan_month)")],
  ["baseline stores full V1.1 plan payload", files.migration.includes("baseline_plan jsonb")],
  ["local DB client registers plan snapshots", files.client.includes('"financial_plan_snapshots"')],
  ["live PostgreSQL test verifies plan snapshots", files.live.includes("financial_plan_snapshots")],
  ["monitor engine version", files.engine.includes('version: "1.2"')],
  ["normal monitoring preserves an existing baseline", files.engine.includes("if (!snapshot && options.createBaseline !== false)")],
  ["read-only monitoring can avoid baseline creation", files.engine.includes("createBaseline?: boolean")],
  ["explicit reset is the overwrite path", files.actions.includes("overwrite: true")],
  ["ordinary refresh does not overwrite baseline", !refreshBlock.includes("overwrite: true")],
  ["current-month pace waits for material progress", files.engine.includes("progressPct >= 20")],
  ["spending materiality uses dollars and percentage", files.engine.includes("projectedVariance > 100") && files.engine.includes("projectedVariancePct")],
  ["debt payoff drift is detected", files.engine.includes("debtPayoffDeltaMonths")],
  ["goal requirement drift is detected", files.engine.includes("higher_requirement")],
  ["retirement requirement drift is detected", files.engine.includes("retirementRequiredMonthlyDelta")],
  ["alignment score penalizes watch and critical signals", files.engine.includes('signal.level === "critical"') && files.engine.includes('signal.level === "watch"')],
  ["monitor page exposes baseline reset control", files.page.includes("Reset monthly baseline")],
  ["monitor page shows material changes", files.page.includes("MATERIAL CHANGES")],
  ["monitor page shows monthly history", files.page.includes("MONTHLY BASELINE HISTORY")],
  ["Copilot monitoring path is deterministic", files.copilotRoute.includes('intent: "plan_monitoring"')],
  ["Copilot monitoring path is read-only", files.copilotRoute.includes("createBaseline: false")],
  ["Copilot has monitoring quick prompt", files.copilotUi.includes("What changed from my financial plan?")],
  ["Plan Monitor is navigable", files.shell.includes('href: "/monitor"')],
  ["release label remains on V1 release line", files.shell.includes("MONEY V1.")],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.2 Continuous Plan Monitoring invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.2 Continuous Plan Monitoring invariants passed.");
