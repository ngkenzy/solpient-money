import { readFile } from "node:fs/promises";

const files = {
  reviewMigration: await readFile(
    "supabase/migrations/20260922200000_v091_review_reconcile.sql",
    "utf8"
  ),
  categoryMigration: await readFile(
    "supabase/migrations/20260922201000_v091_truth_category.sql",
    "utf8"
  ),
  securityMigration: await readFile(
    "supabase/migrations/20260922202000_v091_merge_security.sql",
    "utf8"
  ),
  engine: await readFile("lib/truth-engine.ts", "utf8"),
  actions: await readFile("app/data-health/actions.ts", "utf8"),
  page: await readFile("app/data-health/page.tsx", "utf8"),
  money: await readFile("lib/money-data.ts", "utf8"),
  client: await readFile("lib/local-db/client.ts", "utf8"),
};

const checks = [
  ["persistent account review status", files.reviewMigration.includes("identity_review_status")],
  ["persistent transaction duplicate review", files.reviewMigration.includes("duplicate_review_status")],
  ["persistent transfer review", files.reviewMigration.includes("transfer_review_status")],
  ["merchant rule table", files.reviewMigration.includes("truth_merchant_rules")],
  ["merge audit table", files.reviewMigration.includes("account_merge_audit")],
  ["atomic merge function", files.reviewMigration.includes("merge_truth_accounts")],
  ["overlap holdings are suppressed", files.reviewMigration.includes("truth_suppressed = true")],
  ["raw categories preserved", files.categoryMigration.includes("truth_category")],
  ["merge function hardened", files.securityMigration.includes("security definer")],
  ["human account rejection overrides automation", files.engine.includes('reviewStatus === "not_duplicate"')],
  ["duplicate rejection overrides automation", files.engine.includes('duplicateReviewStatus !== "unreviewed"')],
  ["transfer rejection overrides automation", files.engine.includes('state.transferReviewStatus === "rejected"')],
  ["merchant rules applied as derived data", files.engine.includes("truthCategory")],
  ["account merge review action", files.actions.includes("reviewAccountDuplicate")],
  ["manual transfer pairing", files.actions.includes("manuallyPairTransfer")],
  ["merchant rule action", files.actions.includes("createMerchantRule")],
  ["interactive reconciliation page", files.page.includes("DATA HEALTH")],
  ["Money hides suppressed holdings", files.money.includes('.eq("truth_suppressed", false)')],
  ["Money uses derived category", files.money.includes("row.truth_category ?? row.category")],
  ["local client allows merchant rules", files.client.includes('"truth_merchant_rules"')],
  ["local client allows merge audit", files.client.includes('"account_merge_audit"')],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V0.9.1 Review & Reconcile invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V0.9.1 Review & Reconcile invariants passed.");
