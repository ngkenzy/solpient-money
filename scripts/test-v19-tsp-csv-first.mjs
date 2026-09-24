import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

if (!process.execArgv.some((arg) => arg.includes("strip-types"))) {
  const rerun = spawnSync(
    process.execPath,
    ["--experimental-strip-types", ...process.argv.slice(1)],
    { stdio: "inherit" }
  );
  process.exit(rerun.status ?? 1);
}

const {
  parseOfficialTspCsv,
  TSP_OFFICIAL_CSV_VERSION,
} = await import("../lib/tsp-official-csv.ts");

const actions = await readFile("app/tsp/actions.ts", "utf8");
const page = await readFile("app/tsp/page.tsx", "utf8");
const finance = await readFile("lib/finance.ts", "utf8");
const moneyData = await readFile("lib/money-data.ts", "utf8");

const csv = [
  '"Plan","Asset Class","Fund Name","Current Mix","Future Investments","Date Range","Opening Balance","Gains/Losses","Other Activity","Closing Balance","Units","Fund Price","Fund Return"',
  '"Thrift Savings Plan - Uniformed Services","Cash","G Fund","25.0%","0.0%","January 1, 2026 - September 23, 2026","$1,000.00","$10.00","-$100.00","$910.00","91.000000","$10.000000","1.00%"',
  '"Thrift Savings Plan - Uniformed Services","Stocks","C Fund","75.0%","100.0%","January 1, 2026 - September 23, 2026","$2,000.00","$200.00","$400.00","$2,600.00","20.000000","$130.000000","10.00%"',
].join("\n");

const parsed = parseOfficialTspCsv(csv);
const checks = [];

function check(name, ok) {
  checks.push([name, Boolean(ok)]);
}

check(
  "official TSP parser version is stable",
  TSP_OFFICIAL_CSV_VERSION === "tsp-official-csv-v1"
);
check(
  "official plan and date range parse",
  parsed.plan === "Thrift Savings Plan - Uniformed Services" &&
    parsed.periodStart === "2026-01-01" &&
    parsed.periodEnd === "2026-09-23"
);
check(
  "fund rows preserve mix, units, price, and return",
  parsed.funds.length === 2 &&
    parsed.funds[0].fundCode === "G" &&
    parsed.funds[0].currentMixPct === 25 &&
    parsed.funds[1].fundCode === "C" &&
    parsed.funds[1].futureInvestmentsPct === 100 &&
    parsed.funds[1].units === 20 &&
    parsed.funds[1].fundPrice === 130 &&
    parsed.funds[1].fundReturnPct === 10
);

const precisionCsv = csv.replace(
  '"$10.000000"',
  '"$20.237200"'
);
const precisionParsed = parseOfficialTspCsv(
  precisionCsv
);
check(
  "TSP fund prices preserve six-decimal precision",
  precisionParsed.funds[0].fundPrice === 20.2372
);
check(
  "negative TSP currency written as -$amount parses correctly",
  parsed.funds[0].otherActivity === -100
);
check(
  "statement totals reconcile",
  parsed.totals.openingBalance === 3000 &&
    parsed.totals.gainsLosses === 210 &&
    parsed.totals.otherActivity === 300 &&
    parsed.totals.closingBalance === 3510 &&
    parsed.totals.currentMixPct === 100 &&
    parsed.totals.futureInvestmentsPct === 100 &&
    parsed.warnings.length === 0
);

let malformedRejected = false;
try {
  parseOfficialTspCsv('"Plan","Fund Name"\n"TSP","G Fund"');
} catch {
  malformedRejected = true;
}
check("unsupported CSV format is rejected", malformedRejected);

const mismatch = parseOfficialTspCsv(
  csv.replace('"$910.00"', '"$900.00"')
);
check(
  "accounting mismatch becomes a warning",
  mismatch.warnings.some((warning) =>
    warning.includes("does not reconcile")
  )
);

check(
  "CSV import updates one retirement account",
  actions.includes('.from("accounts")') &&
    actions.includes('account_type: "retirement"') &&
    actions.includes("balance_cents") &&
    actions.includes('"Thrift Savings Plan"')
);
check(
  "CSV import updates fund holdings for Investments",
  actions.includes('.from("holdings")') &&
    actions.includes("market_value_cents") &&
    actions.includes("TSP-${fund.fundCode}") &&
    actions.includes('"household_id,account_id,ticker"')
);
check(
  "CSV import retains parsed statement provenance without raw file storage",
  actions.includes('.from("tsp_statement_imports")') &&
    actions.includes("parsed_candidate: statement") &&
    !actions.includes("source_text:") &&
    !actions.includes("source_bytes:")
);
check(
  "TSP parser warning/error columns receive JSON arrays",
  actions.includes("parser_errors: JSON.stringify([])") &&
    actions.includes("parser_warnings:") &&
    actions.includes("JSON.stringify(")
);
check(
  "TSP page is CSV-first and links to portfolio and accounts",
  page.includes("TSP CSV IMPORT") &&
    page.includes('href="/portfolio"') &&
    page.includes('href="/"') &&
    page.includes("also appears under Accounts") &&
    page.includes("Everything in the imported fund rows")
);
check(
  "Net Worth is driven by accounts and Investments by holdings",
  finance.includes("const assets = accounts.filter") &&
    finance.includes("const netWorth = assets - liabilities") &&
    finance.includes("const investments = holdings.reduce") &&
    moneyData.includes('.from("accounts")') &&
    moneyData.includes('.from("holdings")')
);

for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

const failed = checks.filter(([, ok]) => !ok);

if (failed.length) {
  throw new Error(
    `V1.9 TSP CSV-first failures: ${failed
      .map(([name]) => name)
      .join(", ")}`
  );
}

console.log(
  "V1.9 TSP CSV-first parser and integration invariants passed."
);
