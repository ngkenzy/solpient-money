import {
  TSP_STATEMENT_PARSER_VERSION,
  type TspStatementCandidate,
  type TspStatementFundBalance,
  type TspStatementIssue,
  type TspStatementParseResult,
  type TspStatementSourceKind,
} from "./tsp-statement-types";

export {
  TSP_STATEMENT_PARSER_VERSION,
} from "./tsp-statement-types";
export type {
  TspStatementCandidate,
  TspStatementFundBalance,
  TspStatementIssue,
  TspStatementParseResult,
  TspStatementSourceKind,
} from "./tsp-statement-types";

const ROUNDING_CENTS = 100;

const FIELD_ALIASES: Record<string, string> = {
  statementdate: "statementDate",
  asofdate: "statementDate",
  asof: "statementDate",
  date: "statementDate",
  traditionalbalance: "traditionalBalance",
  traditional: "traditionalBalance",
  traditionaltsp: "traditionalBalance",
  rothbalance: "rothBalance",
  roth: "rothBalance",
  rothtsp: "rothBalance",
  totalbalance: "totalBalance",
  accountbalance: "totalBalance",
  totalaccountbalance: "totalBalance",
  total: "totalBalance",
  employeeytd: "employeeContribYtd",
  employeecontributionsytd: "employeeContribYtd",
  employeecontribytd: "employeeContribYtd",
  yourelectiveytd: "employeeContribYtd",
  serviceautoytd: "serviceAutoYtd",
  agencyautomaticytd: "serviceAutoYtd",
  agencyautoytd: "serviceAutoYtd",
  serviceautomaticytd: "serviceAutoYtd",
  servicematchytd: "serviceMatchYtd",
  agencymatchingytd: "serviceMatchYtd",
  agencymatchytd: "serviceMatchYtd",
  outstandingloan: "outstandingLoan",
  tsploan: "outstandingLoan",
  loanbalance: "outstandingLoan",
  gfund: "fund:G",
  ffund: "fund:F",
  cfund: "fund:C",
  sfund: "fund:S",
  ifund: "fund:I",
  g: "fund:G",
  f: "fund:F",
  c: "fund:C",
  s: "fund:S",
  i: "fund:I",
};

