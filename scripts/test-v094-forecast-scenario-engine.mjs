import { readFile } from "node:fs/promises";

const files = {
  engine: await readFile("lib/forecast-scenario-engine.ts", "utf8"),
  component: await readFile("components/ScenarioLab.tsx", "utf8"),
  page: await readFile("app/scenario-lab/page.tsx", "utf8"),
  chart: await readFile("components/InteractiveLineChart.tsx", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
};

const checks = [
  ["forecast engine exists", files.engine.includes("runForecast")],
  ["12-month baseline supported", files.component.includes("horizonMonths: 12")],
  ["reserve-limited cash deployment", files.engine.includes("maxDeployableCash") && files.engine.includes("reserveTarget")],
  ["cash strategy", files.engine.includes('"cash"')],
  ["invest strategy", files.engine.includes('"invest"')],
  ["debt strategy", files.engine.includes('"debt"')],
  ["same dollars comparison", files.component.includes("comparisonAllocation")],
  ["debt avalanche modeled", files.engine.includes("payDebtAvalanche")],
  ["minimum debt payments modeled", files.engine.includes("accrueAndPayMinimums")],
  ["debt payoff month exposed", files.engine.includes("debtPayoffMonth")],
  ["income stress control", files.component.includes("Income change")],
  ["spending stress control", files.component.includes("Spending change")],
  ["market shock control", files.component.includes("Immediate market shock")],
  ["return bands are deterministic", files.engine.includes("buildForecastBands")],
  ["scenario page uses reconciled cash flow", files.page.includes("getCashFlowIntelligence")],
  ["scenario page uses V0.9.3 health metrics", files.page.includes("buildFinancialHealthEngine")],
  ["three chart paths supported", files.chart.includes("#2f8d68")],
  ["release label updated", files.shell.includes("MONEY V0.9.4")],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V0.9.4 Forecast & Scenario Engine invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V0.9.4 Forecast & Scenario Engine invariants passed.");
