import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

if (!process.execArgv.some((arg) => arg.includes("strip-types"))) {
  const rerun = spawnSync(
    process.execPath,
    ["--experimental-strip-types", ...process.argv.slice(1)],
    { stdio: "inherit" }
  );
  process.exit(rerun.status ?? 1);
}

const { parseTspStatement, TSP_STATEMENT_PARSER_VERSION } = await import(
  "../lib/tsp-statement-parser.ts"
);

const fixture = (name) =>
  readFile(path.join("fixtures", "tsp-statements", name), "utf8");

const checks = [];

function check(name, ok) {
  checks.push([name, Boolean(ok)]);
}

const valid = parseTspStatement(await fixture("valid.csv"), "valid.csv");
check("parser version is 1.8.0", valid.parserVersion === "1.8.0");
check("parser version export matches", TSP_STATEMENT_PARSER_VERSION === "1.8.0");
check("valid statement is ok", valid.ok && valid.confirmed === false);
check("valid date", valid.candidate.statementDate === "2026-09-15");
check("valid traditional+roth+total", valid.candidate.traditionalBalanceCents === 41200000 && valid.candidate.rothBalanceCents === 8800000 && valid.candidate.totalBalanceCents === 50000000);
check("valid funds include GFCSI", valid.candidate.funds.map((f) => f.fundCode).join("") === "GFCSI");
check("valid contributions and zero loan", valid.candidate.employeeContribYtdCents === 1225000 && valid.candidate.outstandingLoanCents === 0);
check("valid reconcilies", valid.reconciliation.traditionalRothVsTotalOk === true && valid.reconciliation.fundsVsTotalOk === true);

const partial = parseTspStatement(await fixture("partial.csv"));
check("partial remains unconfirmed and missing total is tolerated", partial.confirmed === false && partial.candidate.totalBalanceCents == null && partial.candidate.funds.length === 0);
check("partial has no reconcilation error without total", !partial.errors.some((e) => e.code.startsWith("reconciliation")));

const lifecycle = parseTspStatement(await fixture("lifecycle.csv"));
check("lifecycle fund parsed", lifecycle.ok && lifecycle.candidate.funds.some((f) => f.fundCode === "L2050" && f.balanceCents === 25000000));
check("mdy date normalized", lifecycle.candidate.statementDate === "2026-09-15");

const malformed = parseTspStatement(await fixture("malformed-numbers.csv"));
check("malformed numbers rejected", !malformed.ok && malformed.errors.some((e) => e.code === "malformed_number"));

const missingLoan = parseTspStatement(await fixture("missing-loan.csv"));
check("missing loan stays null", missingLoan.ok && missingLoan.candidate.outstandingLoanCents == null);

const missingContrib = parseTspStatement(await fixture("missing-contributions.csv"));
check("missing contributions stay null", missingContrib.ok && missingContrib.candidate.employeeContribYtdCents == null && missingContrib.candidate.serviceAutoYtdCents == null && missingContrib.candidate.serviceMatchYtdCents == null);

const mismatch = parseTspStatement(await fixture("reconciliation-mismatch.csv"));
check("reconciliation mismatch blocks ok", !mismatch.ok && mismatch.errors.some((e) => e.code === "reconciliation_traditional_roth") && mismatch.errors.some((e) => e.code === "reconciliation_funds"));
check("mismatch does not confirm", mismatch.confirmed === false);

const duplicate = parseTspStatement(await fixture("duplicate-fields.csv"));
check("duplicate conflicting fields error", !duplicate.ok && duplicate.errors.some((e) => e.code === "duplicate_field"));

const unknown = parseTspStatement(await fixture("unknown-fields.csv"));
check("unknown fields recorded and ignored", unknown.ok && unknown.unknownFields.includes("Favorite Color") && unknown.unknownFields.includes("Notes"));

const structured = parseTspStatement(await fixture("structured.txt"));
check("structured text source kind", structured.sourceKind === "structured_text" && structured.ok);

const structuredComma = parseTspStatement(
  "Traditional: $10,000.00\nRoth: $2,000.00",
  "statement.txt"
);
check(
  "txt source stays structured even when amounts contain commas",
  structuredComma.sourceKind === "structured_text" &&
    structuredComma.candidate.traditionalBalanceCents === 1000000
);

const quotedCsv = parseTspStatement(
  'field,value\nTraditional Balance,"$1,234.56"\nRoth Balance,"$200.00"',
  "statement.csv"
);
check(
  "quoted CSV amounts with thousands separators parse correctly",
  quotedCsv.sourceKind === "csv" &&
    quotedCsv.candidate.traditionalBalanceCents === 123456 &&
    quotedCsv.candidate.rothBalanceCents === 20000
);

const invalidDate = parseTspStatement(
  "Statement Date: 2026-02-31",
  "statement.txt"
);
check(
  "invalid calendar dates are rejected",
  invalidDate.errors.some((e) => e.code === "malformed_date")
);

const empty = parseTspStatement("   ");
check("empty source errors", !empty.ok && empty.errors.some((e) => e.code === "empty_source"));

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
  throw new Error(
    `V1.8 parser failures: ${failed.map(([name]) => name).join(", ")}`
  );
}

console.log("V1.8 TSP statement parser tests passed.");
