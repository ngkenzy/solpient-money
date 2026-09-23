import { readFile } from "node:fs/promises";

const files = {
  engine: await readFile("lib/financial-health-engine.ts", "utf8"),
  healthPage: await readFile("app/health/page.tsx", "utf8"),
  home: await readFile("app/page.tsx", "utf8"),
  insights: await readFile("app/insights/page.tsx", "utf8"),
  debt: await readFile("app/debt/page.tsx", "utf8"),
  retirement: await readFile("app/retirement/page.tsx", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
};

const checks = [
  ["health engine version", files.engine.includes('version: "0.9.3"')],
  ["research excluded from health inputs", !files.engine.includes("ResearchSnapshot")],
  ["liquidity component", files.engine.includes('key: "liquidity"')],
  ["cash-flow component", files.engine.includes('key: "cashflow"')],
  ["debt component", files.engine.includes('key: "debt"')],
  ["portfolio component", files.engine.includes('key: "portfolio"')],
  ["retirement component", files.engine.includes('key: "retirement"')],
  ["goals component", files.engine.includes('key: "goals"')],
  ["emergency reserve uses household target", files.engine.includes("emergencyFundTargetMonths")],
  ["high-interest debt uses household threshold", files.engine.includes("highInterestDebtAprPct")],
  ["portfolio uses household thresholds", files.engine.includes("singleStockReviewPct") && files.engine.includes("topThreeStockReviewPct")],
  ["retirement uses trailing average surplus", files.engine.includes("averageMonthlySurplus")],
  ["retirement target funding visible", files.engine.includes("retirementFundingPct")],
  ["health dashboard exists", files.healthPage.includes("FINANCIAL HEALTH ENGINE")],
  ["health dashboard explains score", files.healthPage.includes("Show calculation")],
  ["home uses new health engine", files.home.includes("buildFinancialHealthEngine")],
  ["insights uses new health engine", files.insights.includes("buildFinancialHealthEngine")],
  ["debt detail uses new health engine", files.debt.includes("buildFinancialHealthEngine")],
  ["retirement detail uses new health engine", files.retirement.includes("buildFinancialHealthEngine")],
  ["financial health navigation", files.shell.includes('href: "/health"')],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V0.9.3 Financial Health Engine invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V0.9.3 Financial Health Engine invariants passed.");
