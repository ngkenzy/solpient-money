import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  migration: await readFile(
    "supabase/migrations/20260923143000_v14_action_center.sql",
    "utf8"
  ),
  actionCenter: await readFile(
    "lib/money-action-center.ts",
    "utf8"
  ),
  autopilot: await readFile(
    "lib/money-autopilot.ts",
    "utf8"
  ),
  page: await readFile(
    "app/action-center/page.tsx",
    "utf8"
  ),
  actions: await readFile(
    "app/action-center/actions.ts",
    "utf8"
  ),
  badge: await readFile(
    "components/ActionCenterNavBadge.tsx",
    "utf8"
  ),
  shell: await readFile(
    "components/AppShell.tsx",
    "utf8"
  ),
  scheduler: await readFile(
    "scripts/install-autopilot-scheduler.mjs",
    "utf8"
  ),
  scheduledRunner: await readFile(
    "scripts/run-scheduled-autopilot.mjs",
    "utf8"
  ),
  uninstall: await readFile(
    "scripts/uninstall-autopilot-scheduler.mjs",
    "utf8"
  ),
  localClient: await readFile(
    "lib/local-db/client.ts",
    "utf8"
  ),
};

const pkg = JSON.parse(files.packageJson);

function atLeast14(version) {
  const [major = 0, minor = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return major > 1 || (major === 1 && minor >= 4);
}

const checks = [
  ["release includes V1.4 or newer", atLeast14(pkg.version)],
  [
    "Action Center schema exists",
    files.migration.includes(
      "create table if not exists public.money_action_items"
    ),
  ],
  [
    "Action Center source keys are unique per household",
    files.migration.includes(
      "unique (household_id, source_key)"
    ),
  ],
  [
    "Action Center supports required workflow states",
    ["new", "reviewed", "snoozed", "resolved"].every(
      (value) => files.migration.includes(`'${value}'`)
    ),
  ],
  [
    "Action Center is household isolated",
    files.migration.includes("enable row level security") &&
      files.migration.includes(
        "money_action_items_household_access"
      ),
  ],
  [
    "local DB client registers Action Center",
    files.localClient.includes('"money_action_items"'),
  ],
  [
    "only critical/watch alerts become action items",
    files.actionCenter.includes(
      'alert.level === "critical"'
    ) &&
      files.actionCenter.includes(
        'alert.level === "watch"'
      ),
  ],
  [
    "cleared conditions auto-resolve",
    files.actionCenter.includes(
      'resolution_reason: "condition_cleared"'
    ),
  ],
  [
    "resolved recurrence reopens as new",
    files.actionCenter.includes(
      'existing?.status === "resolved"'
    ) &&
      files.actionCenter.includes('status = "new"'),
  ],
  [
    "Autopilot feeds Action Center",
    files.autopilot.includes(
      "syncActionCenterFromAlerts"
    ),
  ],
  [
    "Action Center exposes review/snooze/resolve/reopen",
    files.page.includes("Mark reviewed") &&
      files.page.includes("Snooze 1 day") &&
      files.page.includes("Resolve") &&
      files.page.includes("Reopen"),
  ],
  [
    "workflow actions use server actions",
    files.actions.includes('"use server"') &&
      files.actions.includes("setMoneyActionStatus"),
  ],
  [
    "sidebar has live Action Center badge",
    files.shell.includes('href: "/action-center"') &&
      files.shell.includes("<ActionCenterNavBadge />") &&
      files.badge.includes("/api/action-center"),
  ],
  [
    "top notification bell opens Action Center",
    files.shell.includes(
      'aria-label="Open Action Center"'
    ) &&
      files.shell.includes('href="/action-center"'),
  ],
  [
    "scheduler uses dedicated local production port",
    files.scheduler.includes("127.0.0.1") &&
      files.scheduler.includes("3210"),
  ],
  [
    "scheduler uses macOS LaunchAgents",
    files.scheduler.includes("Library") &&
      files.scheduler.includes("LaunchAgents") &&
      files.scheduler.includes("launchctl"),
  ],
  [
    "daily schedule defaults to 08:00",
    files.scheduler.includes('arg("hour", "8")') &&
      files.scheduler.includes('arg("minute", "0")'),
  ],
  [
    "background service can run with browser closed",
    files.scheduler.includes("<key>KeepAlive</key>") &&
      files.scheduler.includes("<key>RunAtLoad</key>"),
  ],
  [
    "scheduled runner retries local service",
    files.scheduledRunner.includes(
      "attempt <= 10"
    ),
  ],
  [
    "desktop notifications only occur for material findings",
    files.scheduledRunner.includes(
      "critical > 0 || watch > 0"
    ) &&
      files.scheduledRunner.includes("osascript"),
  ],
  [
    "scheduler uninstaller preserves financial data",
    files.uninstall.includes("LaunchAgents") &&
      !files.uninstall.includes("docker") &&
      !files.uninstall.includes("money_action_items"),
  ],
  [
    "release badge shows V1.4",
    files.shell.includes("MONEY V1.4"),
  ],
  [
    "Action Center engine contains no financial execution calls",
    !/submitTrade|placeTrade|executeTrade|sendPayment|payBill|transferFunds|moveMoney/.test(
      files.actionCenter
    ),
  ],
  [
    "scheduler contains no financial execution calls",
    !/submitTrade|placeTrade|executeTrade|sendPayment|payBill|transferFunds|moveMoney/.test(
      files.scheduledRunner
    ),
  ],
  [
    "Action Center does not mutate goals or planning policy",
    !files.actionCenter.includes('.from("goals")') &&
      !files.actionCenter.includes(
        '.from("planning_assumptions")'
      ),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.4 Action Center/Scheduler invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log(
  "V1.4 Action Center + Local Scheduler invariants passed."
);
