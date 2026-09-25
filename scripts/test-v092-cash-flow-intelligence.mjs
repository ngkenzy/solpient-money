import { readFile } from "node:fs/promises";

const files = {
  engine: await readFile("lib/cash-flow-intelligence.ts", "utf8"),
  page: await readFile("app/cash-flow/page.tsx", "utf8"),
  money: await readFile("lib/money-data.ts", "utf8"),
};

const checks = [
  ["cash-flow intelligence engine exists", files.engine.includes("getCashFlowIntelligence")],
  ["duplicate rows excluded", files.engine.includes("row.duplicate_of_transaction_id || row.detected_transfer")],
  ["transfers excluded", files.engine.includes("row.detected_transfer")],
  ["12 month monthly model", files.engine.includes(".slice(-12)")],
  ["savings rate calculation", files.engine.includes("savingsRate")],
  ["recurring cadence detection", files.engine.includes("cadenceFromGap")],
  ["short cadence requires stronger evidence", files.engine.includes('group.length < 3')],
  ["subscription detection", files.engine.includes('kind:') && files.engine.includes('"subscription"')],
  ["category history comparison", files.engine.includes("priorAverage")],
  ["merchant anomaly detection", files.engine.includes("historicalByMerchant")],
  ["income stability metric", files.engine.includes("incomeStability")],
  ["cash-flow intelligence page", files.page.includes("CASH FLOW")],
  ["recurring money surface", files.page.includes("RECURRING MONEY")],
  ["spending watch surface", files.page.includes("SPENDING WATCH")],
  ["existing reconciled Money layer remains active", files.money.includes('is("duplicate_of_transaction_id", null)')],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V0.9.2 Cash-Flow Intelligence invariant failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log("V0.9.2 Cash-Flow Intelligence invariants passed.");
