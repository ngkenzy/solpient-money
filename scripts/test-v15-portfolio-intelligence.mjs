import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  engine: await readFile("lib/portfolio-intelligence.ts", "utf8"),
  page: await readFile("app/portfolio-intelligence/page.tsx", "utf8"),
  portfolioPage: await readFile("app/portfolio/page.tsx", "utf8"),
  shell: await readFile("components/AppShell.tsx", "utf8"),
  workflow: await readFile(".github/workflows/build.yml", "utf8"),
  lockWorkflow: await readFile(".github/workflows/lockfile.yml", "utf8"),
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
    "portfolio intelligence engine is local-only",
    files.engine.includes('version: "2.0"') &&
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
    "engine has no Research dependency",
    !/research/i.test(files.engine),
  ],
  [
    "portfolio intelligence workspace exists",
    files.page.includes("PORTFOLIO INTELLIGENCE") &&
      files.page.includes("Positions ranked by review priority") &&
      files.page.includes("SECTOR EXPOSURE"),
  ],
  [
    "portfolio intelligence page has no Research copy",
    !files.page.includes("Research snapshot") &&
      !files.page.includes("research coverage") &&
      !files.page.includes("fair value"),
  ],
  [
    "portfolio page promotes portfolio intelligence",
    files.portfolioPage.includes('href="/portfolio-intelligence"'),
  ],
  [
    "navigation exposes Portfolio Intelligence workspace",
    files.shell.includes('href: "/portfolio-intelligence"'),
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
    "GitHub build workflow supports manual and pull-request verification",
    files.workflow.includes("workflow_dispatch:") &&
      files.workflow.includes("pull_request:"),
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

console.log("V1.5 Portfolio Intelligence invariants passed.");
