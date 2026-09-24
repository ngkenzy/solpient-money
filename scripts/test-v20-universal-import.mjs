
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
  parseUniversalFinancialFile,
  reconcileUniversalBundle,
} = await import("../lib/connect/universal-parser.ts");

const checks = [];

function check(name, ok) {
  checks.push([name, Boolean(ok)]);
}

const chaseChecking = [
  "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #",
  'DEBIT,09/23/2026,"Grok xAI",-30.00,MISC_DEBIT,16606.64,',
  'DEBIT,09/22/2026,"Payment to Chase card ending in 8587 09/22",-16.30,LOAN_PMT,16636.64,',
  'CREDIT,09/15/2026,"DFAS-IN ARMY ACT",3196.40,ACH_CREDIT,16652.94,',
].join("\n");

const chase = parseUniversalFinancialFile(
  "Chase4493_Activity_20260924.csv",
  chaseChecking
);

check(
  "Chase checking is detected with account identity",
  chase.sourceId === "chase-checking" &&
    chase.accountMask === "4493" &&
    chase.accountType === "cash" &&
    chase.datasets[0].parsed.closingBalance === 16606.64
);
check(
  "Chase card payment is a transfer",
  chase.datasets[0].parsed.transactions.some(
    (row) =>
      row.merchant.includes("card ending in 8587") &&
      row.type === "transfer"
  )
);

const chaseExpenseGuard = parseUniversalFinancialFile(
  "Chase4493_Activity_20260924.csv",
  [
    "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #",
    'DEBIT,09/23/2026,"Mortgage Payment",-2100.00,ACH_DEBIT,10000.00,',
    'DEBIT,09/22/2026,"PEPCO PAYMENTUS BILLPAY",-200.00,ACH_DEBIT,12100.00,',
  ].join("\n")
);
check(
  "ordinary mortgage and utility payments remain expenses",
  chaseExpenseGuard.datasets[0].parsed.transactions.every(
    (row) => row.type === "expense"
  )
);

const chaseCard = [
  "Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
  "09/22/2026,09/22/2026,Payment Thank You - Web,,Payment,16.30,",
  "09/22/2026,09/22/2026,Amazon.com*ABC,Shopping,Sale,-17.83,",
].join("\n");

const chaseCc = parseUniversalFinancialFile(
  "Chase8587_Activity_20260924.csv",
  chaseCard
);

check(
  "Chase credit card preserves activity-only balance semantics",
  chaseCc.sourceId === "chase-credit-card" &&
    chaseCc.accountMask === "8587" &&
    chaseCc.accountType === "debt" &&
    chaseCc.datasets[0].parsed.balanceMode === "preserve"
);

const boaChecking = [
  "Description,,Summary Amt.",
  'Beginning balance as of 08/08/2026,,"12,834.79"',
  'Total credits,,"193.11"',
  'Total debits,,"-3,100.85"',
  'Ending balance as of 09/08/2026,,"9,927.05"',
  "",
  "Date,Description,Amount,Running Bal.",
  '08/08/2026,Beginning balance as of 08/08/2026,,"12,834.79"',
  '08/12/2026,"Online Banking payment to CRD 5207 Confirmation# x","-279.92","12,554.87"',
  '09/08/2026,"Interest Earned","0.11","9,927.05"',
].join("\n");

const boa = parseUniversalFinancialFile("stmt.csv", boaChecking);

check(
  "Bank of America checking reads summary balance",
  boa.sourceId === "boa-checking" &&
    boa.datasets[0].parsed.openingBalance === 12834.79 &&
    boa.datasets[0].parsed.closingBalance === 9927.05 &&
    boa.linkedAccountMasks.includes("5207")
);

const boaCard = [
  "Posted Date,Reference Number,Payee,Address,Amount",
  '09/23/2026,24138296266303280204450,"AAFES GAS","KY",-43.65',
  '09/22/2026,26520401050045084635408,"PAYMENT FROM CHK 9618 CONF#x","",94.49',
].join("\n");

