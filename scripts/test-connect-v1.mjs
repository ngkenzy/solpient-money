import assert from "node:assert/strict";
import { parseFinancialFile } from "../lib/connect/file-parser.ts";

const bankCsv = `Date,Description,Debit,Credit,Balance
09/20/2026,"Kroger, Store 112",84.22,,4281.16
09/19/2026,Payroll,,5250.00,4365.38`;

const bank = parseFinancialFile("chase.csv", bankCsv);
assert.equal(bank.kind, "transactions");
assert.equal(bank.transactions.length, 2);
assert.equal(bank.transactions[0].merchant, "Kroger, Store 112");
assert.equal(bank.transactions[0].amount, -84.22);
assert.equal(bank.transactions[1].amount, 5250);
assert.equal(bank.closingBalance, 4365.38);

const holdingsCsv = `Symbol,Security Name,Quantity,Price,Market Value,Cost Basis,Security Type
ADBE,Adobe Inc,10,320,3200,2800,Stock
VTI,Vanguard Total Stock Market ETF,5,300,1500,1300,ETF`;

const portfolio = parseFinancialFile("fidelity.csv", holdingsCsv);
assert.equal(portfolio.kind, "holdings");
assert.equal(portfolio.holdings.length, 2);
assert.equal(portfolio.holdings[0].ticker, "ADBE");
assert.equal(portfolio.holdings[1].kind, "etf");
assert.equal(portfolio.closingBalance, 4700);

const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>First Bank</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>123</BANKID><ACCTID>987654321</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260920120000[-5:EST]</DTPOSTED><TRNAMT>-45.50</TRNAMT><FITID>abc123</FITID><NAME>GROCERY</NAME></STMTTRN>
<STMTTRN><TRNTYPE>DIRECTDEP</TRNTYPE><DTPOSTED>20260919120000[-5:EST]</DTPOSTED><TRNAMT>2500</TRNAMT><FITID>abc124</FITID><NAME>PAYROLL</NAME></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>5000.25</BALAMT></LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const bankOfx = parseFinancialFile("statement.ofx", ofx);
assert.equal(bankOfx.format, "ofx");
assert.equal(bankOfx.kind, "transactions");
assert.equal(bankOfx.transactions.length, 2);
assert.equal(bankOfx.transactions[0].postedAt, "2026-09-20");
assert.equal(bankOfx.accountMask, "4321");
assert.equal(bankOfx.closingBalance, 5000.25);

const qfx = `<OFX>
<INVSTMTMSGSRSV1><INVSTMTTRNRS><INVSTMTRS>
<INVACCTFROM><BROKERID>Demo Broker</BROKERID><ACCTID>12345678</ACCTID></INVACCTFROM>
<INVPOSLIST>
<POSSTOCK><INVPOS><SECID><UNIQUEID>SEC1</UNIQUEID></SECID><UNITS>4</UNITS><UNITPRICE>100</UNITPRICE><MKTVAL>400</MKTVAL></INVPOS></POSSTOCK>
</INVPOSLIST>
<SECLIST><STOCKINFO><SECINFO><SECID><UNIQUEID>SEC1</UNIQUEID></SECID><SECNAME>Example Co</SECNAME><TICKER>EXM</TICKER></SECINFO></STOCKINFO></SECLIST>
</INVSTMTRS></INVSTMTTRNRS></INVSTMTMSGSRSV1>
</OFX>`;

const investments = parseFinancialFile("positions.qfx", qfx);
assert.equal(investments.format, "qfx");
assert.equal(investments.kind, "holdings");
assert.equal(investments.holdings[0].ticker, "EXM");
assert.equal(investments.holdings[0].marketValue, 400);

console.log("Solpient Connect V1 parser checks passed.");
