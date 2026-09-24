import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  migration: await readFile(
    "supabase/migrations/20260923160000_v16_portfolio_history_decisions.sql",
    "utf8"
  ),
  engine: await readFile(
    "lib/portfolio-history.ts",
    "utf8"
  ),
  portfolioEngine: await readFile(
    "lib/portfolio-intelligence.ts",
    "utf8"
  ),
  autopilot: await readFile(
    "lib/money-autopilot.ts",
    "utf8"
  ),
  journalPage: await readFile(
    "app/decision-journal/page.tsx",
    "utf8"
  ),
  journalActions: await readFile(
    "app/decision-journal/actions.ts",
    "utf8"
  ),
  holdingPage: await readFile(
    "app/portfolio/[ticker]/page.tsx",
    "utf8"
  ),
  actionCenter: await readFile(
    "app/action-center/page.tsx",
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
  localClient: await readFile(
    "lib/local-db/client.ts",
    "utf8"
  ),
  doctor: await readFile(
    "scripts/local-doctor.mjs",
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

function atLeast16(version) {
  const [major = 0, minor = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return major > 1 || (major === 1 && minor >= 6);
}

const checks = [
  ["release includes V1.6 or newer", atLeast16(pkg.version)],
  [
    "daily position history schema exists",
    files.migration.includes(
      "create table if not exists public.portfolio_position_snapshots"
    ),
  ],
  [
    "one position history row per household ticker day",
    files.migration.includes(
      "unique (household_id, snapshot_date, ticker)"
    ),
  ],
  [
    "human decision journal schema exists",
    files.migration.includes(
      "create table if not exists public.investment_decisions"
    ),
  ],
  [
    "journal decision vocabulary is constrained",
    ["hold", "add_later", "reduce_later", "watch", "no_action"].every(
      (value) => files.migration.includes(`'${value}'`)
    ),
  ],
  [
    "decisions can link to Action Center and evidence snapshot",
    files.migration.includes("action_item_id") &&
      files.migration.includes("position_snapshot_id"),
  ],
  [
    "decision-time baseline is frozen independently of daily snapshot updates",
    files.migration.includes("baseline_snapshot jsonb") &&
      files.engine.includes("baseline_snapshot:") &&
      files.engine.includes("decision?.baselineSnapshot"),
  ],
  [
    "V1.6 tables are household isolated",
    files.migration.includes(
      "portfolio_position_snapshots_household_access"
    ) &&
      files.migration.includes(
        "investment_decisions_household_access"
      ),
  ],
  [
    "local DB client registers V1.6 tables",
    files.localClient.includes('"portfolio_position_snapshots"') &&
      files.localClient.includes('"investment_decisions"'),
  ],
  [
    "history capture stores exact shares and Research version",
    files.engine.includes("shares: holding.shares") &&
      files.engine.includes("position.researchVersion"),
  ],
  [
    "JSONB review reasons are serialized for local PostgreSQL",
    files.engine.includes("JSON.stringify(") &&
      files.engine.includes("position.reviewReasons"),
  ],
  [
    "decision baseline loads the complete evidence snapshot",
    files.engine.includes('.select("*")') &&
      files.engine.includes("baseline_snapshot:"),
  ],
  [
    "V1.5 carries Research version into V1.6",
    files.portfolioEngine.includes("researchVersion: number | null") &&
      files.portfolioEngine.includes(
        "researchVersion: snapshot.research_version"
      ),
  ],
  [
    "Autopilot captures V1.6 history",
    files.autopilot.includes(
      'decisionHistoryVersion: "1.6"'
    ) &&
      files.autopilot.includes("capturePortfolioHistory"),
  ],
  [
    "journal captures current evidence before saving decision",
    files.journalActions.includes("capturePortfolioHistory") &&
      files.journalActions.includes("createInvestmentDecision"),
  ],
  [
    "Action Center can hand portfolio review into journal",
    files.actionCenter.includes("Record decision") &&
      files.actionCenter.includes("actionItemId="),
  ],
  [
    "journal validates Action Center ownership",
    files.engine.includes("validatedActionItemId") &&
      files.engine.includes('.eq("household_id", householdId)'),
  ],
  [
    "holding pages show decision change and history charts",
    files.holdingPage.includes("V1.6 DECISION HISTORY") &&
      files.holdingPage.includes("getDecisionChange") &&
      files.holdingPage.includes("getTickerHistory") &&
      files.holdingPage.includes("InteractiveLineChart"),
  ],
  [
    "portfolio attribution is deterministic from snapshots",
    files.engine.includes("getPortfolioAttribution") &&
      files.engine.includes("valueChange"),
  ],
  [
    "Copilot supports what changed since last decision",
    files.copilotApi.includes('intent: "decision_history"') &&
      files.copilotApi.includes("getDecisionChange") &&
      files.copilotUi.includes("What changed since my last decision?"),
  ],
  [
    "navigation exposes Decision Journal without a legacy version badge",
    files.shell.includes('href: "/decision-journal"') &&
      !files.shell.includes("MONEY V1."),
  ],
  [
    "Local Doctor verifies V1.6 schema",
    files.doctor.includes(
      "V1.6 portfolio history and Decision Journal present"
    ),
  ],
  [
    "V1.6 engine contains no trade execution calls",
    !/submitTrade|placeTrade|executeTrade|sendPayment|payBill|transferFunds|moveMoney/.test(
      files.engine
    ),
  ],
  [
    "journal actions do not execute financial transactions",
    !/submitTrade|placeTrade|executeTrade|sendPayment|payBill|transferFunds|moveMoney/.test(
      files.journalActions
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
    `V1.6 Portfolio History/Decision Journal invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log(
  "V1.6 Portfolio History + Decision Journal invariants passed."
);