function normalizeKey(raw: string) {
  return raw
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[%$#]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function canonicalField(raw: string): string | "unknown" {
  const key = normalizeKey(raw);
  if (!key) return "unknown";
  if (FIELD_ALIASES[key]) return FIELD_ALIASES[key];

  const lifecycle = raw.trim().match(/^l\s*(income|\d{4})$/i);
  if (lifecycle) {
    const token = lifecycle[1].toUpperCase();
    return token === "INCOME" ? "fund:LINCOME" : `fund:L${token}`;
  }

  if (/^l(income|\d{4})$/i.test(key)) {
    return key.toUpperCase().startsWith("LINCOME")
      ? "fund:LINCOME"
      : `fund:${key.toUpperCase()}`;
  }

  return "unknown";
}

function parseMoneyToCents(raw: string): { ok: true; cents: number } | { ok: false } {
  const trimmed = raw.replace(/[\s]/g, "").replace(/^\$/, "");
  if (!trimmed) return { ok: false };
  if (!/^-?\d{1,3}(,\d{3})*(\.\d{1,2})?$|^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    return { ok: false };
  }
  const negative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^-/, "").replace(/,/g, "");
  const [whole, frac = ""] = unsigned.split(".");
  const frac2 = (frac + "00").slice(0, 2);
  const cents = Number(whole) * 100 + Number(frac2);
  if (!Number.isFinite(cents)) return { ok: false };
  return { ok: true, cents: negative ? -cents : cents };
}

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value
    .split("-")
    .map((part) => Number(part));

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseDate(raw: string): string | null {
  const value = raw.trim();

  if (validCalendarDate(value)) return value;

  const mdy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!mdy) return null;

  const normalized =
    `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;

  return validCalendarDate(normalized)
    ? normalized
    : null;
}

function detectSourceKind(
  text: string,
  filename: string
): TspStatementSourceKind {
  const lowerFilename =
    filename.trim().toLowerCase();

  if (lowerFilename.endsWith(".csv")) {
    return "csv";
  }

  if (
    lowerFilename.endsWith(".txt") ||
    lowerFilename.endsWith(".text")
  ) {
    return "structured_text";
  }

  const first = text
    .split(/\r?\n/)
    .find((line) => line.trim());

  if (!first) return "structured_text";

  const colonIndex = first.indexOf(":");
  const commaIndex = first.indexOf(",");

  if (
    colonIndex >= 0 &&
    (commaIndex < 0 || colonIndex < commaIndex)
  ) {
    return "structured_text";
  }

  return commaIndex >= 0
    ? "csv"
    : "structured_text";
}

function parseCsvLine(line: string) {
  const columns: string[] = [];
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
      columns.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  columns.push(current.trim());
  return columns;
}

function parseCsvRecords(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [] as Array<{ key: string; value: string }>;
  }

  const header = parseCsvLine(lines[0]);
  const headerNorm = header.map(normalizeKey);
  const fieldValueShape =
    header.length >= 2 &&
    (
      headerNorm[0] === "field" ||
      headerNorm[0] === "label" ||
      headerNorm[0] === "name"
    ) &&
    (
      headerNorm[1] === "value" ||
      headerNorm[1] === "amount" ||
      headerNorm[1] === "balance"
    );

  if (fieldValueShape) {
    return lines.slice(1).map((line) => {
      const cols = parseCsvLine(line);

      return {
        key: (cols[0] ?? "").trim(),
        // A human-exported field,value file sometimes leaves thousands
        // separators unquoted. Preserve the remainder as the value.
        value: cols.slice(1).join(",").trim(),
      };
    });
  }

  if (lines.length === 2 && header.length > 1) {
    const values = parseCsvLine(lines[1]);

    return header.map((key, index) => ({
      key,
      value: values[index] ?? "",
    }));
  }

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);

    return {
      key: (cols[0] ?? "").trim(),
      value: cols.slice(1).join(",").trim(),
    };
  });
}

function parseStructuredRecords(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.split(/[:\t]/);
      if (colon.length >= 2) {
        return {
          key: colon[0].trim(),
          value: colon.slice(1).join(":").trim(),
        };
      }
      return { key: line, value: "" };
    });
}

function emptyCandidate(): TspStatementCandidate {
  return {
    statementDate: null,
    traditionalBalanceCents: null,
    rothBalanceCents: null,
    totalBalanceCents: null,
    funds: [],
    employeeContribYtdCents: null,
    serviceAutoYtdCents: null,
    serviceMatchYtdCents: null,
    outstandingLoanCents: null,
  };
}

export function parseTspStatement(
  source: string,
  filename = ""
): TspStatementParseResult {
  const errors: TspStatementIssue[] = [];
  const warnings: TspStatementIssue[] = [];
  const unknownFields: string[] = [];
  const seen = new Map<string, string>();
  const candidate = emptyCandidate();
  const text = String(source ?? "");

  if (!text.trim()) {
    errors.push({
      code: "empty_source",
      field: null,
      message: "Statement file is empty.",
    });
  }

  const sourceKind = detectSourceKind(
    text,
    filename
  );
  const records =
    sourceKind === "csv"
      ? parseCsvRecords(text)
      : parseStructuredRecords(text);

  for (const record of records) {
    const field = canonicalField(record.key);
    if (field === "unknown") {
      if (record.key.trim()) unknownFields.push(record.key.trim());
      continue;
    }

    if (seen.has(field) && seen.get(field) !== record.value) {
      errors.push({
        code: "duplicate_field",
        field,
        message: `Field ${field} appeared more than once with different values.`,
      });
      continue;
    }
    seen.set(field, record.value);

    if (field === "statementDate") {
      const date = parseDate(record.value);
      if (!date) {
        errors.push({
          code: "malformed_date",
          field,
          message: `Could not parse statement date '${record.value}'.`,
        });
      } else {
        candidate.statementDate = date;
      }
      continue;
    }

    if (field.startsWith("fund:")) {
      const money = parseMoneyToCents(record.value);
      if (!money.ok) {
        errors.push({
          code: "malformed_number",
          field,
          message: `Could not parse fund balance '${record.value}'.`,
        });
        continue;
      }
      const fundCode = field.slice(5);
      candidate.funds.push({
        fundCode,
        fundName: record.key.trim(),
        balanceCents: money.cents,
      });
      continue;
    }

    const money = parseMoneyToCents(record.value);
    if (!money.ok) {
      errors.push({
        code: "malformed_number",
        field,
        message: `Could not parse amount '${record.value}'.`,
      });
      continue;
    }

    if (field === "traditionalBalance") candidate.traditionalBalanceCents = money.cents;
    if (field === "rothBalance") candidate.rothBalanceCents = money.cents;
    if (field === "totalBalance") candidate.totalBalanceCents = money.cents;
    if (field === "employeeContribYtd") candidate.employeeContribYtdCents = money.cents;
    if (field === "serviceAutoYtd") candidate.serviceAutoYtdCents = money.cents;
    if (field === "serviceMatchYtd") candidate.serviceMatchYtdCents = money.cents;
    if (field === "outstandingLoan") candidate.outstandingLoanCents = money.cents;
  }

  if (!candidate.statementDate) {
    warnings.push({
      code: "missing_statement_date",
      field: "statementDate",
      message: "Statement date is missing.",
    });
  }

  let traditionalRothVsTotalCents: number | null = null;
  let traditionalRothVsTotalOk: boolean | null = null;
  if (
    candidate.traditionalBalanceCents != null &&
    candidate.rothBalanceCents != null &&
    candidate.totalBalanceCents != null
  ) {
    traditionalRothVsTotalCents =
      candidate.traditionalBalanceCents +
      candidate.rothBalanceCents -
      candidate.totalBalanceCents;
    traditionalRothVsTotalOk =
      Math.abs(traditionalRothVsTotalCents) <= ROUNDING_CENTS;
    if (!traditionalRothVsTotalOk) {
      errors.push({
        code: "reconciliation_traditional_roth",
        field: "totalBalance",
        message:
          "Traditional + Roth does not reconcile to total balance within $1.00.",
      });
    }
  }

  let fundsVsTotalCents: number | null = null;
  let fundsVsTotalOk: boolean | null = null;
  if (candidate.funds.length && candidate.totalBalanceCents != null) {
    const fundTotal = candidate.funds.reduce(
      (sum, fund) => sum + fund.balanceCents,
      0
    );
    fundsVsTotalCents = fundTotal - candidate.totalBalanceCents;
    fundsVsTotalOk = Math.abs(fundsVsTotalCents) <= ROUNDING_CENTS;
    if (!fundsVsTotalOk) {
      errors.push({
        code: "reconciliation_funds",
        field: "funds",
        message:
          "Fund balances do not reconcile to total balance within $1.00.",
      });
    }
  }


  return {
    parserVersion: TSP_STATEMENT_PARSER_VERSION,
    sourceKind,
    confirmed: false,
    ok: errors.length === 0,
    candidate,
    warnings,
    errors,
    reconciliation: {
      traditionalRothVsTotalCents,
      traditionalRothVsTotalOk,
      fundsVsTotalCents,
      fundsVsTotalOk,
    },
    unknownFields,
  };
}
