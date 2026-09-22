import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  inspectFinancialFile,
  parseFinancialFile,
} from "../lib/connect/file-parser.ts";
import { analyzeConnectImport } from "../lib/connect/reconciliation.ts";

const weirdCsv = `When,What,Money Out,Money In,After
09/20/2026,Coffee,5.25,,994.75
09/21/2026,Payroll,,1000,1994.75`;

const inspection = inspectFinancialFile("bank-export.csv", weirdCsv);
assert.equal(inspection.format, "csv");
assert.equal(inspection.headers.length, 5);
assert.match(inspection.formatSignature, /^csv-[a-f0-9]{16}$/);

assert.throws(
  () => parseFinancialFile("bank-export.csv", weirdCsv),
  /Could not detect/
);

const mapped = parseFinancialFile("bank-export.csv", weirdCsv, {
  kind: "transactions",
  date: "When",
  merchant: "What",
  debit: "Money Out",
  credit: "Money In",
  balance: "After",
});

assert.equal(mapped.transactions.length, 2);
assert.equal(mapped.transactions[0].amount, -5.25);
assert.equal(mapped.transactions[1].amount, 1000);
assert.equal(mapped.openingBalance, 1000);
assert.equal(mapped.closingBalance, 1994.75);
assert.equal(mapped.columnMapping.date, "When");

const remembered = parseFinancialFile(
  "bank-export.csv",
  weirdCsv,
  mapped.columnMapping
);
assert.deepEqual(remembered.transactions, mapped.transactions);

const matched = analyzeConnectImport({
  parsed: mapped,
  currentBalance: 1000,
  targetExists: true,
  newTransactionNet: 994.75,
  duplicateCount: 0,
  totalRecords: 2,
  today: "2026-09-22",
});
assert.equal(matched.reconciliationStatus, "matched");
assert.equal(matched.reconciliationDelta, 0);
assert.equal(matched.postImportBalance, 1994.75);
assert.equal(matched.anomalies.length, 0);

const mismatch = analyzeConnectImport({
  parsed: { ...mapped, closingBalance: 5000 },
  currentBalance: 1000,
  targetExists: true,
  newTransactionNet: 994.75,
  duplicateCount: 1,
  totalRecords: 2,
  today: "2026-09-22",
});
assert.equal(mismatch.reconciliationStatus, "attention");
assert.ok(
  mismatch.anomalies.some(
    (anomaly) => anomaly.code === "reconciliation_gap"
  )
);
assert.ok(
  mismatch.anomalies.some(
    (anomaly) => anomaly.code === "large_balance_jump"
  )
);
assert.ok(
  mismatch.anomalies.some(
    (anomaly) => anomaly.code === "high_duplicate_ratio"
  )
);

const future = analyzeConnectImport({
  parsed: {
    ...mapped,
    transactions: [
      ...mapped.transactions,
      {
        postedAt: "2026-09-25",
        merchant: "Future row",
        category: "Other",
        amount: -1,
        type: "expense",
      },
    ],
  },
  currentBalance: 1000,
  targetExists: true,
  newTransactionNet: 993.75,
  duplicateCount: 0,
  totalRecords: 3,
  today: "2026-09-22",
});
assert.ok(
  future.anomalies.some(
    (anomaly) => anomaly.code === "future_dated_rows"
  )
);

const migration = await readFile(
  "supabase/migrations/20260922114340_connect_v11_reconciliation_profiles.sql",
  "utf8"
);
const undoRoute = await readFile(
  "app/api/connect/undo/route.ts",
  "utf8"
);
const importRoute = await readFile(
  "app/api/connect/file-import/route.ts",
  "utf8"
);

assert.ok(
  migration.includes(
    "alter table public.file_import_profiles enable row level security"
  )
);
assert.ok(
  migration.includes("file_import_profiles_household_access")
);
assert.ok(
  migration.includes("rollback_payload jsonb")
);
assert.ok(
  migration.includes("last_file_import_at")
);
assert.ok(
  undoRoute.includes(
    "Undo the newer import"
  )
);
assert.ok(
  undoRoute.includes('status: "undone"')
);
assert.ok(
  importRoute.includes("priorHoldings")
);
assert.ok(
  importRoute.includes("rememberFormat")
);
assert.ok(
  importRoute.includes("analyzeConnectImport")
);

console.log("Solpient Connect V1.1 reconciliation and rollback checks passed.");