const boaCc = parseUniversalFinancialFile(
  "currentTransaction_5207.csv",
  boaCard
);

check(
  "Bank of America card has stable reference id and checking link",
  boaCc.sourceId === "boa-credit-card" &&
    boaCc.accountMask === "5207" &&
    boaCc.linkedAccountMasks.includes("9618") &&
    boaCc.datasets[0].parsed.transactions[0].externalId ===
      "24138296266303280204450"
);

const boaBundle = reconcileUniversalBundle([boa, boaCc]);
const inferredChecking = boaBundle.find(
  (item) => item.sourceId === "boa-checking"
);

check(
  "BofA checking account mask is inferred across uploaded files",
  inferredChecking?.accountMask === "9618"
);

const vanguard = [
  "Account Number,Investment Name,Symbol,Shares,Share Price,Total Value,",
  "35868141,VANGUARD TOTAL STOCK MARKET ETF,VTI,1.012,378.23,382.77,",
  "35868141,VANGUARD FEDERAL MONEY MARKET INVESTOR CL,VMFXX,100,1,100,",
  "",
  "",
  "",
  "Account Number,Trade Date,Settlement Date,Transaction Type,Transaction Description,Investment Name,Symbol,Shares,Share Price,Principal Amount,Commissions and Fees,Net Amount,Accrued Interest,Account Type,",
  "35868141,2026-01-30,2026-01-30,Dividend,Dividend Received,VANGUARD FEDERAL MONEY MARKET INVESTOR CL,VMFXX,0,0,10.42,0,10.42,0,CASH,",
  "35868141,2026-02-01,2026-02-01,Buy,Buy Security,PFIZER INC,PFE,1,28,-28,0,-28,0,CASH,",
].join("\n");

const vg = parseUniversalFinancialFile("OfxDownload.csv", vanguard);

check(
  "Vanguard splits holdings and activity",
  vg.sourceId === "vanguard-investment" &&
    vg.accountMask === "8141" &&
    vg.datasets.length === 2 &&
    vg.datasets[0].parsed.kind === "holdings" &&
    vg.datasets[0].parsed.snapshotMode === "replace" &&
    vg.datasets[1].parsed.kind === "transactions" &&
    vg.datasets[1].parsed.balanceMode === "preserve"
);
check(
  "Vanguard buy is not household spending and dividend is income",
  vg.datasets[1].parsed.transactions.some(
    (row) => row.merchant.includes("Buy Security") && row.type === "transfer"
  ) &&
    vg.datasets[1].parsed.transactions.some(
      (row) => row.merchant.includes("Dividend Received") && row.type === "income"
    )
);

const merrillHoldings = [
  '"COB Date","Security #","Symbol","CUSIP #","Security Description","Account Nickname","Account Registration","Account #","Quantity","Price ($)","Value ($)","Unrealized Gain/Loss ($)","Unrealized Gain/Loss (%)","Cumulative Investment Return ($)","Cumulative Investment Return (%)","Accrued Interest ($)"',
  '"9/23/2026","00380","ADBE","00724F101","ADOBE INC","--","Roth IRA-Edge","42X-49U23","254","240.69","61,135.26","(1,823.33)","(2.90)","--","--","--"',
  '"9/23/2026","977G3","IIAXX","55499U915","BANK OF AMERICA, NA RASP","--","Roth IRA-Edge","42X-49U23","157.71","1.00","157.71","--","--","--","--","--"',
].join("\n");

const merrillSummary = [
  '"COB Date","Account Nickname","Account Registration","Account #","Cash Balance ($)","Money Accounts ($)","Priced Investments ($)","Margin Balance ($)","Loan Balance ($)","Total Advance Value ($)","Revolving Line of Credit ($)","Term Loans ($)","Credit Available ($)","Net Value ($)",',
  '"09/23/2026","--","Roth IRA-Edge","42X-49U23","0.89","157.71","61,135.26","--","--","--","--","--","--","61,293.86",',
].join("\n");

