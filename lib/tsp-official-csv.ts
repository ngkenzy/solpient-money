export const TSP_OFFICIAL_CSV_VERSION = "tsp-official-csv-v1" as const;

export type TspOfficialFundRow = {
  plan: string;
  assetClass: string;
  fundName: string;
  fundCode: string;
  currentMixPct: number;
  futureInvestmentsPct: number;
  dateRange: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  gainsLosses: number;
  otherActivity: number;
  closingBalance: number;
  units: number;
  fundPrice: number;
  fundReturnPct: number;
};

export type TspOfficialCsvResult = {
  parserVersion: typeof TSP_OFFICIAL_CSV_VERSION;
  plan: string;
  periodStart: string;
  periodEnd: string;
  dateRange: string;
  funds: TspOfficialFundRow[];
  totals: {
    openingBalance: number;
    gainsLosses: number;
    otherActivity: number;
    closingBalance: number;
    currentMixPct: number;
    futureInvestmentsPct: number;
  };
  warnings: string[];
};

const REQUIRED_HEADERS = [
  "Plan",
  "Asset Class",
  "Fund Name",
  "Current Mix",
  "Future Investments",
  "Date Range",
  "Opening Balance",
  "Gains/Losses",
  "Other Activity",
  "Closing Balance",
  "Units",
  "Fund Price",
  "Fund Return",
] as const;

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (quoted) {
    throw new Error("The TSP CSV contains an unterminated quoted field.");
  }

  cells.push(current.trim());
  return cells;
}

function parseMoney(raw: string, field: string) {
  let cleaned = raw
    .trim()
    .replace(/,/g, "");

  let negative = false;

  if (
    cleaned.startsWith("(") &&
    cleaned.endsWith(")")
  ) {
    negative = true;
    cleaned = cleaned.slice(1, -1).trim();
  }

  if (
    cleaned.startsWith("-") ||
    cleaned.startsWith("+")
  ) {
    negative = cleaned[0] === "-" ? !negative : negative;
    cleaned = cleaned.slice(1).trim();
  }

  if (cleaned.startsWith("$")) {
    cleaned = cleaned.slice(1).trim();
  }

  // Some exports place the sign after the currency symbol.
  if (
    cleaned.startsWith("-") ||
    cleaned.startsWith("+")
  ) {
    negative = cleaned[0] === "-" ? !negative : negative;
    cleaned = cleaned.slice(1).trim();
  }

  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) {
    throw new Error(`Unable to parse ${field}: ${raw}`);
  }

  const value = Number(cleaned);

  if (!Number.isFinite(value)) {
    throw new Error(`Unable to parse ${field}: ${raw}`);
  }

  return negative ? -value : value;
}

function parseNumber(raw: string, field: string) {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    throw new Error(`Unable to parse ${field}: ${raw}`);
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    throw new Error(`Unable to parse ${field}: ${raw}`);
  }

  return value;
}

function parsePercent(raw: string, field: string) {
  const cleaned = raw.trim().replace(/%$/, "");
  return parseNumber(cleaned, field);
}

