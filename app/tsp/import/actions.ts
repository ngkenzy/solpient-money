"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveHousehold } from "@/lib/money-auth";
import { parseTspStatement } from "@/lib/tsp-statement-parser";
import {
  reconcileTspStatementReview,
  stageTspStatementImport,
  type TspStatementFundInput,
  type TspStatementReviewValues,
} from "@/lib/tsp-statement-imports";

const MAX_TSP_STATEMENT_BYTES = 2 * 1024 * 1024;

export async function uploadTspStatement(
  formData: FormData
) {
  const upload =
    formData.get("statementFile");

  if (!(upload instanceof File)) {
    throw new Error(
      "Choose a TSP statement file."
    );
  }

  if (upload.size <= 0) {
    throw new Error(
      "The selected TSP statement is empty."
    );
  }

  if (
    upload.size >
    MAX_TSP_STATEMENT_BYTES
  ) {
    throw new Error(
      "TSP statement files must be 2 MB or smaller."
    );
  }

  const filename =
    upload.name.trim() ||
    "tsp-statement.txt";
  const extension =
    filename
      .toLowerCase()
      .split(".")
      .at(-1) ?? "";

  if (
    extension !== "csv" &&
    extension !== "txt"
  ) {
    throw new Error(
      "V1.8 accepts CSV or structured-text TSP statements. PDF import is not enabled yet."
    );
  }

  const source = await upload.text();
  const parsed =
    parseTspStatement(
      source,
      filename
    );

  const candidate =
    parsed.candidate;

  const staged =
    await stageTspStatementImport({
      sourceKind:
        parsed.sourceKind,
      sourceFilename: filename,
      sourceContent: source,
      parserVersion:
        parsed.parserVersion,
      parsedStatementDate:
        candidate.statementDate,
      parsedCandidate: {
        candidate,
        reconciliation:
          parsed.reconciliation,
        unknownFields:
          parsed.unknownFields,
      },
      parserWarnings:
        parsed.warnings,
      parserErrors:
        parsed.errors,
      review: {
        statementDate:
          candidate.statementDate,
        traditionalBalanceCents:
          candidate.traditionalBalanceCents,
        rothBalanceCents:
          candidate.rothBalanceCents,
        reportedTotalBalanceCents:
          candidate.totalBalanceCents,
        outstandingLoanCents:
          candidate.outstandingLoanCents,
        employeeContribYtdCents:
          candidate.employeeContribYtdCents,
        serviceAutoYtdCents:
          candidate.serviceAutoYtdCents,
        serviceMatchYtdCents:
          candidate.serviceMatchYtdCents,
        funds:
          candidate.funds.map(
            (fund) => ({
              fundCode:
                fund.fundCode,
              fundName:
                fund.fundName ??
                fund.fundCode,
              balanceCents:
                fund.balanceCents,
            })
          ),
      },
    });

  revalidatePath("/tsp/import");

  redirect(
    `/tsp/import/${staged.record.id}`
  );
}

function optionalDollarsToCents(
  value: FormDataEntryValue | null
) {
  const raw = String(value ?? "")
    .trim()
    .replaceAll(",", "")
    .replaceAll("$", "");

  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

function optionalDate(
  value: FormDataEntryValue | null
) {
  const raw = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : null;
}

function importIdFrom(formData: FormData) {
  const importId = String(
    formData.get("importId") ?? ""
  ).trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      importId
    )
  ) {
    throw new Error(
      "Invalid TSP statement import id."
    );
  }

  return importId;
}

function reviewFundsFrom(
  formData: FormData
): TspStatementFundInput[] {
  const codes = formData
    .getAll("fundCode")
    .map((value) =>
      String(value).trim().toUpperCase()
    );
  const names = formData
    .getAll("fundName")
    .map((value) => String(value).trim());
  const balances =
    formData.getAll("fundBalance");

  return codes.flatMap((code, index) => {
    const balanceCents =
      optionalDollarsToCents(
        balances[index] ?? null
      );

    if (
      !code ||
      balanceCents == null
    ) {
      return [];
    }

    return [
      {
        fundCode: code,
        fundName:
          names[index] || code,
        balanceCents,
      },
    ];
  });
}

