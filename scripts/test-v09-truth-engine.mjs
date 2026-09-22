import { readFile } from "node:fs/promises";

const files = {
  migration: await readFile("supabase/migrations/20260922190000_v09_truth_engine.sql", "utf8"),
  engine: await readFile("lib/truth-engine.ts", "utf8"),
  page: await readFile("app/data-health/page.tsx", "utf8"),
  money: await readFile("lib/money-data.ts", "utf8"),
};

const checks = [
  ["account identity schema", files.migration.includes("identity_key")],
  ["canonical account link", files.migration.includes("canonical_account_id")],
  ["transaction truth fingerprint", files.migration.includes("truth_fingerprint")],
  ["duplicate transaction link", files.migration.includes("duplicate_of_transaction_id")],
  ["transfer metadata", files.migration.includes("detected_transfer")],
  ["merchant normalizer", files.engine.includes("normalizeMerchant")],
  ["conservative cross-source dedupe", files.engine.includes("distinctSources.size < 2")],
  ["transfer hint requirement", files.engine.includes("if (!hinted) continue")],
  ["data health page", files.page.includes("Financial data health")],
  ["primary dataset excludes duplicates", files.money.includes('is("duplicate_of_transaction_id", null)')],
  ["cash-flow interprets detected transfers", files.money.includes("row.detected_transfer ? \"transfer\"")],
];

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(`V0.9 Truth Engine invariant failures: ${failed.map(([name]) => name).join(", ")}`);
}

console.log("V0.9 Truth Engine invariants passed.");
