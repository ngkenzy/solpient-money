import type {
  NormalizedConnectorAccount,
  NormalizedConnectorHolding,
  NormalizedConnectorTransaction,
} from "@/lib/connect/sdk";

type Json = Record<string, unknown>;

function str(
  value: unknown,
  fallback = ""
) {
  return typeof value === "string"
    ? value
    : fallback;
}

function num(
  value: unknown,
  fallback = 0
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function list(value: unknown): Json[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Json =>
          Boolean(item) &&
          typeof item === "object" &&
          !Array.isArray(item)
      )
    : [];
}

function accountType(value: unknown) {
  const raw = str(value).toLowerCase();
  if (
    raw.includes("investment") ||
    raw.includes("broker") ||
    raw.includes("securities")
  ) {
    return "investment" as const;
  }
  if (
    raw.includes("401") ||
    raw.includes("403") ||
    raw.includes("ira") ||
    raw.includes("retirement") ||
    raw.includes("pension")
  ) {
    return "retirement" as const;
  }
  if (
    raw.includes("credit") ||
    raw.includes("loan") ||
    raw.includes("mortgage") ||
    raw.includes("line")
  ) {
    return "debt" as const;
  }
  return "cash" as const;
}

function transactionType(
  amount: number,
  description: string
) {
  if (
    /transfer|payment|xfer/i.test(description)
  ) {
    return "transfer" as const;
  }
  return amount >= 0
    ? ("income" as const)
    : ("expense" as const);
}

export function extractFdxAccounts(
  payload: Json,
  connectorId = "fdx",
  instanceId = "preview"
): NormalizedConnectorAccount[] {
  const rows =
    list(payload.accounts).length > 0
      ? list(payload.accounts)
      : list(payload.items);

  const observedAt = new Date().toISOString();

  return rows.flatMap((row) => {
    const externalId =
      str(row.accountId) ||
      str(row.account_id) ||
      str(row.id);
    if (!externalId) return [];

    const type =
      row.accountType ??
      row.accountCategory ??
      row.type;
    const mappedType = accountType(type);

    const rawBalance =
      row.currentBalance ??
      row.balance ??
      row.availableBalance ??
      row.ledgerBalance ??
      0;
    const balance = num(rawBalance);

    return [{
      externalId,
      name:
        str(row.nickname) ||
        str(row.productName) ||
        str(row.displayName) ||
        str(row.name) ||
        "FDX account",
      institution:
        str(row.institutionName) ||
        str(payload.institutionName) ||
        "FDX institution",
      accountType: mappedType,
      balance:
        mappedType === "debt"
          ? -Math.abs(balance)
          : balance,
      availableBalance:
        row.availableBalance == null
          ? null
          : num(row.availableBalance),
      lastFour:
        str(row.accountNumberDisplay) ||
        str(row.lastFour) ||
        null,
      provenance: {
        connectorId: connectorId as "fdx",
        instanceId,
        externalId,
        observedAt,
      },
    }];
  });
}

export function extractFdxTransactions(
  payload: Json,
  accountExternalId: string,
  instanceId: string
): NormalizedConnectorTransaction[] {
  const rows =
    list(payload.transactions).length > 0
      ? list(payload.transactions)
      : list(payload.items);
  const observedAt = new Date().toISOString();

  return rows.flatMap((row) => {
    const externalId =
      str(row.transactionId) ||
      str(row.transaction_id) ||
      str(row.id);
    if (!externalId) return [];

    const amount = num(
      row.amount ?? row.transactionAmount
    );
    const description =
      str(row.description) ||
      str(row.memo) ||
      str(row.merchantName) ||
      "FDX transaction";
    const posted =
      str(row.postedTimestamp) ||
      str(row.postedDate) ||
      str(row.transactionTimestamp) ||
      str(row.date);

    return [{
      externalId,
      accountExternalId,
      postedAt: posted
        ? posted.slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      merchant: description,
      category:
        str(row.category) ||
        str(row.transactionType) ||
        "Uncategorized",
      amount,
      type: transactionType(
        amount,
        description
      ),
      provenance: {
        connectorId: "fdx",
        instanceId,
        externalId,
        observedAt,
      },
    }];
  });
}

export function extractFdxHoldings(
  payload: Json,
  accountExternalId: string,
  instanceId: string
): NormalizedConnectorHolding[] {
  const investmentAccount =
    payload.investmentAccount &&
    typeof payload.investmentAccount === "object"
      ? (payload.investmentAccount as Json)
      : null;
  const rows =
    list(payload.holdings).length > 0
      ? list(payload.holdings)
      : investmentAccount
        ? list(investmentAccount.holdings)
        : [];

  const observedAt = new Date().toISOString();

  return rows.flatMap((row) => {
    const ticker =
      str(row.symbol).toUpperCase() ||
      str(row.ticker).toUpperCase();
    if (!ticker) return [];

    const externalId =
      str(row.securityId) ||
      str(row.security_id) ||
      ticker;
    const shares = num(
      row.units ?? row.shares ?? row.quantity
    );
    const price = num(
      row.unitPrice ?? row.price
    );
    const marketValue = num(
      row.marketValue,
      shares * price
    );

    return [{
      externalId,
      accountExternalId,
      ticker,
      name:
        str(row.securityName) ||
        str(row.description) ||
        ticker,
      kind:
        /fund|etf/i.test(
          str(row.securityType)
        )
          ? "etf"
          : /bond|fixed/i.test(
                str(row.securityType)
              )
            ? "bond"
            : /cash/i.test(
                  str(row.securityType)
                )
              ? "cash"
              : "stock",
      shares,
      price,
      marketValue,
      costBasis:
        row.costBasis == null
          ? null
          : num(row.costBasis),
      provenance: {
        connectorId: "fdx",
        instanceId,
        externalId,
        observedAt,
      },
    }];
  });
}
