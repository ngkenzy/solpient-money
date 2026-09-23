import "server-only";

import { createHash } from "node:crypto";
import { requireActiveHousehold } from "@/lib/money-auth";
import type { TspStatementIssue } from "@/lib/tsp-statement-types";

export type TspStatementFundInput = {
  fundCode: string;
  fundName: string;
  balanceCents: number;
};

export type TspStatementReviewValues = {
  statementDate: string | null;
  traditionalBalanceCents: number | null;
  rothBalanceCents: number | null;
  reportedTotalBalanceCents: number | null;
  outstandingLoanCents: number | null;
  employeeContribYtdCents: number | null;
  serviceAutoYtdCents: number | null;
  serviceMatchYtdCents: number | null;
  funds: TspStatementFundInput[];
};

export type StageTspStatementImportInput = {
  sourceKind: "csv" | "structured_text" | "pdf" | "other";
  sourceFilename?: string | null;
  sourceContent: string | Uint8Array;
  parserVersion: string;
  parsedStatementDate?: string | null;
  parsedCandidate: unknown;
  parserWarnings?: TspStatementIssue[];
  parserErrors?: TspStatementIssue[];
  review: TspStatementReviewValues;
};

export type TspStatementImportRecord = {
  id: string;
  sourceKind: string;
  sourceFilename: string | null;
  sourceContentSha256: string;
  sourceSizeBytes: number | null;
  parserVersion: string;
  parsedStatementDate: string | null;
  parsedCandidate: unknown;
  parserWarnings: TspStatementIssue[];
  parserErrors: TspStatementIssue[];
  review: TspStatementReviewValues;
  balanceReconciliationDeltaCents: number | null;
  fundReconciliationDeltaCents: number | null;
  reviewNote: string | null;
  validationState:
    | "invalid"
    | "review_required"
    | "ready"
    | "confirmed"
    | "rejected";
  confirmedSnapshotId: string | null;
  confirmedSnapshotRevision: number | null;
  importedAt: string | null;
  reviewedAt: string | null;
  confirmedAt: string | null;
};

type Row = Record<string, unknown>;

function n(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function jsonValue(value: unknown, fallback: unknown) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function issueArray(value: unknown): TspStatementIssue[] {
  const parsed = jsonValue(value, []);

  if (!Array.isArray(parsed)) return [];

  return parsed.map((item) => {
    if (
      item &&
      typeof item === "object"
    ) {
      const row =
        item as Record<string, unknown>;

      return {
        code: String(row.code ?? "unknown"),
        field:
          row.field == null
            ? null
            : String(row.field),
        message: String(
          row.message ?? row.code ?? "Unknown parser issue"
        ),
      };
    }

    return {
      code: "legacy_issue",
      field: null,
      message: String(item),
    };
  });
}

function normalizeFunds(value: unknown): TspStatementFundInput[] {
  const parsed = jsonValue(value, []);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];

    const row = item as Record<string, unknown>;
    const fundCode = String(
      row.fund_code ?? row.fundCode ?? ""
    )
      .trim()
      .toUpperCase();
    const fundName = String(
      row.fund_name ?? row.fundName ?? fundCode
    ).trim();
    const balanceCents = Number(
      row.balance_cents ?? row.balanceCents
    );

    if (
      !fundCode ||
      !Number.isFinite(balanceCents) ||
      balanceCents < 0
    ) {
      return [];
    }

    return [
      {
        fundCode,
        fundName: fundName || fundCode,
        balanceCents: Math.round(balanceCents),
      },
    ];
  });
}

