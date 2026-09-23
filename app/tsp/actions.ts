"use server";

import { revalidatePath } from "next/cache";
import { requireActiveHousehold } from "@/lib/money-auth";

function dollarsToCents(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function percent(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function optionalInt(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function optionalDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export async function saveTspProfile(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();

  const retirementSystem = String(
    formData.get("retirementSystem") ?? "unknown"
  );
  const serviceComponent = String(
    formData.get("serviceComponent") ?? "active"
  );

  const { error } = await supabase
    .from("tsp_profiles")
    .upsert(
      {
        household_id: householdId,
        linked_account_id: null,
        retirement_system: ["brs", "legacy", "unknown"].includes(
          retirementSystem
        )
          ? retirementSystem
          : "unknown",
        service_component: ["active", "reserve", "guard", "other"].includes(
          serviceComponent
        )
          ? serviceComponent
          : "other",
        service_entry_date: optionalDate(formData.get("serviceEntryDate")),
        age_at_year_end: optionalInt(formData.get("ageAtYearEnd")),
        annual_basic_pay_cents: dollarsToCents(
          formData.get("annualBasicPay")
        ),
        traditional_contribution_pct: percent(
          formData.get("traditionalContributionPct")
        ),
        roth_contribution_pct: percent(
          formData.get("rothContributionPct")
        ),
        external_deferrals_ytd_cents: dollarsToCents(
          formData.get("externalDeferralsYtd")
        ),
        prior_year_plan_wages_cents: dollarsToCents(
          formData.get("priorYearPlanWages")
        ),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "household_id" }
    );

  if (error) {
    throw new Error(
      `Unable to save TSP profile: ${error.message}`
    );
  }

  revalidatePath("/tsp");
}

const CORE_FUNDS = [
  ["G", "Government Securities Investment Fund"],
  ["F", "Fixed Income Index Investment Fund"],
  ["C", "Common Stock Index Investment Fund"],
  ["S", "Small Capitalization Stock Index Investment Fund"],
  ["I", "International Stock Index Investment Fund"],
] as const;

export async function saveTspSnapshot(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();

  const snapshotDate = String(
    formData.get("snapshotDate") ?? ""
  ).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    throw new Error("Enter a valid TSP snapshot date.");
  }

  const { data: saved, error } = await supabase
    .from("tsp_snapshots")
    .upsert(
      {
        household_id: householdId,
        snapshot_date: snapshotDate,
        traditional_balance_cents: dollarsToCents(
          formData.get("traditionalBalance")
        ),
        roth_balance_cents: dollarsToCents(
          formData.get("rothBalance")
        ),
        outstanding_loan_cents: dollarsToCents(
          formData.get("outstandingLoan")
        ),
        employee_contrib_ytd_cents: dollarsToCents(
          formData.get("employeeContribYtd")
        ),
        service_auto_ytd_cents: dollarsToCents(
          formData.get("serviceAutoYtd")
        ),
        service_match_ytd_cents: dollarsToCents(
          formData.get("serviceMatchYtd")
        ),
        note:
          String(formData.get("note") ?? "").trim().slice(0, 2000) || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "household_id,snapshot_date" }
    )
    .select("id")
    .single();

  if (error || !saved?.id) {
    throw new Error(
      `Unable to save TSP snapshot: ${error?.message ?? "No snapshot id returned."}`
    );
  }

  const snapshotId = String(saved.id);

  const { error: deleteError } = await supabase
    .from("tsp_fund_positions")
    .delete()
    .eq("household_id", householdId)
    .eq("snapshot_id", snapshotId);

  if (deleteError) {
    throw new Error(
      `Unable to refresh TSP fund allocation: ${deleteError.message}`
    );
  }

  const fundRows = CORE_FUNDS.flatMap(([code, name]) => {
    const cents = dollarsToCents(formData.get(`fund${code}`));
    return cents > 0
      ? [
          {
            household_id: householdId,
            snapshot_id: snapshotId,
            fund_code: code,
            fund_name: name,
            balance_cents: cents,
          },
        ]
      : [];
  });

  const lifecycleCode = String(
    formData.get("lifecycleCode") ?? ""
  )
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .slice(0, 24);
  const lifecycleCents = dollarsToCents(
    formData.get("lifecycleBalance")
  );

  if (lifecycleCode && lifecycleCents > 0) {
    fundRows.push({
      household_id: householdId,
      snapshot_id: snapshotId,
      fund_code: lifecycleCode.startsWith("L")
        ? lifecycleCode.replaceAll(" ", "")
        : `L${lifecycleCode.replaceAll(" ", "")}`,
      fund_name: `Lifecycle Fund ${lifecycleCode}`,
      balance_cents: lifecycleCents,
    });
  }

  if (fundRows.length) {
    const { error: fundError } = await supabase
      .from("tsp_fund_positions")
      .insert(fundRows);

    if (fundError) {
      throw new Error(
        `Unable to save TSP fund allocation: ${fundError.message}`
      );
    }
  }

  revalidatePath("/tsp");
}
