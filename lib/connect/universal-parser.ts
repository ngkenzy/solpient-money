import {
  parseFinancialFile,
  type ParsedFinancialFile,
  type ParsedHolding,
  type ParsedTransaction,
} from "@/lib/connect/file-parser";
import { parseOfficialTspCsv } from "@/lib/tsp-official-csv";

export type UniversalProvider =
  | "Chase"
  | "Bank of America"
  | "Vanguard"
  | "Merrill Edge"
  | "Thrift Savings Plan"
  | "Unknown";

export type UniversalSourceId =
  | "chase-checking"
  | "chase-credit-card"
  | "boa-checking"
  | "boa-credit-card"
  | "vanguard-investment"
  | "merrill-holdings"
  | "merrill-summary"
  | "tsp"
  | "generic";

export type UniversalCompanion = {
  kind: "account_summary";
  accountKey: string;
  accountName: string;
  institution: string;
  accountType: "investment" | "retirement";
  accountMask: string;
  statementDate: string;
  netValue: number;
  cashBalance: number;
  moneyAccounts: number;
  pricedInvestments: number;
};

export type UniversalDataset = {
  id: string;
  sourceId: UniversalSourceId;
  sourceLabel: string;
  accountKey: string;
  confidence: number;
  parsed: ParsedFinancialFile;
};

export type UniversalFileResult = {
  fileName: string;
  sourceId: UniversalSourceId;
  provider: UniversalProvider;
  confidence: number;
  accountKey: string;
  accountName: string;
  accountMask: string;
  accountType: "cash" | "investment" | "retirement" | "debt";
  datasets: UniversalDataset[];
  companion?: UniversalCompanion;
  notes: string[];
  linkedAccountMasks: string[];
};

type CsvRow = string[];

function csvRows(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }

  if (field.length || row.length) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  return rows;
}

function headerMap(row: CsvRow) {
  return new Map(
    row.map((header, index) => [
      header.toLowerCase().replace(/[^a-z0-9]/g, ""),
      index,
    ])
  );
}

function cell(
  row: CsvRow,
  headers: Map<string, number>,
  name: string
) {
  const index = headers.get(
    name.toLowerCase().replace(/[^a-z0-9]/g, "")
  );
  return index == null ? "" : String(row[index] ?? "").trim();
}

function money(raw: string) {
  let value = String(raw ?? "").trim();
  if (!value || value === "--") return 0;

  let negative = false;
  if (value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1);
  }

  value = value.trim();
  if (value.startsWith("-")) {
    negative = !negative;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }

  value = value.trim().replace(/^\$/, "").replace(/,/g, "");
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -Math.abs(parsed) : parsed;
}

