
import { spawnSync } from "node:child_process";

if (!process.execArgv.some((arg) => arg.includes("strip-types"))) {
  const rerun = spawnSync(
    process.execPath,
    ["--experimental-strip-types", ...process.argv.slice(1)],
    { stdio: "inherit" }
  );
  process.exit(rerun.status ?? 1);
}

const { parseUniversalFinancialFile } = await import(
  "../lib/connect/universal-parser.ts"
);

const checks = [];

function check(name, ok) {
  checks.push([name, Boolean(ok)]);
}

const schwabActivity = [
  "Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount",
  '"09/20/2026","Buy","SCHB","SCHWAB US BROAD MARKET ETF","10","$105.50","$0","-$1,055.00"',
  '"09/18/2026","Sell","AAPL","APPLE INC","5","$232.10","$0","$1,160.50"',
  '"09/15/2026","Qualified Dividend","SCHB","SCHWAB US BROAD MARKET ETF","","","","$42.18"',
  '"09/10/2026","ADR Mgmt Fee","SCHB","SCHWAB US BROAD MARKET ETF","","","","-$5.00"',
  '"09/01/2026","MoneyLink Transfer","","Tfr BANK","","","","$10000.00"',
].join("\n");

const schwabPositions = [
  '"Positions for account Individual ...1234 as of 12:33 PM ET, 2026/09/25","",""',
  '"","",""',
  '"Symbol","Description","Qty (Quantity)","Price","Mkt Val (Market Value)","Cost Basis","Security Type"',
  '"SCHB","SCHWAB US BROAD MARKET ETF","100","$105.50","$10,550.00","9000.00","ETFs & Closed End Funds"',
  '"Account Total","","","","$10,550.00","",""',
].join("\n");

const fidelityActivity = [
  "Run Date,Account,Action,Symbol,Security Description,Security Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date",
  "09/20/2026,X12345678,YOU BOUGHT,VOO,VANGUARD S&P 500 ETF,ETF,10,512.30,--,--,--,-5123.00,09/22/2026",
  "09/15/2026,X12345678,DIVIDEND RECEIVED,VOO,VANGUARD S&P 500 ETF,ETF,--,--,--,--,--,38.42,09/15/2026",
  "-- END OF FILE --",
].join("\n");

const fidelityPositions = [
  "Account,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Per Share,Total Cost Basis",
  'X12345678,VOO,VANGUARD S&P 500 ETF,50,512.30,"25,615.00",480.00,"24,000.00"',
].join("\n");

const schwabTx = parseUniversalFinancialFile("history.csv", schwabActivity);
check("schwab activity detected", schwabTx.provider === "Schwab" && schwabTx.sourceId === "schwab-activity");
const schwabTxRows = schwabTx.datasets[0].parsed.transactions;
check("schwab activity parses 5 rows", schwabTxRows.length === 5);
check(
  "schwab buy is a negative transfer",
  schwabTxRows[0].type === "transfer" && schwabTxRows[0].amount === -1055
);
check(
  "schwab sell is a positive transfer",
  schwabTxRows[1].type === "transfer" && schwabTxRows[1].amount === 1160.5
);
check(
  "schwab dividend is income",
  schwabTxRows[2].type === "income" && schwabTxRows[2].category === "Investment Income"
);
check(
  "schwab ADR fee is an expense",
  schwabTxRows[3].type === "expense" && schwabTxRows[3].amount === -5
);

const schwabPos = parseUniversalFinancialFile("positions.csv", schwabPositions);
check("schwab positions detected", schwabPos.provider === "Schwab" && schwabPos.sourceId === "schwab-positions");
check("schwab title-row mask extracted", schwabPos.accountMask === "1234");
const schwabHoldings = schwabPos.datasets[0].parsed.holdings;
check("schwab positions skip the totals row", schwabHoldings.length === 1);
check(
  "schwab holding carries shares, price, value, basis",
  schwabHoldings[0].ticker === "SCHB" &&
    schwabHoldings[0].shares === 100 &&
    schwabHoldings[0].price === 105.5 &&
    schwabHoldings[0].marketValue === 10550 &&
    schwabHoldings[0].costBasis === 9000
);

const fidelityTx = parseUniversalFinancialFile("history.csv", fidelityActivity);
check("fidelity activity detected", fidelityTx.provider === "Fidelity" && fidelityTx.sourceId === "fidelity-activity");
check("fidelity account mask from Account column", fidelityTx.accountMask === "5678");
const fidelityTxRows = fidelityTx.datasets[0].parsed.transactions;
check("fidelity trailer row skipped", fidelityTxRows.length === 2);
check(
  "fidelity buy is a negative transfer",
  fidelityTxRows[0].type === "transfer" && fidelityTxRows[0].amount === -5123
);
check(
  "fidelity dividend is income",
  fidelityTxRows[1].type === "income" && fidelityTxRows[1].amount === 38.42
);

const fidelityPos = parseUniversalFinancialFile("positions.csv", fidelityPositions);
check("fidelity positions detected", fidelityPos.provider === "Fidelity" && fidelityPos.sourceId === "fidelity-positions");
const fidelityHoldings = fidelityPos.datasets[0].parsed.holdings;
check("fidelity positions parse one holding", fidelityHoldings.length === 1);
check(
  "fidelity holding carries value and basis",
  fidelityHoldings[0].ticker === "VOO" &&
    fidelityHoldings[0].marketValue === 25615 &&
    fidelityHoldings[0].costBasis === 24000
);

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error("test:v209 FAILED:\n" + failures.map((n) => ` - ${n}`).join("\n"));
  process.exit(1);
}
console.log(`test:v209 passed (${checks.length} checks): Schwab and Fidelity CSV auto-detection works.`);
