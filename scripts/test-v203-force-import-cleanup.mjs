import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  forceDelete: await readFile(
    "app/api/connect/force-delete-import/route.ts",
    "utf8"
  ),
  actions: await readFile(
    "components/ImportHistoryActions.tsx",
    "utf8"
  ),
};

const pkg = JSON.parse(files.packageJson);

function atLeast203(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return (
    major > 2 ||
    (major === 2 &&
      (minor > 0 || (minor === 0 && patch >= 3)))
  );
}

const checks = [
  ["release includes V2.0.3 or newer", atLeast203(pkg.version)],
  [
    "force-delete endpoint exists",
    files.forceDelete.includes("export async function POST") &&
      files.forceDelete.includes("force-delete this import"),
  ],
  [
    "force delete removes rows by import batch id",
    files.forceDelete.includes('.from("transactions")') &&
      files.forceDelete.includes('.from("holdings")') &&
      files.forceDelete.includes('.eq("import_batch_id", batchId)'),
  ],
  [
    "force delete removes import history itself",
    files.forceDelete.includes('.from("file_import_batches")') &&
      files.forceDelete.includes(".delete()") &&
      files.forceDelete.includes("purged: true"),
  ],
  [
    "force delete does not depend on rollback payload restoration",
    !files.forceDelete.includes("rollback_payload") &&
      !files.forceDelete.includes("priorHoldings"),
  ],
  [
    "force delete reconciles the affected account from remaining data",
    files.forceDelete.includes("remainingHoldings") &&
      files.forceDelete.includes("remainingBatches") &&
      files.forceDelete.includes("balance_cents"),
  ],
  [
    "empty file-created account can be removed after purge",
    files.forceDelete.includes("created_account") &&
      files.forceDelete.includes("accountDeleted = true"),
  ],
  [
    "matching TSP provenance is also purged",
    files.forceDelete.includes('.from("tsp_statement_imports")') &&
      files.forceDelete.includes("source_content_sha256"),
  ],
  [
    "force delete is household scoped",
    files.forceDelete.includes('.eq("household_id", householdId)'),
  ],
  [
    "UI exposes explicit Force delete action",
    files.actions.includes("Force delete") &&
      files.actions.includes('"/api/connect/force-delete-import"'),
  ],
  [
    "Force delete confirmation explains rollback bypass",
    files.actions.includes("bypasses rollback restoration") &&
      files.actions.includes("cannot be undone"),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  throw new Error(
    `V2.0.3 Force Import Cleanup invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log(
  "V2.0.3 Force Import Cleanup invariants passed."
);