function numberValue(raw: string) {
  const parsed = Number(
    String(raw ?? "").replace(/,/g, "").trim()
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(raw: string) {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }

  return "";
}

function filenameDigits(fileName: string) {
  const match = fileName.match(/(?:_|^|[^0-9])(\d{4})(?:_|\.|[^0-9]|$)/);
  return match?.[1] ?? "";
}

function normalizeTicker(
  symbol: string,
  description = "",
  cusip = ""
) {
  const ticker = symbol.trim().toUpperCase();
  const desc = description.toUpperCase();

  if (
    ticker === "BRK B" ||
    ticker === "BRKB" ||
    (cusip === "084670702" && desc.includes("BERKSHIRE"))
  ) {
    return "BRK.B";
  }

  if (ticker) return ticker.replace(/\s+/g, ".");
  if (cusip) return `CUSIP-${cusip.toUpperCase()}`;
  return "UNKNOWN";
}

function accountKey(
  provider: UniversalProvider,
  type: string,
  mask: string,
  fallback: string
) {
  const normalizedProvider = provider
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-");
  return [
    normalizedProvider,
    type,
    mask || fallback.toLowerCase().replace(/[^a-z0-9]/g, "-"),
  ].join("|");
}

function transactionType(
  amount: number,
  description: string,
  explicitType = ""
): ParsedTransaction["type"] {
  const text = `${explicitType} ${description}`.toLowerCase();

  if (
    /\b(payment|pmt|transfer|xfer|sweep|buy|sell|reinvest|funds received|withdrawal|brokerage|investment)\b/.test(
      text
    )
  ) {
    return "transfer";
  }

  return amount >= 0 ? "income" : "expense";
}

function smartCategory(
  description: string,
  explicit = ""
) {
  if (explicit.trim()) return explicit.trim();

  const text = description.toLowerCase();

  if (/payment|\bpmt\b|transfer|xfer|sweep|vanguard buy|investment/.test(text)) {
    return "Transfer";
  }
  if (/dfas.*army act|payroll|salary|direct dep/.test(text)) {
    return "Income";
  }
  if (/interest/.test(text)) return "Interest";
  if (/mort|mortgage/.test(text)) return "Housing";
  if (/pepco|washington gas|electric|utility/.test(text)) return "Utilities";
  if (/commissary|supercenter|walmart|market|grocery/.test(text)) return "Groceries";
  if (/gas pump|fuel|shell|exxon|bp /.test(text)) return "Transportation";
  if (/amazon|temu|shopping/.test(text)) return "Shopping";
  if (/orthodont|dental|medical|pharmacy/.test(text)) return "Health";
  if (/restaurant|cafe|coffee|cantigny/.test(text)) return "Dining";

  return "Uncategorized";
}

function cashHoldingKind(
  ticker: string,
  name: string
): ParsedHolding["kind"] {
  const text = `${ticker} ${name}`.toLowerCase();
  if (
    /money market|settlement fund|cash/.test(text) ||
    ["VMFXX", "IIAXX", "CASH"].includes(ticker.toUpperCase())
  ) {
    return "cash";
  }
  if (/bond|fixed income/.test(text)) return "bond";
  if (/etf|fund|index/.test(text)) return "etf";
  return "stock";
}

function investmentSector(
  ticker: string,
  name: string
) {
  const code = ticker.toUpperCase();
  const text = name.toLowerCase();
  if (["VXUS", "TSP-I"].includes(code) || /international|intl/.test(text)) {
    return "International";
  }
  if (["VMFXX", "IIAXX", "CASH", "TSP-G"].includes(code) || /money market|cash/.test(text)) {
    return "Cash";
  }
  if (code === "TSP-F" || /bond|fixed income/.test(text)) return "Bonds";
  if (/total stock|s&p|dividend equity|small cap|common stock/.test(text)) {
    return "U.S. Equities";
  }
  return "Other";
}

function makeParsed({
  kind,
  institution,
  accountName,
  accountMask,
  accountType,
  transactions = [],
  holdings = [],
  openingBalance,
  closingBalance,
  balanceMode,
  snapshotMode,
  warnings = [],
}: {
  kind: "transactions" | "holdings";
  institution: string;
  accountName: string;
  accountMask: string;
  accountType: "cash" | "investment" | "retirement" | "debt";
  transactions?: ParsedTransaction[];
  holdings?: ParsedHolding[];
  openingBalance?: number;
  closingBalance?: number;
  balanceMode?: "statement" | "preserve" | "holdings";
  snapshotMode?: "replace" | "merge";
  warnings?: string[];
}): ParsedFinancialFile {
  return {
    format: "csv",
    formatSignature: "",
    csvHeaders: [],
    columnMapping: {},
    kind,
    institutionGuess: institution,
    accountName,
    accountMask,
    accountType,
    openingBalance,
    closingBalance,
    transactions,
    holdings,
    warnings,
    balanceMode,
    snapshotMode,
  };
}

function parseChaseChecking(fileName: string, text: string): UniversalFileResult {
  const rows = csvRows(text);
  const headers = headerMap(rows[0] ?? []);
  const mask = filenameDigits(fileName);
  const transactions: ParsedTransaction[] = [];
  const balances: Array<{ date: string; balance: number; amount: number }> = [];

  for (const row of rows.slice(1)) {
    const postedAt = isoDate(cell(row, headers, "Posting Date"));
    const merchant = cell(row, headers, "Description");
    if (!postedAt || !merchant) continue;

    const amount = money(cell(row, headers, "Amount"));
    const explicitType = cell(row, headers, "Type");
    const balanceRaw = cell(row, headers, "Balance");
    const balance = balanceRaw ? money(balanceRaw) : null;

    transactions.push({
      postedAt,
      merchant,
      category: smartCategory(merchant),
      amount,
      type: transactionType(amount, merchant, explicitType),
    });

    if (balance != null) {
      balances.push({ date: postedAt, balance, amount });
    }
  }

  const ordered = [...balances].sort((a, b) => a.date.localeCompare(b.date));
  const earliest = ordered[0];
  const latest = ordered.at(-1);
  const name = mask ? `Chase Checking ••••${mask}` : "Chase Checking";
  const key = accountKey("Chase", "cash", mask, name);
  const parsed = makeParsed({
    kind: "transactions",
    institution: "Chase",
    accountName: name,
    accountMask: mask,
    accountType: "cash",
    transactions,
    openingBalance: earliest ? earliest.balance - earliest.amount : undefined,
    closingBalance: latest?.balance,
    balanceMode: "statement",
  });

  return {
    fileName,
    sourceId: "chase-checking",
    provider: "Chase",
    confidence: 0.99,
    accountKey: key,
    accountName: name,
    accountMask: mask,
    accountType: "cash",
    datasets: [{
      id: `${key}:transactions`,
      sourceId: "chase-checking",
      sourceLabel: "Chase checking activity",
      accountKey: key,
      confidence: 0.99,
      parsed,
    }],
    notes: ["Running balance detected; latest balance will update the checking account."],
    linkedAccountMasks: Array.from(
      new Set(
        transactions
          .map((transaction) =>
            transaction.merchant.match(/card ending in\s+(\d{4})/i)?.[1] ?? ""
          )
          .filter(Boolean)
      )
    ),
  };
}

function parseChaseCard(fileName: string, text: string): UniversalFileResult {
  const rows = csvRows(text);
  const headers = headerMap(rows[0] ?? []);
  const mask = filenameDigits(fileName);
  const transactions: ParsedTransaction[] = [];

  for (const row of rows.slice(1)) {
    const postedAt =
      isoDate(cell(row, headers, "Post Date")) ||
      isoDate(cell(row, headers, "Transaction Date"));
    const merchant = cell(row, headers, "Description");
    if (!postedAt || !merchant) continue;

    const amount = money(cell(row, headers, "Amount"));
    const category = cell(row, headers, "Category");
    const explicitType = cell(row, headers, "Type");

    transactions.push({
      postedAt,
      merchant,
      category: smartCategory(merchant, category || explicitType),
      amount,
      type:
        explicitType.toLowerCase() === "payment"
          ? "transfer"
          : transactionType(amount, merchant, explicitType),
    });
  }

  const name = mask ? `Chase Credit Card ••••${mask}` : "Chase Credit Card";
  const key = accountKey("Chase", "debt", mask, name);
  const parsed = makeParsed({
    kind: "transactions",
    institution: "Chase",
    accountName: name,
    accountMask: mask,
    accountType: "debt",
    transactions,
    balanceMode: "preserve",
    warnings: ["Activity export does not contain a current credit-card balance; Net Worth liability is preserved until a balance/statement file is imported."],
  });

  return {
    fileName,
    sourceId: "chase-credit-card",
    provider: "Chase",
    confidence: 0.99,
    accountKey: key,
    accountName: name,
    accountMask: mask,
    accountType: "debt",
    datasets: [{
      id: `${key}:transactions`,
      sourceId: "chase-credit-card",
      sourceLabel: "Chase credit-card activity",
      accountKey: key,
      confidence: 0.99,
      parsed,
    }],
    notes: parsed.warnings,
    linkedAccountMasks: [],
  };
}

function parseBoaChecking(fileName: string, text: string): UniversalFileResult {
  const rows = csvRows(text);
  const transactionHeaderIndex = rows.findIndex(
    (row) =>
      row[0] === "Date" &&
      row.includes("Description") &&
      row.includes("Running Bal.")
  );
  if (transactionHeaderIndex < 0) {
    throw new Error("Bank of America checking transaction table was not found.");
  }

  let openingBalance: number | undefined;
  let closingBalance: number | undefined;

  for (const row of rows.slice(1, transactionHeaderIndex)) {
    const label = String(row[0] ?? "").toLowerCase();
    const value = money(String(row[2] ?? ""));
    if (label.startsWith("beginning balance")) openingBalance = value;
    if (label.startsWith("ending balance")) closingBalance = value;
  }

  const headers = headerMap(rows[transactionHeaderIndex]);
  const transactions: ParsedTransaction[] = [];
  const linkedCards = new Set<string>();

  for (const row of rows.slice(transactionHeaderIndex + 1)) {
    const postedAt = isoDate(cell(row, headers, "Date"));
    const merchant = cell(row, headers, "Description");
    const rawAmount = cell(row, headers, "Amount");
    if (!postedAt || !merchant || !rawAmount) continue;

    const amount = money(rawAmount);
    const card = merchant.match(/payment to CRD\s+(\d{4})/i)?.[1];
    if (card) linkedCards.add(card);

    transactions.push({
      postedAt,
      merchant,
      category: smartCategory(merchant),
      amount,
      type: transactionType(amount, merchant),
    });
  }

  const name = "Bank of America Checking";
  const key = accountKey("Bank of America", "cash", "", name);
  const parsed = makeParsed({
    kind: "transactions",
    institution: "Bank of America",
    accountName: name,
    accountMask: "",
    accountType: "cash",
    transactions,
    openingBalance,
    closingBalance,
    balanceMode: "statement",
  });

  return {
    fileName,
    sourceId: "boa-checking",
    provider: "Bank of America",
    confidence: 0.98,
    accountKey: key,
    accountName: name,
    accountMask: "",
    accountType: "cash",
    datasets: [{
      id: `${key}:transactions`,
      sourceId: "boa-checking",
      sourceLabel: "Bank of America checking statement",
      accountKey: key,
      confidence: 0.98,
      parsed,
    }],
    notes: ["Statement summary and running balance detected."],
    linkedAccountMasks: [...linkedCards],
  };
}

function parseBoaCard(fileName: string, text: string): UniversalFileResult {
  const rows = csvRows(text);
  const headers = headerMap(rows[0] ?? []);
  const mask = filenameDigits(fileName);
  const transactions: ParsedTransaction[] = [];
  const linkedChecking = new Set<string>();

  for (const row of rows.slice(1)) {
    const postedAt = isoDate(cell(row, headers, "Posted Date"));
    const merchant = cell(row, headers, "Payee");
    if (!postedAt || !merchant) continue;

    const amount = money(cell(row, headers, "Amount"));
    const checking = merchant.match(/PAYMENT FROM CHK\s+(\d{4})/i)?.[1];
    if (checking) linkedChecking.add(checking);

    transactions.push({
      postedAt,
      merchant,
      category: smartCategory(merchant),
      amount,
      type: /PAYMENT FROM CHK/i.test(merchant)
        ? "transfer"
        : transactionType(amount, merchant),
      externalId: cell(row, headers, "Reference Number") || undefined,
    });
  }

  const name = mask
    ? `Bank of America Credit Card ••••${mask}`
    : "Bank of America Credit Card";
  const key = accountKey("Bank of America", "debt", mask, name);
  const parsed = makeParsed({
    kind: "transactions",
    institution: "Bank of America",
    accountName: name,
    accountMask: mask,
    accountType: "debt",
    transactions,
    balanceMode: "preserve",
    warnings: ["Activity export does not contain a current credit-card balance; Net Worth liability is preserved until a balance/statement file is imported."],
  });

  return {
    fileName,
    sourceId: "boa-credit-card",
    provider: "Bank of America",
    confidence: 0.99,
    accountKey: key,
    accountName: name,
    accountMask: mask,
    accountType: "debt",
    datasets: [{
      id: `${key}:transactions`,
      sourceId: "boa-credit-card",
      sourceLabel: "Bank of America credit-card activity",
      accountKey: key,
      confidence: 0.99,
      parsed,
    }],
    notes: parsed.warnings,
    linkedAccountMasks: [...linkedChecking],
  };
}

function parseVanguard(fileName: string, text: string): UniversalFileResult {
  const rows = csvRows(text);
  const secondHeader = rows.findIndex(
    (row) =>
      row[0] === "Account Number" &&
      row.includes("Trade Date") &&
      row.includes("Transaction Type")
  );
  if (secondHeader < 0) {
    throw new Error("Vanguard activity section was not found.");
  }

  const holdingsHeader = headerMap(rows[0] ?? []);
  const holdings: ParsedHolding[] = [];
  let accountNumber = "";

  for (const row of rows.slice(1, secondHeader)) {
    if (!row.some(Boolean)) continue;
    const symbol = cell(row, holdingsHeader, "Symbol");
    const name = cell(row, holdingsHeader, "Investment Name");
    if (!symbol && !name) continue;

    accountNumber ||= cell(row, holdingsHeader, "Account Number");
    const ticker = normalizeTicker(symbol, name);
    const shares = numberValue(cell(row, holdingsHeader, "Shares"));
    const price = money(cell(row, holdingsHeader, "Share Price"));
    const marketValue = money(cell(row, holdingsHeader, "Total Value"));

    holdings.push({
      ticker,
      name: name || ticker,
      kind: cashHoldingKind(ticker, name),
      shares,
      price,
      costBasis: 0,
      marketValue,
      sector: investmentSector(ticker, name),
      externalId: ticker,
    });
  }

  const txHeader = headerMap(rows[secondHeader]);
  const transactions: ParsedTransaction[] = [];

  for (const row of rows.slice(secondHeader + 1)) {
    const postedAt = isoDate(cell(row, txHeader, "Trade Date"));
    const txType = cell(row, txHeader, "Transaction Type");
    const description =
      cell(row, txHeader, "Transaction Description") ||
      txType;
    if (!postedAt || !description) continue;

    const symbol = normalizeTicker(
      cell(row, txHeader, "Symbol"),
      cell(row, txHeader, "Investment Name")
    );
    const amount = money(cell(row, txHeader, "Net Amount"));
    const lower = txType.toLowerCase();
    const type: ParsedTransaction["type"] =
      /dividend|interest/.test(lower)
        ? "income"
        : /fee|commission/.test(lower)
          ? "expense"
          : "transfer";

    transactions.push({
      postedAt,
      merchant: symbol !== "UNKNOWN"
        ? `${description} · ${symbol}`
        : description,
      category:
        /dividend|interest/.test(lower)
          ? "Investment Income"
          : /fee|commission/.test(lower)
            ? "Investment Fees"
            : "Investment Activity",
      amount,
      type,
      externalId: [
        accountNumber,
        postedAt,
        txType,
        symbol,
        amount,
      ].join("|"),
    });
  }

  const mask = accountNumber.slice(-4);
  const name = mask
    ? `Vanguard Brokerage ••••${mask}`
    : "Vanguard Brokerage";
  const key = accountKey("Vanguard", "investment", mask, name);
  const holdingValue = holdings.reduce(
    (sum, holding) => sum + holding.marketValue,
    0
  );

  return {
    fileName,
    sourceId: "vanguard-investment",
    provider: "Vanguard",
    confidence: 0.99,
    accountKey: key,
    accountName: name,
    accountMask: mask,
    accountType: "investment",
    datasets: [
      {
        id: `${key}:holdings`,
        sourceId: "vanguard-investment",
        sourceLabel: "Vanguard current holdings",
        accountKey: key,
        confidence: 0.99,
        parsed: makeParsed({
          kind: "holdings",
          institution: "Vanguard",
          accountName: name,
          accountMask: mask,
          accountType: "investment",
          holdings,
          closingBalance: holdingValue,
          balanceMode: "holdings",
          snapshotMode: "replace",
        }),
      },
      {
        id: `${key}:activity`,
        sourceId: "vanguard-investment",
        sourceLabel: "Vanguard investment activity",
        accountKey: key,
        confidence: 0.99,
        parsed: makeParsed({
          kind: "transactions",
          institution: "Vanguard",
          accountName: name,
          accountMask: mask,
          accountType: "investment",
          transactions,
          balanceMode: "preserve",
        }),
      },
    ],
    notes: ["Current holdings and investment activity were separated automatically. Sweep/buy/sell/reinvestment rows are treated as investment transfers, not household spending."],
    linkedAccountMasks: [],
  };
}

function parseMerrillHoldings(fileName: string, text: string): UniversalFileResult {
  const rows = csvRows(text);
  const headers = headerMap(rows[0] ?? []);
  const holdings: ParsedHolding[] = [];
  let accountNumber = "";
  let registration = "";

  for (const row of rows.slice(1)) {
    const description = cell(row, headers, "Security Description");
    const cusip = cell(row, headers, "CUSIP #");
    const securityNumber = cell(row, headers, "Security #");
    const symbol = cell(row, headers, "Symbol");
    if (!description && !symbol && !cusip) continue;

    accountNumber ||= cell(row, headers, "Account #");
    registration ||= cell(row, headers, "Account Registration");

    const ticker = normalizeTicker(symbol, description, cusip || securityNumber);
    const shares = numberValue(cell(row, headers, "Quantity"));
    const price = money(cell(row, headers, "Price ($)"));
    const marketValue = money(cell(row, headers, "Value ($)"));
    const gain = money(cell(row, headers, "Unrealized Gain/Loss ($)"));
    const costBasis = marketValue - gain;

    holdings.push({
      ticker,
      name: description || ticker,
      kind: cashHoldingKind(ticker, description),
      shares,
      price,
      costBasis: Math.max(0, costBasis),
      marketValue,
      sector: investmentSector(ticker, description),
      externalId: cusip || securityNumber || ticker,
    });
  }

  const mask = accountNumber.slice(-4);
  const retirement = /IRA|401|403|RETIREMENT/i.test(registration);
  const type = retirement ? "retirement" : "investment";
  const name = registration && registration !== "--"
    ? registration
    : mask
      ? `Merrill Edge Brokerage ••••${mask}`
      : "Merrill Edge Brokerage";
  const key = accountKey("Merrill Edge", type, mask, name);
  const total = holdings.reduce(
    (sum, holding) => sum + holding.marketValue,
    0
  );

  return {
    fileName,
    sourceId: "merrill-holdings",
    provider: "Merrill Edge",
    confidence: 0.99,
    accountKey: key,
    accountName: name,
    accountMask: mask,
    accountType: type,
    datasets: [{
      id: `${key}:holdings`,
      sourceId: "merrill-holdings",
      sourceLabel: "Merrill Edge current holdings",
      accountKey: key,
      confidence: 0.99,
      parsed: makeParsed({
        kind: "holdings",
        institution: "Merrill Edge",
        accountName: name,
        accountMask: mask,
        accountType: type,
        holdings,
        closingBalance: total,
        balanceMode: "holdings",
        snapshotMode: "replace",
      }),
    }],
    notes: ["CUSIP/security identifiers are retained when a ticker is unavailable. Unrealized gain/loss is used to infer cost basis."],
    linkedAccountMasks: [],
  };
}

function parseMerrillSummary(fileName: string, text: string): UniversalFileResult {
  const rows = csvRows(text);
  const headers = headerMap(rows[0] ?? []);
  const row = rows[1] ?? [];
  const accountNumber = cell(row, headers, "Account #");
  const registration = cell(row, headers, "Account Registration");
  const mask = accountNumber.slice(-4);
  const retirement = /IRA|401|403|RETIREMENT/i.test(registration);
  const type = retirement ? "retirement" : "investment";
  const name = registration && registration !== "--"
    ? registration
    : mask
      ? `Merrill Edge Brokerage ••••${mask}`
      : "Merrill Edge Brokerage";
  const key = accountKey("Merrill Edge", type, mask, name);

  const companion: UniversalCompanion = {
    kind: "account_summary",
    accountKey: key,
    accountName: name,
    institution: "Merrill Edge",
    accountType: type,
    accountMask: mask,
    statementDate: isoDate(cell(row, headers, "COB Date")),
    netValue: money(cell(row, headers, "Net Value ($)")),
    cashBalance: money(cell(row, headers, "Cash Balance ($)")),
    moneyAccounts: money(cell(row, headers, "Money Accounts ($)")),
    pricedInvestments: money(cell(row, headers, "Priced Investments ($)")),
  };

  return {
    fileName,
    sourceId: "merrill-summary",
    provider: "Merrill Edge",
    confidence: 0.99,
    accountKey: key,
    accountName: name,
    accountMask: mask,
    accountType: type,
    datasets: [],
    companion,
    notes: ["Account summary detected. It will reconcile with the matching Merrill holdings file and supply the authoritative account value."],
    linkedAccountMasks: [],
  };
}

function parseTsp(fileName: string, text: string): UniversalFileResult {
  const statement = parseOfficialTspCsv(text);
  const holdings: ParsedHolding[] = statement.funds.map((fund) => {
    const ticker = `TSP-${fund.fundCode}`;
    return {
      ticker,
      name: fund.fundName,
      kind: cashHoldingKind(ticker, fund.assetClass),
      shares: fund.units,
      price: fund.fundPrice,
      costBasis: 0,
      marketValue: fund.units * fund.fundPrice,
      sector: investmentSector(ticker, fund.assetClass),
      externalId: fund.fundCode,
    };
  });

  const name = "Thrift Saving Plan";
  const key = accountKey("Thrift Savings Plan", "retirement", "", statement.plan);
  const total = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);

  return {
    fileName,
    sourceId: "tsp",
    provider: "Thrift Savings Plan",
    confidence: 0.99,
    accountKey: key,
    accountName: name,
    accountMask: "",
    accountType: "retirement",
    datasets: [{
      id: `${key}:holdings`,
      sourceId: "tsp",
      sourceLabel: "Thrift Saving Plan holdings",
      accountKey: key,
      confidence: 0.99,
      parsed: {
        ...makeParsed({
          kind: "holdings",
          institution: "Thrift Savings Plan",
          accountName: name,
          accountMask: "",
          accountType: "retirement",
          holdings,
          closingBalance: total,
          balanceMode: "holdings",
          snapshotMode: "replace",
          warnings: statement.warnings,
        }),
        universalMetadata: {
          tspStatement: statement,
        },
      },
    }],
    notes: ["Fund units and prices were detected from the official TSP export."],
    linkedAccountMasks: [],
  };
}

