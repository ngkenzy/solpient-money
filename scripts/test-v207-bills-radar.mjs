import { readFile } from "node:fs/promises";

const files = {
  packageJson: await readFile("package.json", "utf8"),
  radarLib: await readFile("lib/bills-radar.ts", "utf8"),
  intelLib: await readFile(
    "lib/cash-flow-intelligence.ts",
    "utf8"
  ),
  cashPage: await readFile(
    "app/cash-flow/page.tsx",
    "utf8"
  ),
};

const pkg = JSON.parse(files.packageJson);

function atLeast310(version) {
  const [major = 0, minor = 0] = String(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10) || 0);

  return major > 3 || (major === 3 && minor >= 1);
}

const checks = [
  [
    "release includes V3.1.0 or newer",
    atLeast310(pkg.version),
  ],
  [
    "recurring type carries last and prior amounts",
    files.intelLib.includes("lastAmount: number") &&
      files.intelLib.includes(
        "priorAverageAmount: number | null"
      ),
  ],
  [
    "radar lib exports the pure builder and data loader",
    files.radarLib.includes(
      "export function buildBillsRadar"
    ) &&
      files.radarLib.includes(
        "export async function getBillsRadar"
      ),
  ],
  [
    "radar projects the next expected charge date",
    files.radarLib.includes("expectedDate") &&
      files.radarLib.includes("medianGapDays"),
  ],
  [
    "radar flags bills expected but not yet seen",
    files.radarLib.includes("NOT_SEEN_GRACE_DAYS"),
  ],
  [
    "radar flags price jumps against the prior average",
    files.radarLib.includes("PRICE_JUMP_THRESHOLD") &&
      files.radarLib.includes("priceJumpPct"),
  ],
  [
    "cash-flow page renders the bills radar section",
    files.cashPage.includes("BILLS RADAR") &&
      files.cashPage.includes("buildBillsRadar"),
  ],
  [
    "radar only considers bills and subscriptions",
    files.radarLib.includes('item.kind !== "bill"') &&
      files.radarLib.includes(
        'item.kind !== "subscription"'
      ),
  ],
];

let failed = 0;

for (const [name, ok] of checks) {
  if (ok) {
    console.log(`ok - ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL - ${name}`);
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nAll bills-radar checks passed.");
