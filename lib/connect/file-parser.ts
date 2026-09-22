export type ImportFormat = "csv" | "qfx" | "ofx";
export type ImportKind = "transactions" | "holdings";
export type ImportAccountType = "cash" | "investment" | "retirement" | "debt";

export type ParsedTransaction = {
  postedAt: string;
  merchant: string;
  category: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  externalId?: string;
};

export type ParsedHolding = {
  ticker: string;
  name: string;
  kind: "stock" | "etf" | "bond" | "cash";
  shares: number;
  price: number;
  costBasis: number;
  marketValue: number;
  sector: string;
  externalId?: string;
};

export type ParsedFinancialFile = {
  format: ImportFormat;
  kind: ImportKind;
  institutionGuess: string;
  accountName: string;
  accountMask: string;
  accountType: ImportAccountType;
  closingBalance?: number;
  transactions: ParsedTransaction[];
  holdings: ParsedHolding[];
  warnings: string[];
};

const aliases = {
  date: ["date", "posteddate", "postingdate", "transactiondate", "transdate"],
  merchant: ["description", "merchant", "name", "payee", "memo", "details", "transaction"],
  category: ["category", "typecategory", "transactioncategory"],
  amount: ["amount", "transactionamount", "netamount"],
  debit: ["debit", "withdrawal", "withdrawals", "debits"],
  credit: ["credit", "deposit", "deposits", "credits"],
  balance: ["balance", "runningbalance", "currentbalance"],
  ticker: ["ticker", "symbol", "securitysymbol"],
  holdingName: ["securityname", "investmentname", "holding", "description", "name"],
  shares: ["shares", "quantity", "units"],
  price: ["price", "unitprice", "marketprice"],
  marketValue: ["marketvalue", "value", "currentvalue"],
  costBasis: ["costbasis", "cost", "totalcost"],
  securityType: ["securitytype", "assettype", "investmenttype", "type"],
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function indexOfAlias(headers: string[], choices: string[]) {
  const normalized = headers.map(normalizeHeader);
  return choices.map(normalizeHeader).map((choice) => normalized.indexOf(choice)).find((index) => index >= 0) ?? -1;
}

function parseMoney(value: string | undefined) {
  if (!value) return 0;
  const trimmed = value.trim();
  const negative = /^\(.*\)$/.test(trimmed);
  const numeric = Number(trimmed.replace(/[,$%()\s]/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  return negative ? -Math.abs(numeric) : numeric;
}

function parseNumber(value: string | undefined) {
  if (!value) return 0;
  const numeric = Number(value.replace(/[,\s]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeDate(value: string) {
  const raw = value.trim();
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const us = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function tagValue(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<\\r\\n]*)`, "i"));
  return decodeEntities(match?.[1]?.trim() ?? "");
}

function blocks(text: string, tag: string, terminalTags: string[] = []) {
  const escapedTerminal = terminalTags.length ? `|<\\/(${terminalTags.join("|")})>` : "";
  const regex = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)(?:<\\/${tag}>|(?=<${tag}(?:\\s|>))${escapedTerminal}|$)`,
    "gi"
  );
  return Array.from(text.matchAll(regex), (match) => match[1]);
}

function transactionType(amount: number, description: string) {
  const normalized = description.toLowerCase();
  if (/(transfer|payment|xfer|ach transfer)/.test(normalized)) return "transfer" as const;
  return amount >= 0 ? "income" as const : "expense" as const;
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
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

function parseCsv(text: string): ParsedFinancialFile {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("CSV needs a header row and at least one data row.");

  const headers = rows[0];
  const data = rows.slice(1);
  const tickerIndex = indexOfAlias(headers, aliases.ticker);
  const sharesIndex = indexOfAlias(headers, aliases.shares);
  const dateIndex = indexOfAlias(headers, aliases.date);
  const warnings: string[] = [];

  if (tickerIndex >= 0 && sharesIndex >= 0) {
    const nameIndex = indexOfAlias(headers, aliases.holdingName);
    const priceIndex = indexOfAlias(headers, aliases.price);
    const valueIndex = indexOfAlias(headers, aliases.marketValue);
    const costIndex = indexOfAlias(headers, aliases.costBasis);
    const typeIndex = indexOfAlias(headers, aliases.securityType);

    const holdings = data.flatMap((row, index) => {
      const ticker = (row[tickerIndex] ?? "").trim().toUpperCase();
      if (!ticker) {
        warnings.push(`Skipped holding row ${index + 2}: missing ticker/symbol.`);
        return [];
      }
      const shares = parseNumber(row[sharesIndex]);
      const price = parseMoney(row[priceIndex]);
      const marketValue = valueIndex >= 0 ? parseMoney(row[valueIndex]) : shares * price;
      const costBasis = costIndex >= 0 ? parseMoney(row[costIndex]) : 0;
      const rawType = (row[typeIndex] ?? "").toLowerCase();
      const kind: ParsedHolding["kind"] =
        ticker === "CASH" || rawType.includes("cash")
          ? "cash"
          : rawType.includes("bond") || rawType.includes("fixed")
            ? "bond"
            : rawType.includes("etf") || rawType.includes("fund")
              ? "etf"
              : "stock";

      return [{
        ticker,
        name: (row[nameIndex] ?? ticker).trim() || ticker,
        kind,
        shares,
        price,
        costBasis,
        marketValue,
        sector: rawType || "Other",
      }];
    });

    if (!holdings.length) throw new Error("No usable holdings were found in this CSV.");

    return {
      format: "csv",
      kind: "holdings",
      institutionGuess: "",
      accountName: "Imported investment account",
      accountMask: "",
      accountType: "investment",
      closingBalance: holdings.reduce((sum, holding) => sum + holding.marketValue, 0),
      transactions: [],
      holdings,
      warnings,
    };
  }

  if (dateIndex < 0) {
    throw new Error("Could not detect a transaction date column or holdings ticker/quantity columns.");
  }

  const merchantIndex = indexOfAlias(headers, aliases.merchant);
  const categoryIndex = indexOfAlias(headers, aliases.category);
  const amountIndex = indexOfAlias(headers, aliases.amount);
  const debitIndex = indexOfAlias(headers, aliases.debit);
  const creditIndex = indexOfAlias(headers, aliases.credit);
  const balanceIndex = indexOfAlias(headers, aliases.balance);

  if (merchantIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    throw new Error("Could not detect the description and amount columns in this CSV.");
  }

  const transactions = data.flatMap((row, index) => {
    const postedAt = normalizeDate(row[dateIndex] ?? "");
    const merchant = (row[merchantIndex] ?? "").trim();
    if (!postedAt || !merchant) {
      warnings.push(`Skipped transaction row ${index + 2}: missing date or description.`);
      return [];
    }

    let amount = amountIndex >= 0 ? parseMoney(row[amountIndex]) : 0;
    if (amountIndex < 0) {
      const credit = creditIndex >= 0 ? Math.abs(parseMoney(row[creditIndex])) : 0;
      const debit = debitIndex >= 0 ? Math.abs(parseMoney(row[debitIndex])) : 0;
      amount = credit - debit;
    }

    return [{
      postedAt,
      merchant,
      category: (row[categoryIndex] ?? "Uncategorized").trim() || "Uncategorized",
      amount,
      type: transactionType(amount, merchant),
    }];
  });

  if (!transactions.length) throw new Error("No usable transactions were found in this CSV.");

  const balances = balanceIndex >= 0
    ? data.map((row) => parseMoney(row[balanceIndex])).filter((value) => Number.isFinite(value))
    : [];

  return {
    format: "csv",
    kind: "transactions",
    institutionGuess: "",
    accountName: "Imported bank account",
    accountMask: "",
    accountType: "cash",
    closingBalance: balances.length ? balances[balances.length - 1] : undefined,
    transactions,
    holdings: [],
    warnings,
  };
}

function parseOfx(text: string, format: "ofx" | "qfx"): ParsedFinancialFile {
  const warnings: string[] = [];
  const institutionGuess = tagValue(text, "ORG") || tagValue(text, "BROKERID");
  const accountId = tagValue(text, "ACCTID") || tagValue(text, "BROKERACCTID");
  const accountMask = accountId ? accountId.slice(-4) : "";

  const securityMap = new Map<string, { ticker: string; name: string; type: string }>();
  for (const infoTag of ["STOCKINFO", "MFINFO", "DEBTINFO", "OTHERINFO"]) {
    for (const block of blocks(text, infoTag, ["SECLIST"])) {
      const id = tagValue(block, "UNIQUEID");
      if (!id) continue;
      securityMap.set(id, {
        ticker: tagValue(block, "TICKER").toUpperCase(),
        name: tagValue(block, "SECNAME"),
        type: infoTag,
      });
    }
  }

  const holdings: ParsedHolding[] = [];
  for (const [positionTag, type] of [
    ["POSSTOCK", "stock"],
    ["POSMF", "etf"],
    ["POSDEBT", "bond"],
    ["POSOTHER", "stock"],
  ] as const) {
    for (const block of blocks(text, positionTag, ["INVPOSLIST"])) {
      const id = tagValue(block, "UNIQUEID");
      const security = securityMap.get(id);
      const ticker = (security?.ticker || tagValue(block, "TICKER") || `SEC-${id.slice(0, 8)}`).toUpperCase();
      const shares = parseNumber(tagValue(block, "UNITS"));
      const price = parseMoney(tagValue(block, "UNITPRICE"));
      const marketValue = parseMoney(tagValue(block, "MKTVAL")) || shares * price;
      holdings.push({
        ticker,
        name: security?.name || ticker,
        kind: type,
        shares,
        price,
        costBasis: 0,
        marketValue,
        sector: security?.type || "Investments",
        externalId: id || undefined,
      });
    }
  }

  if (holdings.length) {
    return {
      format,
      kind: "holdings",
      institutionGuess,
      accountName: institutionGuess ? `${institutionGuess} investments` : "Imported investment account",
      accountMask,
      accountType: "investment",
      closingBalance: holdings.reduce((sum, holding) => sum + holding.marketValue, 0),
      transactions: [],
      holdings,
      warnings,
    };
  }

  const transactions = blocks(text, "STMTTRN", ["BANKTRANLIST"]).flatMap((block, index) => {
    const postedAt = normalizeDate(tagValue(block, "DTPOSTED"));
    const amount = parseMoney(tagValue(block, "TRNAMT"));
    const merchant = tagValue(block, "NAME") || tagValue(block, "MEMO") || "Imported transaction";
    if (!postedAt) {
      warnings.push(`Skipped OFX transaction ${index + 1}: invalid posting date.`);
      return [];
    }
    const ofxType = tagValue(block, "TRNTYPE").toLowerCase();
    return [{
      postedAt,
      merchant,
      category: ofxType ? ofxType.replace(/_/g, " ") : "Uncategorized",
      amount,
      type: transactionType(amount, `${ofxType} ${merchant}`),
      externalId: tagValue(block, "FITID") || undefined,
    }];
  });

  if (!transactions.length) {
    throw new Error("No bank transactions or investment positions were found in this OFX/QFX file.");
  }

  const rawAccountType = tagValue(text, "ACCTTYPE").toUpperCase();
  const accountType: ImportAccountType =
    /CREDIT|LOAN/.test(rawAccountType) ? "debt" : "cash";

  return {
    format,
    kind: "transactions",
    institutionGuess,
    accountName: institutionGuess ? `${institutionGuess} ${rawAccountType || "account"}` : "Imported bank account",
    accountMask,
    accountType,
    closingBalance: tagValue(text, "BALAMT") ? parseMoney(tagValue(text, "BALAMT")) : undefined,
    transactions,
    holdings: [],
    warnings,
  };
}

export function parseFinancialFile(fileName: string, text: string): ParsedFinancialFile {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "ofx" || extension === "qfx" || /<OFX/i.test(text) || /^OFXHEADER:/im.test(text)) {
    return parseOfx(text, extension === "qfx" ? "qfx" : "ofx");
  }
  if (extension === "csv" || text.includes(",")) {
    return parseCsv(text);
  }
  throw new Error("Unsupported file. Use CSV, QFX, or OFX.");
}