function reviewValuesFrom(
  formData: FormData
): TspStatementReviewValues {
  return {
    statementDate: optionalDate(
      formData.get("statementDate")
    ),
    traditionalBalanceCents:
      optionalDollarsToCents(
        formData.get("traditionalBalance")
      ),
    rothBalanceCents:
      optionalDollarsToCents(
        formData.get("rothBalance")
      ),
    reportedTotalBalanceCents:
      optionalDollarsToCents(
        formData.get("reportedTotalBalance")
      ),
    outstandingLoanCents:
      optionalDollarsToCents(
        formData.get("outstandingLoan")
      ),
    employeeContribYtdCents:
      optionalDollarsToCents(
        formData.get("employeeContribYtd")
      ),
    serviceAutoYtdCents:
      optionalDollarsToCents(
        formData.get("serviceAutoYtd")
      ),
    serviceMatchYtdCents:
      optionalDollarsToCents(
        formData.get("serviceMatchYtd")
      ),
    funds: reviewFundsFrom(formData),
  };
}

export async function saveTspStatementImportReview(
  formData: FormData
) {
  const { supabase, householdId } =
    await requireActiveHousehold();
  const importId = importIdFrom(formData);
  const review =
    reviewValuesFrom(formData);
  const reconciliation =
    reconcileTspStatementReview(review);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("tsp_statement_imports")
    .update({
      review_statement_date:
        review.statementDate,
      review_traditional_balance_cents:
        review.traditionalBalanceCents,
      review_roth_balance_cents:
        review.rothBalanceCents,
      review_reported_total_balance_cents:
        review.reportedTotalBalanceCents,
      review_outstanding_loan_cents:
        review.outstandingLoanCents,
      review_employee_contrib_ytd_cents:
        review.employeeContribYtdCents,
      review_service_auto_ytd_cents:
        review.serviceAutoYtdCents,
      review_service_match_ytd_cents:
        review.serviceMatchYtdCents,
      review_funds: review.funds.map(
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
      review_note:
        String(
          formData.get("reviewNote") ?? ""
        )
          .trim()
          .slice(0, 2000) || null,
      validation_state:
        reconciliation.ready
          ? "ready"
          : "review_required",
      reviewed_at: now,
      updated_at: now,
    })
    .eq("household_id", householdId)
    .eq("id", importId)
    .neq(
      "validation_state",
      "confirmed"
    );

  if (error) {
    throw new Error(
      `Unable to save TSP statement review: ${error.message}`
    );
  }

  revalidatePath("/tsp");
  revalidatePath("/tsp/import");
  revalidatePath(
    `/tsp/import/${importId}`
  );
}

export async function confirmTspStatementImport(
  formData: FormData
) {
  const { supabase } =
    await requireActiveHousehold();
  const importId = importIdFrom(formData);

  const { data, error } =
    await supabase.rpc(
      "confirm_tsp_statement_import",
      {
        p_import_id: importId,
      }
    );

  if (
    error ||
    !data?.[0]?.snapshot_id
  ) {
    throw new Error(
      `Unable to confirm TSP statement import: ${error?.message ?? "No snapshot revision returned."}`
    );
  }

  revalidatePath("/tsp");
  revalidatePath("/tsp/import");
  revalidatePath(
    `/tsp/import/${importId}`
  );

  redirect("/tsp");
}

export async function rejectTspStatementImport(
  formData: FormData
) {
  const { supabase, householdId } =
    await requireActiveHousehold();
  const importId = importIdFrom(formData);

  const { error } = await supabase
    .from("tsp_statement_imports")
    .update({
      validation_state: "rejected",
      reviewed_at:
        new Date().toISOString(),
      updated_at:
        new Date().toISOString(),
    })
    .eq("household_id", householdId)
    .eq("id", importId)
    .neq(
      "validation_state",
      "confirmed"
    );

  if (error) {
    throw new Error(
      `Unable to reject TSP statement import: ${error.message}`
    );
  }

  revalidatePath("/tsp/import");
  redirect("/tsp/import");
}