function genericResult(fileName: string, text: string): UniversalFileResult {
  const parsed = parseFinancialFile(fileName, text);
  const mask = parsed.accountMask || filenameDigits(fileName);
  const provider = (parsed.institutionGuess || "Unknown") as UniversalProvider;
  const key = accountKey(
    provider,
    parsed.accountType,
    mask,
    parsed.accountName
  );
  parsed.accountMask = mask;
  parsed.balanceMode = parsed.kind === "holdings"
    ? "holdings"
    : parsed.closingBalance != null
      ? "statement"
      : "preserve";
  parsed.snapshotMode = parsed.kind === "holdings" ? "replace" : undefined;

  return {
    fileName,
    sourceId: "generic",
    provider,
    confidence: 0.72,
    accountKey: key,
    accountName: parsed.accountName,
    accountMask: mask,
    accountType: parsed.accountType,
    datasets: [{
      id: `${key}:${parsed.kind}`,
      sourceId: "generic",
      sourceLabel: "Generic financial file",
      accountKey: key,
      confidence: 0.72,
      parsed,
    }],
    notes: ["Generic column mapping was used. Review the preview before importing."],
    linkedAccountMasks: [],
  };
}

export function parseUniversalFinancialFile(
  fileName: string,
  text: string
): UniversalFileResult {
  const normalized = text.replace(/^\uFEFF/, "");
  const firstLine = normalized.split(/\r?\n/, 1)[0] ?? "";

  if (
    /Plan,Asset Class,Fund Name,Current Mix,Future Investments,Date Range/i.test(
      firstLine
    )
  ) {
    return parseTsp(fileName, normalized);
  }

  if (
    /Account Number,Investment Name,Symbol,Shares,Share Price,Total Value/i.test(
      firstLine
    ) &&
    /Account Number,Trade Date,Settlement Date,Transaction Type/i.test(normalized)
  ) {
    return parseVanguard(fileName, normalized);
  }

  if (
    /COB Date.*Security #.*Symbol.*CUSIP #.*Security Description.*Quantity.*Price \(\$\).*Value \(\$\)/i.test(
      firstLine
    )
  ) {
    return parseMerrillHoldings(fileName, normalized);
  }

  if (
    /COB Date.*Account Registration.*Account #.*Cash Balance \(\$\).*Net Value \(\$\)/i.test(
      firstLine
    )
  ) {
    return parseMerrillSummary(fileName, normalized);
  }

  if (
    /^Details,Posting Date,Description,Amount,Type,Balance/i.test(firstLine)
  ) {
    return parseChaseChecking(fileName, normalized);
  }

  if (
    /^Transaction Date,Post Date,Description,Category,Type,Amount/i.test(firstLine)
  ) {
    return parseChaseCard(fileName, normalized);
  }

  if (
    /^Posted Date,Reference Number,Payee,Address,Amount/i.test(firstLine)
  ) {
    return parseBoaCard(fileName, normalized);
  }

  if (
    /^Description,,Summary Amt\./i.test(firstLine) &&
    /Date,Description,Amount,Running Bal\./i.test(normalized)
  ) {
    return parseBoaChecking(fileName, normalized);
  }

  return genericResult(fileName, normalized);
}

