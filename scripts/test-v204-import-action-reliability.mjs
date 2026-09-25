import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  buildYml: await readFile(
    ".github/workflows/build.yml",
    "utf8"
  ),
  confirm: await readFile(
    "components/ImportActionConfirm.tsx",
    "utf8"
  ),
  historyActions: await readFile(
    "components/ImportHistoryActions.tsx",
    "utf8"
  ),
  undoButton: await readFile(
    "components/UndoImportButton.tsx",
    "utf8"
  ),
  tspDelete: await readFile(
    "components/DeleteTspImportButton.tsx",
    "utf8"
  ),
  ofxActions: await readFile(
    "components/DirectOfxConnectionActions.tsx",
    "utf8"
  ),
  tspDeleteRoute: await readFile(
    "app/api/tsp/delete-import/route.ts",
    "utf8"
  ),
  undoRoute: await readFile(
    "app/api/connect/undo/route.ts",
    "utf8"
  ),
  forceDeleteRoute: await readFile(
    "app/api/connect/force-delete-import/route.ts",
    "utf8"
  ),
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

const actionComponents = [
  ["ImportHistoryActions", files.historyActions],
  ["UndoImportButton", files.undoButton],
  ["DeleteTspImportButton", files.tspDelete],
  ["DirectOfxConnectionActions", files.ofxActions],
  ["ImportActionConfirm", files.confirm],
];

const noConfirm = actionComponents.every(
  ([, source]) => !source.includes("window.confirm")
);

const twoClickPattern = actionComponents
  .filter(([name]) => name !== "ImportActionConfirm")
  .every(
    ([, source]) =>
      /setArmed|setDisconnectArmed/.test(source) &&
      source.includes("Cancel") &&
      source.includes("onCancel")
  );

const alertUsage = [
  files.historyActions,
  files.undoButton,
  files.tspDelete,
  files.ofxActions,
].every(
  (source) =>
    source.includes("ImportActionAlert") &&
    source.includes("<ImportActionAlert")
);

const checks = [
  [
    "release includes V2.0.4 or newer",
    atLeast204(pkg.version),
  ],
  [
    "no window.confirm in import action components",
    noConfirm,
  ],
  [
    "two-click arm/confirm pattern in all import actions",
    twoClickPattern,
  ],
  [
    "Cancel offered for every armed action",
    twoClickPattern,
  ],
  [
    "shared ImportActionConfirm panel used everywhere",
    [
      files.historyActions,
      files.undoButton,
      files.tspDelete,
      files.ofxActions,
    ].every((source) =>
      source.includes("<ImportActionConfirm")
    ),
  ],
  [
    "ImportActionAlert renders role=alert",
    files.confirm.includes('role="alert"'),
  ],
  [
    "API failures render as prominent alerts, not tiny text",
    alertUsage,
  ],
  [
    "undo backend still posts rollback behavior",
    files.undoRoute.includes("export async function POST"),
  ],
  [
    "force-delete backend still purges import rows",
    files.forceDeleteRoute.includes(
      'export async function POST'
    ) && files.forceDeleteRoute.includes(".delete()"),
  ],
  [
    "history delete keeps undo-fallback for requiresUndo",
    files.historyActions.includes("requiresUndo"),
  ],
  [
    "TSP delete handles statement imports (non-official parser)",
    files.tspDeleteRoute.includes(
      "TSP_OFFICIAL_CSV_VERSION"
    ) &&
      files.tspDeleteRoute.includes(
        "deleteConfirmedSnapshot"
      ),
  ],
  [
    "TSP statement delete removes snapshot without touching holdings",
    files.tspDeleteRoute.includes(
      "liveDataChanged: false"
    ),
  ],
  [
    "test:v204 registered in package.json",
    pkg.scripts?.["test:v204"] ===
      "node scripts/test-v204-import-action-reliability.mjs",
  ],
  [
    "test:v204 in release verification path",
    String(pkg.scripts?.["local:verify-release"] ?? "").includes(
      "test:v204"
    ),
  ],
  [
    "test:v204 in CI build workflow",
    files.buildYml.includes("test:v204"),
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
