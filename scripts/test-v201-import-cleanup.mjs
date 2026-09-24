import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  connectPage: await readFile("app/connect/page.tsx", "utf8"),
  connectDelete: await readFile(
    "app/api/connect/delete-import/route.ts",
    "utf8"
  ),
  tspDelete: await readFile(
    "app/api/tsp/delete-import/route.ts",
    "utf8"
  ),
  actions: await readFile(
    "components/ImportHistoryActions.tsx",
    "utf8"
  ),
  tspButton: await readFile(
    "components/DeleteTspImportButton.tsx",
    "utf8"
  ),
  undo: await readFile(
    "app/api/connect/undo/route.ts",
    "utf8"
  ),
};

const pkg = JSON.parse(files.packageJson);

function atLeast201(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return (
    major > 2 ||
    (major === 2 &&
      (minor > 0 || (minor === 0 && patch >= 1)))
  );
}

const checks = [
  ["release includes V2.0.1 or newer", atLeast201(pkg.version)],
  [
    "current Connect import still requires safe undo",
    files.connectDelete.includes('batch.status === "imported"') &&
      files.connectDelete.includes("requiresUndo: true") &&
      files.connectDelete.includes(
        "This is the current import for the account"
      ),
  ],
  [
    "superseded imports can be purged without rolling the account backward",
    files.connectDelete.includes("historical/superseded") &&
      files.connectDelete.includes("removeTaggedRows") &&
      files.connectDelete.includes("historicalPurge"),
  ],
  [
    "only a newer import of the same record type supersedes history",
    files.connectDelete.includes('.eq("record_type", batch.record_type)'),
  ],
  [
    "permanent Connect delete removes batch history",
    files.connectDelete.includes('.from("file_import_batches")') &&
      files.connectDelete.includes(".delete()") &&
      files.connectDelete.includes("batchDeleted: true"),
  ],
  [
    "Connect delete also removes matching TSP audit provenance",
    files.connectDelete.includes('.from("tsp_statement_imports")') &&
      files.connectDelete.includes("source_content_sha256") &&
      files.connectDelete.includes("tspAuditDeleted"),
  ],
  [
    "destructive UI tries historical delete before rollback",
    files.actions.indexOf('"/api/connect/delete-import"') <
      files.actions.indexOf('"/api/connect/undo"') &&
      files.actions.includes("deleteBody.requiresUndo === true"),
  ],
  [
    "current import falls back to undo and delete retry",
    files.actions.includes('status === "imported"') &&
      files.actions.includes('"/api/connect/undo"') &&
      files.actions.match(/\/api\/connect\/delete-import/g)?.length >= 2,
  ],
  [
    "delete confirmation is explicit and irreversible",
    files.actions.includes("Permanently delete") &&
      files.actions.includes("cannot be undone"),
  ],
  [
    "existing undo behavior remains available",
    files.undo.includes("restore prior holdings") &&
      files.undo.includes('status: "undone"'),
  ],
  [
    "Connect history exposes permanent delete controls",
    files.connectPage.includes("<ImportHistoryActions") &&
      files.connectPage.includes("IMPORT HISTORY"),
  ],
  [
    "Connect shows standalone TSP CSV history",
    files.connectPage.includes("TSP CSV HISTORY") &&
      files.connectPage.includes("<DeleteTspImportButton"),
  ],
  [
    "Connect suppresses duplicate TSP audit entries managed by file batches",
    files.connectPage.includes("connectDigests") &&
      files.connectPage.includes("standaloneTspImports"),
  ],
  [
    "TSP delete refuses imports managed by Connect history",
    files.tspDelete.includes(
      "managed by Connect Import History"
    ) &&
      files.tspDelete.includes(
        '.from("file_import_batches")'
      ),
  ],
  [
    "deleting newest standalone TSP import restores previous import",
    files.tspDelete.includes("restorePreviousTspImport") &&
      files.tspDelete.includes("previousCandidate") &&
      files.tspDelete.includes("restoredPrevious"),
  ],
  [
    "deleting last standalone TSP import removes file holdings safely",
    files.tspDelete.includes('ticker.startsWith("TSP-")') &&
      files.tspDelete.includes("Unable to remove TSP holdings") &&
      files.tspDelete.includes("last_file_import_at: null"),
  ],
  [
    "linked immutable TSP snapshot is deleted only by explicit import deletion",
    files.tspDelete.includes("confirmed_snapshot_id") &&
      files.tspDelete.includes('.from("tsp_snapshots")') &&
      files.tspDelete.includes(".delete()"),
  ],
  [
    "standalone TSP delete uses household scoping",
    files.tspDelete.includes('.eq("household_id", householdId)') &&
      files.tspButton.includes('"/api/tsp/delete-import"'),
  ],
  [
    "raw financial CSV content remains unpersisted",
    !files.connectDelete.includes("raw_file") &&
      !files.tspDelete.includes("raw_file"),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  throw new Error(
    `V2.0.1 Import Cleanup invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log(
  "V2.0.1 Import Cleanup invariants passed."
);