export function reconcileTspStatementReview(
  review: TspStatementReviewValues
) {
  const accountBalance =
    review.traditionalBalanceCents != null &&
    review.rothBalanceCents != null
      ? review.traditionalBalanceCents +
        review.rothBalanceCents
      : null;

  const balanceDelta =
    accountBalance != null &&
    review.reportedTotalBalanceCents != null
      ? accountBalance -
        review.reportedTotalBalanceCents
      : null;

  const fundTotal =
    review.funds.length > 0
      ? review.funds.reduce(
          (sum, fund) => sum + fund.balanceCents,
          0
        )
      : null;

  const fundDelta =
    accountBalance != null && fundTotal != null
      ? fundTotal - accountBalance
      : null;

  const requiredResolved = [
    review.statementDate,
    review.traditionalBalanceCents,
    review.rothBalanceCents,
    review.outstandingLoanCents,
    review.employeeContribYtdCents,
    review.serviceAutoYtdCents,
    review.serviceMatchYtdCents,
  ].every((value) => value != null);

  const reconciles =
    (balanceDelta == null ||
      Math.abs(balanceDelta) <= 100) &&
    fundDelta != null &&
    Math.abs(fundDelta) <= 100;

  return {
    accountBalanceCents: accountBalance,
    fundTotalCents: fundTotal,
    balanceDeltaCents: balanceDelta,
    fundDeltaCents: fundDelta,
    ready:
      requiredResolved &&
      review.funds.length > 0 &&
      reconciles,
  };
}

function recordFromRow(row: Row): TspStatementImportRecord {
  return {
    id: String(row.id ?? ""),
    sourceKind: String(row.source_kind ?? ""),
    sourceFilename:
      row.source_filename == null
        ? null
        : String(row.source_filename),
    sourceContentSha256: String(
      row.source_content_sha256 ?? ""
    ),
    sourceSizeBytes: n(row.source_size_bytes),
    parserVersion: String(row.parser_version ?? ""),
    parsedStatementDate: dateOnly(
      row.parsed_statement_date
    ),
    parsedCandidate: jsonValue(
      row.parsed_candidate,
      {}
    ),
    parserWarnings: issueArray(
      row.parser_warnings
    ),
    parserErrors: issueArray(
      row.parser_errors
    ),
    review: {
      statementDate: dateOnly(
        row.review_statement_date
      ),
      traditionalBalanceCents: n(
        row.review_traditional_balance_cents
      ),
      rothBalanceCents: n(
        row.review_roth_balance_cents
      ),
      reportedTotalBalanceCents: n(
        row.review_reported_total_balance_cents
      ),
      outstandingLoanCents: n(
        row.review_outstanding_loan_cents
      ),
      employeeContribYtdCents: n(
        row.review_employee_contrib_ytd_cents
      ),
      serviceAutoYtdCents: n(
        row.review_service_auto_ytd_cents
      ),
      serviceMatchYtdCents: n(
        row.review_service_match_ytd_cents
      ),
      funds: normalizeFunds(row.review_funds),
    },
    balanceReconciliationDeltaCents: n(
      row.balance_reconciliation_delta_cents
    ),
    fundReconciliationDeltaCents: n(
      row.fund_reconciliation_delta_cents
    ),
    reviewNote:
      row.review_note == null
        ? null
        : String(row.review_note),
    validationState:
      String(
        row.validation_state ?? "review_required"
      ) as TspStatementImportRecord["validationState"],
    confirmedSnapshotId:
      row.confirmed_snapshot_id == null
        ? null
        : String(row.confirmed_snapshot_id),
    confirmedSnapshotRevision: n(
      row.confirmed_snapshot_revision
    ),
    importedAt:
      row.imported_at == null
        ? null
        : String(row.imported_at),
    reviewedAt:
      row.reviewed_at == null
        ? null
        : String(row.reviewed_at),
    confirmedAt:
      row.confirmed_at == null
        ? null
        : String(row.confirmed_at),
  };
}

function sourceBytes(
  value: string | Uint8Array
): Uint8Array {
  return typeof value === "string"
    ? Buffer.from(value, "utf8")
    : value;
}