const mh = parseUniversalFinancialFile(
  "Holdings_09232026.csv",
  merrillHoldings
);
const ms = parseUniversalFinancialFile(
  "PortfolioSummary_09232026.csv",
  merrillSummary
);
const merrillBundle = reconcileUniversalBundle([mh, ms]);
const mergedMerrill = merrillBundle.find(
  (item) => item.sourceId === "merrill-holdings"
);

check(
  "Merrill summary and holdings merge into one retirement account",
  mergedMerrill?.accountType === "retirement" &&
    mergedMerrill.datasets[0].parsed.closingBalance === 61293.86 &&
    mergedMerrill.datasets[0].parsed.holdings.some(
      (holding) =>
        holding.ticker === "MERRILL-CASH" &&
        holding.marketValue === 0.89
    )
);

const tsp = [
  '"Plan","Asset Class","Fund Name","Current Mix","Future Investments","Date Range","Opening Balance","Gains/Losses","Other Activity","Closing Balance","Units","Fund Price","Fund Return"',
  '"Thrift Savings Plan - Uniformed Services","Stocks","C Fund","100.0%","100.0%","January 1, 2026 - September 23, 2026","$100.00","$10.00","$0.00","$110.00","1.000000","$110.000000","10.00%"',
].join("\n");

const tspParsed = parseUniversalFinancialFile("tsp.csv", tsp);

check(
  "TSP is normalized as a replaceable retirement holding snapshot",
  tspParsed.sourceId === "tsp" &&
    tspParsed.accountType === "retirement" &&
    tspParsed.datasets[0].parsed.holdings[0].ticker === "TSP-C" &&
    tspParsed.datasets[0].parsed.universalMetadata?.tspStatement != null
);

const component = await readFile(
  "components/UniversalImportWorkbench.tsx",
  "utf8"
);
const connectPage = await readFile(
  "app/connect/page.tsx",
  "utf8"
);
const importRoute = await readFile(
  "app/api/connect/file-import/route.ts",
  "utf8"
);
const reconcileRoute = await readFile(
  "app/api/connect/reconcile/route.ts",
  "utf8"
);
const moneyData = await readFile(
  "lib/money-data.ts",
  "utf8"
);

check(
  "universal workbench supports multi-file import",
  component.includes("multiple") &&
    component.includes("Import all ") &&
    component.includes("reconcileUniversalBundle") &&
    connectPage.includes("UniversalImportWorkbench")
);
check(
  "activity-only imports preserve account balances",
  importRoute.includes('parsed.balanceMode === "preserve"') &&
    importRoute.includes("postImportBalance: currentBalance")
);
check(
  "holding snapshots remove stale file-based positions",
  importRoute.includes('parsed!.snapshotMode === "replace"') &&
    importRoute.includes("staleTickers")
);
check(
  "universal TSP import preserves dedicated TSP history",
  importRoute.includes("tsp_statement_imports") &&
    importRoute.includes("TSP_OFFICIAL_CSV_VERSION")
);
check(
  "batch import triggers Truth Engine reconciliation",
  reconcileRoute.includes("runTruthEngineForHousehold") &&
    component.includes('"/api/connect/reconcile"')
);
check(
  "partial multi-file failures trigger reverse-order rollback",
  component.includes("completedBatchIds") &&
    component.includes('"/api/connect/undo"') &&
    component.includes(".reverse()") &&
    component.includes("Rolling back completed batches")
);
check(
  "dashboard can consume full imported transaction history",
  moneyData.includes(".limit(5000)")
);

for (const [name, ok] of checks) {
  console.log((ok ? "✓" : "✗") + " " + name);
}

const failed = checks.filter(([, ok]) => !ok);

if (failed.length) {
  throw new Error(
    "V2.0 Universal Financial Import failures: " +
      failed.map(([name]) => name).join(", ")
  );
}

console.log(
  "V2.0 Universal Financial Import parser and integration invariants passed."
);