function parseLongDate(raw: string) {
  const match = raw
    .trim()
    .match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);

  if (!match) {
    throw new Error(`Unable to parse TSP date: ${raw}`);
  }

  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);

  if (!month || day < 1 || day > 31) {
    throw new Error(`Unable to parse TSP date: ${raw}`);
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Unable to parse TSP date: ${raw}`);
  }

  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function parseDateRange(raw: string) {
  const parts = raw.split(/\s+-\s+/);

  if (parts.length !== 2) {
    throw new Error(`Unable to parse TSP date range: ${raw}`);
  }

  return {
    start: parseLongDate(parts[0]),
    end: parseLongDate(parts[1]),
  };
}

function fundCode(name: string) {
  const trimmed = name.trim();

  const core = trimmed.match(/^([GFCSI])\s+Fund$/i);
  if (core) return core[1].toUpperCase();

  const lifecycle = trimmed.match(/^L\s*(Income|\d{4})(?:\s+Fund)?$/i);
  if (lifecycle) {
    const token = lifecycle[1].toUpperCase();
    return token === "INCOME" ? "LINCOME" : `L${token}`;
  }

  return trimmed
    .toUpperCase()
    .replace(/\bFUND\b/g, "")
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 24) || "TSP";
}

function approximately(value: number, expected: number, tolerance: number) {
  return Math.abs(value - expected) <= tolerance;
}

export function parseOfficialTspCsv(source: string): TspOfficialCsvResult {
  const lines = String(source ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("The TSP CSV does not contain any fund rows.");
  }

  const headers = parseCsvLine(lines[0]);

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header)
  );

  if (missingHeaders.length) {
    throw new Error(
      `This is not a supported TSP fund export. Missing columns: ${missingHeaders.join(", ")}`
    );
  }

  const indexOf = (header: (typeof REQUIRED_HEADERS)[number]) =>
    headers.indexOf(header);

  const warnings: string[] = [];

  const funds = lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);

    const value = (header: (typeof REQUIRED_HEADERS)[number]) =>
      cells[indexOf(header)] ?? "";

    const dateRange = value("Date Range");
    const period = parseDateRange(dateRange);

    const row: TspOfficialFundRow = {
      plan: value("Plan"),
      assetClass: value("Asset Class"),
      fundName: value("Fund Name"),
      fundCode: fundCode(value("Fund Name")),
      currentMixPct: parsePercent(value("Current Mix"), "Current Mix"),
      futureInvestmentsPct: parsePercent(
        value("Future Investments"),
        "Future Investments"
      ),
      dateRange,
      periodStart: period.start,
      periodEnd: period.end,
      openingBalance: parseMoney(value("Opening Balance"), "Opening Balance"),
      gainsLosses: parseMoney(value("Gains/Losses"), "Gains/Losses"),
      otherActivity: parseMoney(value("Other Activity"), "Other Activity"),
      closingBalance: parseMoney(value("Closing Balance"), "Closing Balance"),
      units: parseNumber(value("Units"), "Units"),
      fundPrice: parseMoney(value("Fund Price"), "Fund Price"),
      fundReturnPct: parsePercent(value("Fund Return"), "Fund Return"),
    };

    if (!row.plan || !row.fundName) {
      throw new Error(`TSP CSV row ${rowIndex + 2} is missing Plan or Fund Name.`);
    }

    const reconciled =
      row.openingBalance +
      row.gainsLosses +
      row.otherActivity;

    if (!approximately(reconciled, row.closingBalance, 0.02)) {
      warnings.push(
        `${row.fundName} does not reconcile exactly: opening + gains/losses + activity differs from closing balance by $${Math.abs(
          reconciled - row.closingBalance
        ).toFixed(2)}.`
      );
    }

    return row;
  });

  const first = funds[0];

  for (const fund of funds.slice(1)) {
    if (fund.plan !== first.plan) {
      throw new Error("The TSP CSV contains more than one plan.");
    }

    if (
      fund.periodStart !== first.periodStart ||
      fund.periodEnd !== first.periodEnd
    ) {
      throw new Error("The TSP CSV fund rows do not share the same date range.");
    }
  }

  const totals = funds.reduce(
    (sum, fund) => ({
      openingBalance: sum.openingBalance + fund.openingBalance,
      gainsLosses: sum.gainsLosses + fund.gainsLosses,
      otherActivity: sum.otherActivity + fund.otherActivity,
      closingBalance: sum.closingBalance + fund.closingBalance,
      currentMixPct: sum.currentMixPct + fund.currentMixPct,
      futureInvestmentsPct:
        sum.futureInvestmentsPct + fund.futureInvestmentsPct,
    }),
    {
      openingBalance: 0,
      gainsLosses: 0,
      otherActivity: 0,
      closingBalance: 0,
      currentMixPct: 0,
      futureInvestmentsPct: 0,
    }
  );

  if (!approximately(totals.currentMixPct, 100, 0.2)) {
    warnings.push(
      `Current Mix totals ${totals.currentMixPct.toFixed(1)}% instead of 100%.`
    );
  }

  if (!approximately(totals.futureInvestmentsPct, 100, 0.2)) {
    warnings.push(
      `Future Investments totals ${totals.futureInvestmentsPct.toFixed(1)}% instead of 100%.`
    );
  }

  return {
    parserVersion: TSP_OFFICIAL_CSV_VERSION,
    plan: first.plan,
    periodStart: first.periodStart,
    periodEnd: first.periodEnd,
    dateRange: first.dateRange,
    funds,
    totals,
    warnings,
  };
}
