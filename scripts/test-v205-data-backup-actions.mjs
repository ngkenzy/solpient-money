import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  backupLib: await readFile("lib/backup.ts", "utf8"),
  backupRoute: await readFile(
    "app/api/data/backup/route.ts",
    "utf8"
  ),
  restoreRoute: await readFile(
    "app/api/data/restore/route.ts",
    "utf8"
  ),
  actions: await readFile(
    "components/DataBackupActions.tsx",
    "utf8"
  ),
  dataPage: await readFile(
    "app/data/page.tsx",
    "utf8"
  ),
  backupScript: await readFile(
    "scripts/local-backup.mjs",
    "utf8"
  ),
};

const pkg = JSON.parse(files.packageJson);

function atLeast205(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return (
    major > 3 ||
    (major === 3 &&
      (minor > 0 || (minor === 0 && patch >= 5)))
  );
}

const checks = [
  ["release includes V3.0.5 or newer", atLeast205(pkg.version)],
  [
    "backup lib keeps the SOLPIENT1 artifact format",
    files.backupLib.includes('"SOLPIENT1"') &&
      files.backupLib.includes("aes-256-gcm") &&
      files.backupScript.includes("SOLPIENT1"),
  ],
  [
    "backup route creates an encrypted backup and returns a download",
    files.backupRoute.includes(
      "export async function POST"
    ) &&
      files.backupRoute.includes(
        "createEncryptedBackup"
      ) &&
      files.backupRoute.includes(
        "Content-Disposition"
      ),
  ],
  [
    "restore decrypts and authenticates before replaying SQL",
    (() => {
      const body =
        files.backupLib.split(
          "export function restoreBackupArtifact"
        )[1] ?? "";
      return (
        body.includes("decryptBackupArtifact") &&
        body.indexOf("decryptBackupArtifact") <
          body.indexOf("spawnSync")
      );
    })(),
  ],
  [
    "restore rejects foreign or tampered files with 400",
    files.restoreRoute.includes(
      "BackupValidationError"
    ) && files.restoreRoute.includes("400"),
  ],
  [
    "backup and restore routes require an authenticated session",
    files.backupRoute.includes(
      "getConnectHouseholdContext"
    ) &&
      files.restoreRoute.includes(
        "getConnectHouseholdContext"
      ),
  ],
  [
    "UI offers download backup and restore from backup",
    files.actions.includes(
      '"/api/data/backup"'
    ) &&
      files.actions.includes(
        '"/api/data/restore"'
      ) &&
      files.actions.includes("Download backup") &&
      files.actions.includes("Restore from backup"),
  ],
  [
    "restore uses the shared two-click confirm panel",
    files.actions.includes(
      "<ImportActionConfirm"
    ) &&
      files.actions.includes(
        "<ImportActionAlert"
      ),
  ],
  [
    "data page no longer sends users to the terminal for backups",
    !files.dataPage.includes("npm run local:backup"),
  ],
  [
    "data page renders the backup actions",
    files.dataPage.includes(
      "<DataBackupActions"
    ),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  throw new Error(
    `V3.0.5 Data Backup Actions invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log(
  "V3.0.5 Data Backup Actions invariants passed."
);