function replaceAccountIdentity(
  result: UniversalFileResult,
  mask: string
): UniversalFileResult {
  if (!mask || result.accountMask) return result;
  const key = accountKey(
    result.provider,
    result.accountType,
    mask,
    result.accountName
  );
  return {
    ...result,
    accountMask: mask,
    accountKey: key,
    datasets: result.datasets.map((dataset) => ({
      ...dataset,
      id: `${key}:${dataset.parsed.kind}`,
      accountKey: key,
      parsed: {
        ...dataset.parsed,
        accountMask: mask,
      },
    })),
  };
}

export function reconcileUniversalBundle(
  results: UniversalFileResult[]
) {
  let next = [...results];

  const boaCard = next.find(
    (result) => result.sourceId === "boa-credit-card"
  );
  const boaCheckingIndex = next.findIndex(
    (result) => result.sourceId === "boa-checking"
  );
  if (
    boaCard &&
    boaCheckingIndex >= 0 &&
    boaCard.linkedAccountMasks.length === 1
  ) {
    next[boaCheckingIndex] = replaceAccountIdentity(
      next[boaCheckingIndex],
      boaCard.linkedAccountMasks[0]
    );
  }

  const companions = new Map(
    next
      .filter((result) => result.companion)
      .map((result) => [
        result.companion!.accountMask,
        result.companion!,
      ])
  );

  next = next.map((result) => {
    if (result.sourceId !== "merrill-holdings") return result;

    const companion = companions.get(result.accountMask);
    if (!companion) return result;

    return {
      ...result,
      datasets: result.datasets.map((dataset) => {
        if (dataset.parsed.kind !== "holdings") return dataset;

        const holdings = [...dataset.parsed.holdings];
        if (
          companion.cashBalance !== 0 &&
          !holdings.some(
            (holding) => holding.ticker === "MERRILL-CASH"
          )
        ) {
          holdings.push({
            ticker: "MERRILL-CASH",
            name: "Merrill Edge Cash",
            kind: "cash",
            shares: companion.cashBalance,
            price: 1,
            costBasis: companion.cashBalance,
            marketValue: companion.cashBalance,
            sector: "Cash",
            externalId: "MERRILL-CASH",
          });
        }

        return {
          ...dataset,
          parsed: {
            ...dataset.parsed,
            holdings,
            closingBalance: companion.netValue,
            warnings: [
              ...dataset.parsed.warnings,
              `Merrill summary reconciled at $${companion.netValue.toFixed(2)}.`,
            ],
          },
        };
      }),
      notes: [
        ...result.notes,
        "Matching Merrill portfolio summary was merged automatically.",
      ],
    };
  });

  return next;
}