export async function stageTspStatementImport(
  input: StageTspStatementImportInput
) {
  const { supabase, householdId } =
    await requireActiveHousehold();

  const bytes = sourceBytes(input.sourceContent);
  const sourceContentSha256 = createHash(
    "sha256"
  )
    .update(bytes)
    .digest("hex");

  const { data: existing, error: existingError } =
    await supabase
      .from("tsp_statement_imports")
      .select("*")
      .eq("household_id", householdId)
      .eq(
        "source_content_sha256",
        sourceContentSha256
      )
      .maybeSingle();

  if (existingError) {
    throw new Error(
      `Unable to check prior TSP statement import: ${existingError.message}`
    );
  }

  if (existing) {
    return {
      record: recordFromRow(existing as Row),
      duplicate: true,
    };
  }

  const normalizedReview: TspStatementReviewValues = {
    ...input.review,
    funds: normalizeFunds(input.review.funds),
  };
  const reconciliation =
    reconcileTspStatementReview(normalizedReview);

  const parserErrors =
    input.parserErrors ?? [];
  const validationState =
    parserErrors.length > 0
      ? "invalid"
      : reconciliation.ready
        ? "ready"
        : "review_required";

  const { data, error } = await supabase
    .from("tsp_statement_imports")
    .insert({
      household_id: householdId,
      source_kind: input.sourceKind,
      source_filename:
        input.sourceFilename?.trim() || null,
      source_content_sha256: sourceContentSha256,
      source_size_bytes: bytes.byteLength,
      parser_version: input.parserVersion,
      parsed_statement_date:
        input.parsedStatementDate ?? null,
      parsed_candidate: input.parsedCandidate,
      parser_warnings:
        input.parserWarnings ?? [],
      parser_errors: parserErrors,
      review_statement_date:
        normalizedReview.statementDate,
      review_traditional_balance_cents:
        normalizedReview.traditionalBalanceCents,
      review_roth_balance_cents:
        normalizedReview.rothBalanceCents,
      review_reported_total_balance_cents:
        normalizedReview.reportedTotalBalanceCents,
      review_outstanding_loan_cents:
        normalizedReview.outstandingLoanCents,
      review_employee_contrib_ytd_cents:
        normalizedReview.employeeContribYtdCents,
      review_service_auto_ytd_cents:
        normalizedReview.serviceAutoYtdCents,
      review_service_match_ytd_cents:
        normalizedReview.serviceMatchYtdCents,
      review_funds: normalizedReview.funds.map(
        (fund) => ({
          fund_code: fund.fundCode,
          fund_name: fund.fundName,
          balance_cents: fund.balanceCents,
        })
      ),
      balance_reconciliation_delta_cents:
        reconciliation.balanceDeltaCents,
      fund_reconciliation_delta_cents:
        reconciliation.fundDeltaCents,
      validation_state: validationState,
    })
    .select("*")
    .single();

  if (error || !data) {
    const { data: duplicate } = await supabase
      .from("tsp_statement_imports")
      .select("*")
      .eq("household_id", householdId)
      .eq(
        "source_content_sha256",
        sourceContentSha256
      )
      .maybeSingle();

    if (duplicate) {
      return {
        record: recordFromRow(
          duplicate as Row
        ),
        duplicate: true,
      };
    }

    throw new Error(
      `Unable to stage TSP statement import: ${error?.message ?? "No import returned."}`
    );
  }

  return {
    record: recordFromRow(data as Row),
    duplicate: false,
  };
}

export async function getTspStatementImports() {
  const { supabase, householdId } =
    await requireActiveHousehold();

  const { data, error } = await supabase
    .from("tsp_statement_imports")
    .select("*")
    .eq("household_id", householdId)
    .order("imported_at", {
      ascending: false,
    })
    .limit(24);

  if (error) {
    throw new Error(
      `Unable to load TSP statement imports: ${error.message}`
    );
  }

  return ((data ?? []) as Row[]).map(
    recordFromRow
  );
}

export async function getTspStatementImport(
  importId: string
) {
  const { supabase, householdId } =
    await requireActiveHousehold();

  const { data, error } = await supabase
    .from("tsp_statement_imports")
    .select("*")
    .eq("household_id", householdId)
    .eq("id", importId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load TSP statement import: ${error.message}`
    );
  }

  return data
    ? recordFromRow(data as Row)
    : null;
}
