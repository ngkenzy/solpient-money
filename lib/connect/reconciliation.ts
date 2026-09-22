import type { ParsedFinancialFile } from "@/lib/connect/file-parser";

export type ReconciliationStatus =
  | "matched"
  | "attention"
  | "captured"
  | "estimated"
  | "unavailable";

export type ConnectAnomaly = {
  code:
    | "high_duplicate_ratio"
    | "reconciliation_gap"
    | "large_balance_jump"
    | "future_dated_rows"
    | "zero_value_rows"
    | "parser_warnings";
  severity: "info" | "warning";
  message: string;
};

export type ConnectAnalysis = {
  statementBalance: number | null;
  projectedBalance: number | null;
  postImportBalance: number | null;
  reconciliationDelta: number | null;
  reconciliationStatus: ReconciliationStatus;
  anomalies: ConnectAnomaly[];
};

function toleranceFor(balance: number) {
  return Math.max(5, Math.abs(balance) * 0.005);
}

export function analyzeConnectImport({
  parsed,
  currentBalance,
  targetExists,
  newTransactionNet,
  duplicateCount,
  totalRecords,
  today = new Date().toISOString().slice(0, 10),
}: {
  parsed: ParsedFinancialFile;
  currentBalance: number | null;
  targetExists: boolean;
  newTransactionNet: number;
  duplicateCount: number;
  totalRecords: number;
  today?: string;
}): ConnectAnalysis {
  const anomalies: ConnectAnomaly[] = [];
  const statementBalance =
    parsed.closingBalance == null ? null : Number(parsed.closingBalance);

  let projectedBalance: number | null = null;
  if (parsed.kind === "holdings") {
    projectedBalance = parsed.holdings.reduce(
      (sum, holding) => sum + holding.marketValue,
      0
    );
  } else if (targetExists && currentBalance != null) {
    projectedBalance = currentBalance + newTransactionNet;
  } else if (parsed.openingBalance != null) {
    projectedBalance = parsed.openingBalance + newTransactionNet;
  }

  const postImportBalance =
    statementBalance ?? projectedBalance ?? currentBalance ?? null;

  let reconciliationDelta: number | null = null;
  let reconciliationStatus: ReconciliationStatus = "unavailable";

  if (statementBalance != null && projectedBalance != null) {
    reconciliationDelta = projectedBalance - statementBalance;
    reconciliationStatus =
      Math.abs(reconciliationDelta) <= toleranceFor(statementBalance)
        ? "matched"
        : "attention";
  } else if (statementBalance != null) {
    reconciliationStatus = "captured";
  } else if (projectedBalance != null) {
    reconciliationStatus = "estimated";
  }

  if (totalRecords > 0 && duplicateCount / totalRecords >= 0.5) {
    anomalies.push({
      code: "high_duplicate_ratio",
      severity: "info",
      message: `${duplicateCount} of ${totalRecords} rows appear to be duplicates.`,
    });
  }

  if (
    reconciliationStatus === "attention" &&
    reconciliationDelta != null &&
    statementBalance != null
  ) {
    anomalies.push({
      code: "reconciliation_gap",
      severity: "warning",
      message: `Projected activity differs from the statement balance by ${Math.abs(reconciliationDelta).toFixed(2)}.`,
    });
  }

  if (
    targetExists &&
    currentBalance != null &&
    statementBalance != null &&
    Math.abs(statementBalance - currentBalance) >= 1000 &&
    Math.abs(statementBalance - currentBalance) /
      Math.max(Math.abs(currentBalance), 1) >=
      0.5
  ) {
    anomalies.push({
      code: "large_balance_jump",
      severity: "warning",
      message:
        "The statement balance changes this account by more than 50%. Review the account and date range before importing.",
    });
  }

  if (parsed.kind === "transactions") {
    const futureRows = parsed.transactions.filter(
      (transaction) => transaction.postedAt > today
    ).length;
    if (futureRows > 0) {
      anomalies.push({
        code: "future_dated_rows",
        severity: "warning",
        message: `${futureRows} transaction${futureRows === 1 ? "" : "s"} have a future posting date.`,
      });
    }

    const zeroRows = parsed.transactions.filter(
      (transaction) => Math.abs(transaction.amount) < 0.000001
    ).length;
    if (zeroRows > 0) {
      anomalies.push({
        code: "zero_value_rows",
        severity: "info",
        message: `${zeroRows} transaction${zeroRows === 1 ? "" : "s"} have a zero amount.`,
      });
    }
  } else {
    const zeroRows = parsed.holdings.filter(
      (holding) =>
        Math.abs(holding.marketValue) < 0.000001 &&
        Math.abs(holding.shares) < 0.000001
    ).length;
    if (zeroRows > 0) {
      anomalies.push({
        code: "zero_value_rows",
        severity: "info",
        message: `${zeroRows} holding${zeroRows === 1 ? "" : "s"} have zero shares and zero value.`,
      });
    }
  }

  if (parsed.warnings.length > 0) {
    anomalies.push({
      code: "parser_warnings",
      severity: "info",
      message: `${parsed.warnings.length} parser warning${parsed.warnings.length === 1 ? "" : "s"} should be reviewed.`,
    });
  }

  return {
    statementBalance,
    projectedBalance,
    postImportBalance,
    reconciliationDelta,
    reconciliationStatus,
    anomalies,
  };
}
