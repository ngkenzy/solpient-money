"use server";

import { revalidatePath } from "next/cache";
import { requireActiveHousehold } from "@/lib/money-auth";

function numberField(
  formData: FormData,
  key: string,
  min: number,
  max: number
) {
  const parsed = Number(String(formData.get(key) ?? ""));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function dollarsToCents(value: number) {
  return Math.round(value * 100);
}

export async function updatePlanPolicy(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();

  const emergencyFundTargetMonths = numberField(
    formData,
    "emergency_fund_target_months",
    0,
    60
  );
  const highInterestDebtAprPct = numberField(
    formData,
    "high_interest_debt_apr_pct",
    0,
    100
  );
  const targetRetirementAge = numberField(
    formData,
    "target_retirement_age",
    19,
    100
  );
  const expectedAnnualReturnPct = numberField(
    formData,
    "expected_annual_return_pct",
    -50,
    50
  );
  const targetRetirementAssets = numberField(
    formData,
    "target_retirement_assets",
    0,
    1000000000
  );

  const { error } = await supabase
    .from("planning_assumptions")
    .upsert(
      {
        household_id: householdId,
        emergency_fund_target_months: emergencyFundTargetMonths,
        high_interest_debt_apr_pct: highInterestDebtAprPct,
        target_retirement_age: Math.round(targetRetirementAge),
        expected_annual_return_pct: expectedAnnualReturnPct,
        target_retirement_assets_cents: dollarsToCents(
          targetRetirementAssets
        ),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "household_id" }
    );

  if (error) throw new Error(error.message);

  revalidatePath("/plan");
  revalidatePath("/health");
  revalidatePath("/retirement");
  revalidatePath("/debt");
  revalidatePath("/scenario-lab");
  revalidatePath("/copilot");
  revalidatePath("/", "layout");
}
