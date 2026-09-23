"use server";

import { revalidatePath } from "next/cache";
import { requireActiveHousehold } from "@/lib/money-auth";
import { syncTspSharePrices } from "@/lib/tsp-prices";

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

type FundRevisionInput = {
  fund_code: string;
  fund_name: string;
  balance_cents: number;
};

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

  const fundRows: FundRevisionInput[] = CORE_FUNDS.flatMap(([code, name]) => {
    const cents = dollarsToCents(formData.get(`fund${code}`));
    return cents > 0
      ? [
          {
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
      fund_code: lifecycleCode.startsWith("L")
        ? lifecycleCode.replaceAll(" ", "")
        : `L${lifecycleCode.replaceAll(" ", "")}`,
      fund_name: `Lifecycle Fund ${lifecycleCode}`,
      balance_cents: lifecycleCents,
    });
  }

  const {
    data: revisionRows,
    error: revisionError,
  } = await supabase.rpc(
    "insert_tsp_snapshot_revision",
    {
      p_household_id: householdId,
      p_snapshot_date: snapshotDate,
      p_traditional_balance_cents: dollarsToCents(
        formData.get("traditionalBalance")
      ),
      p_roth_balance_cents: dollarsToCents(
        formData.get("rothBalance")
      ),
      p_outstanding_loan_cents: dollarsToCents(
        formData.get("outstandingLoan")
      ),
      p_employee_contrib_ytd_cents: dollarsToCents(
        formData.get("employeeContribYtd")
      ),
      p_service_auto_ytd_cents: dollarsToCents(
        formData.get("serviceAutoYtd")
      ),
      p_service_match_ytd_cents: dollarsToCents(
        formData.get("serviceMatchYtd")
      ),
      p_note:
        String(formData.get("note") ?? "").trim().slice(0, 2000) || null,
      p_funds_json: JSON.stringify(fundRows),
    }
  );

  if (revisionError || !revisionRows?.[0]?.snapshot_id) {
    throw new Error(
      `Unable to save atomic TSP snapshot revision: ${revisionError?.message ?? "No snapshot revision returned."}`
    );
  }

  revalidatePath("/tsp");
}


export async function syncTspPricesNow() {
  const result = await syncTspSharePrices(
    new Date()
  );

  if (!result.ok) {
    throw new Error(
      result.warning ??
        "Unable to sync official TSP share prices."
    );
  }

  revalidatePath("/tsp");
  revalidatePath("/autopilot");
  revalidatePath("/action-center");
}
