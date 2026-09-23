import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  engine: await readFile(
    "lib/portfolio-intelligence.ts",
    "utf8"
  ),
  page: await readFile(
    "app/portfolio-intelligence/page.tsx",
    "utf8"
  ),
  portfolioPage: await readFile(
    "app/portfolio/page.tsx",
    "utf8"
  ),
  autopilot: await readFile(
    "lib/money-autopilot.ts",
    "utf8"
  ),
  actionCenter: await readFile(
    "lib/money-action-center.ts",
    "utf8"
  ),
  copilotApi: await readFile(
    "app/api/copilot/route.ts",
    "utf8"
  ),
  copilotUi: await readFile(
    "components/MoneyCopilot.tsx",
    "utf8"
  ),
  shell: await readFile(
    "components/AppShell.tsx",
    "utf8"
  ),
  workflow: await readFile(
    ".github/workflows/build.yml",
    "utf8"
  ),
  lockWorkflow: await readFile(
    ".github/workflows/lockfile.yml",
    "utf8"
  ),
};

const pkg = JSON.parse(files.packageJson);

function atLeast15(version) {
  const [major = 0, minor = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return major > 1 || (major === 1 && minor >= 5);
}

const checks = [
  ["release includes V1.5 or newer", atLeast15(pkg.version)],
  [
    "portfolio intelligence engine exists",
    files.engine.includes('version: "1.5"') &&
      files.engine.includes("buildPortfolioIntelligence"),
  ],
  [
    "position review priority uses household single-stock threshold",
    files.engine.includes("singleStockReviewPct") &&
      files.engine.includes("reviewPriority"),
  ],
  [
    "top-three concentration uses household policy",
    files.engine.includes("topThreeStockReviewPct") &&
      files.engine.includes("topThreeStockWeightPct"),
  ],
  [
    "valuation gap derives from current holding price and published base value",
    files.engine.includes("snapshot.base_value") &&
      files.engine.includes("holding.price") &&
      files.engine.includes("valuationGapPct"),
  ],
  [
    "thesis deterioration affects review priority",
    files.engine.includes("thesis_weakened_count") &&
      files.engine.includes("thesisNeedsReview"),
  ],
  [
    "evidence confidence and decision readiness remain separate",
    files.engine.includes("evidenceConfidence") &&
      files.engine.includes("decisionReadiness"),
  ],
  [
    "uncovered material holdings are not assigned synthetic Research",
    files.engine.includes("lacks published Research coverage") &&
      files.engine.includes("researchCovered: false"),
  ],
  [
    "portfolio intelligence workspace exists",
    files.page.includes("V1.5 · PORTFOLIO INTELLIGENCE") &&
      files.page.includes("Positions ranked by review priority") &&
      files.page.includes("SECTOR EXPOSURE"),
  ],
  [
    "portfolio page promotes V1.5 intelligence",
    files.portfolioPage.includes("V1.5 PORTFOLIO INTELLIGENCE") &&
      files.portfolioPage.includes('href="/portfolio-intelligence"'),
  ],
  [
    "Autopilot carries V1.5 portfolio signals",
    files.autopilot.includes('portfolioIntelligenceVersion: "1.5"') &&
      files.autopilot.includes("portfolioSignals") &&
      files.autopilot.includes('category: "portfolio"'),
  ],
  [
    "Action Center still filters to material critical/watch signals",
    files.actionCenter.includes('alert.level === "critical"') &&
      files.actionCenter.includes('alert.level === "watch"'),
  ],
  [
    "Copilot supports deterministic portfolio intelligence",
    files.copilotApi.includes('intent: "portfolio_intelligence"') &&
      files.copilotApi.includes("buildPortfolioIntelligence") &&
      files.copilotUi.includes("Which holdings need review?"),
  ],
  [
    "navigation exposes V1.5 workspace",
    files.shell.includes('href: "/portfolio-intelligence"') &&
      files.shell.includes("MONEY V1.5"),
  ],
  [
    "portfolio engine contains no financial execution calls",
    !/submitTrade|placeTrade|executeTrade|sendPayment|payBill|transferFunds|moveMoney/.test(
      files.engine
    ),
  ],
  [
    "portfolio engine does not mutate Money data",
    !files.engine.includes('.from("accounts")') &&
      !files.engine.includes('.from("holdings")') &&
      !files.engine.includes('.from("goals")') &&
      !files.engine.includes('.from("planning_assumptions")'),
  ],
  [
    "GitHub build workflow remains manual-only",
    files.workflow.includes("workflow_dispatch:") &&
      !files.workflow.includes("push:") &&
      !files.workflow.includes("pull_request:"),
  ],
  [
    "GitHub lockfile workflow remains manual-only",
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
    `V1.5 Portfolio Intelligence invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log(
  "V1.5 Portfolio Intelligence invariants passed."
);
