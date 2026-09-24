import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  importActions: await readFile(
    "components/ImportHistoryActions.tsx",
    "utf8"
  ),
  tspActions: await readFile(
    "components/DeleteTspImportButton.tsx",
    "utf8"
  ),
  css: await readFile("app/globals.css", "utf8"),
};

const pkg = JSON.parse(files.packageJson);

function atLeast204(version) {
  const [major = 0, minor = 0, patch = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return (
    major > 2 ||
    (major === 2 &&
      (minor > 0 || (minor === 0 && patch >= 4)))
  );
}

const checks = [
  ["release includes V2.0.4 or newer", atLeast204(pkg.version)],
  [
    "Connect import actions do not depend on browser confirm dialogs",
    !files.importActions.includes("window.confirm"),
  ],
  [
    "TSP delete does not depend on browser confirm dialogs",
    !files.tspActions.includes("window.confirm"),
  ],
  [
    "Connect actions use explicit inline confirmation state",
    files.importActions.includes("setConfirming") &&
      files.importActions.includes("Confirm delete") &&
      files.importActions.includes("Confirm force delete") &&
      files.importActions.includes("Confirm undo"),
  ],
  [
    "TSP delete uses explicit inline confirmation state",
    files.tspActions.includes("setConfirming(true)") &&
      files.tspActions.includes("Confirm delete"),
  ],
  [
    "Connect API errors are rendered as accessible visible alerts",
    files.importActions.includes('role="alert"') &&
      files.importActions.includes("connect-action-error"),
  ],
  [
    "TSP API errors are rendered as accessible visible alerts",
    files.tspActions.includes('role="alert"') &&
      files.tspActions.includes("connect-action-error"),
  ],
  [
    "inline confirmation includes a cancel action",
    files.importActions.includes("setConfirming(null)") &&
      files.tspActions.includes("setConfirming(false)"),
  ],
  [
    "confirmation and errors have dedicated visible styling",
    files.css.includes(".connect-action-confirmation") &&
      files.css.includes(".connect-action-error"),
  ],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  throw new Error(
    `V2.0.4 Import Action Reliability invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log(
  "V2.0.4 Import Action Reliability invariants passed."
);
