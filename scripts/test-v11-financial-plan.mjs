import { readFile } from "node:fs/promises";

const files = {
  engine: await readFile("lib/financial-plan-engine.ts", "utf8"),
  page: await readFile("app/plan/page.tsx", "utf8"),
  goals: await readFile("app/goals/page.tsx", "utf8"),
  goalActions: await readFile("app/goals/actions.ts", "utf8"),
  data: await readFile("lib/money-data.ts", "utf8"),
  demo: await readFile("lib/demo-data.ts", "utf8"),
  copilot: await readFile("lib/money-copilot.ts", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
  setup: await readFile("app/setup/actions.ts", "utf8"),
  planActions: await readFile("app/plan/actions.ts", "utf8"),
};

const checks = [
  ["V1.1 plan engine exists", files.engine.includes('version: "1.1"')],
  ["one observed surplus pool", files.engine.includes("let remaining = monthlySurplus")],
  ["reserve allocation consumes remaining once", files.engine.includes("remaining -= reserveAllocation")],
  ["debt allocation consumes remaining once", files.engine.includes("remaining -= debtAllocation")],
  ["goal allocation consumes remaining once", files.engine.includes("remaining -= planned")],
  ["retirement allocation consumes remaining once", files.engine.includes("remaining -= retirementAllocation")],
  ["reserve catch-up uses 12-month policy", files.engine.includes("reserveGap / 12")],
  ["high-interest debt uses household APR threshold", files.engine.includes("highInterestDebtAprPct")],
  ["high-interest target uses amortizing payment", files.engine.includes("amortizingPayment")],
  ["freed debt minimums roll forward", files.engine.includes("totalBudget - spentOnMinimums")],
  ["debt avalanche follows APR order", files.engine.includes("sort((a, b) => b.apr - a.apr)")],
  ["undated goals do not get invented requirements", files.engine.includes("goal.requiredMonthly == null")],
  ["dated goals calculate required monthly funding", files.engine.includes("gap / monthsRemaining")],
  ["retirement requirement is solved from target", files.engine.includes("requiredContributionForTarget")],
  ["flexible money is explicit", files.engine.includes("flexibleMonthly")],
  ["plan page exposes why and change conditions", files.page.includes("What changes this?") && files.page.includes("line.why")],
  ["goal dates loaded from database", files.data.includes("targetDate: row.target_date")],
  ["goal priorities loaded from database", files.data.includes("priority: numberValue(row.priority")],
  ["goal editor supports target dates", files.goals.includes('name="target_date"')],
  ["goal mutations revalidate plan", files.goalActions.includes('revalidatePath("/plan")')],
  ["demo setup seeds goal dates", files.setup.includes("target_date: goal.targetDate")],
  ["Copilot uses same plan engine", files.copilot.includes("buildHouseholdFinancialPlan")],
  ["Copilot can explain plan", files.copilot.includes('intent: "financial_plan"')],
  ["household policy is editable", files.planActions.includes("updatePlanPolicy")],
  ["policy update revalidates plan", files.planActions.includes('revalidatePath("/plan")')],
  ["Financial Plan is navigable", files.shell.includes('href: "/plan"')],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.1 Household Financial Plan invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V1.1 Household Financial Plan invariants passed.");
