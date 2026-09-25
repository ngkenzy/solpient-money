"use server";

import { revalidatePath } from "next/cache";
import { requireActiveHousehold } from "@/lib/money-auth";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function dollarsToCents(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Budget amounts must be valid non-negative numbers.");
  }
  return Math.round(parsed * 100);
}

function refresh() {
  revalidatePath("/budget");
  revalidatePath("/", "layout");
}

export async function createBudget(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const category = text(formData, "category");
  const amountCents = dollarsToCents(text(formData, "monthly_amount") || "0");
  const rollover = formData.get("rollover") === "on";

  if (!category) throw new Error("Category is required.");

  const { error } = await supabase.from("budget_categories").insert({
    household_id: householdId,
    category,
    monthly_amount_cents: amountCents,
    rollover,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error(`A budget for "${category}" already exists.`);
    }
    throw new Error(error.message);
  }
  refresh();
}

export async function updateBudget(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const budgetId = text(formData, "budget_id");
  const amountCents = dollarsToCents(text(formData, "monthly_amount") || "0");
  const rollover = formData.get("rollover") === "on";

  if (!budgetId) throw new Error("Budget is required.");

  const { error } = await supabase
    .from("budget_categories")
    .update({
      monthly_amount_cents: amountCents,
      rollover,
      updated_at: new Date().toISOString(),
    })
    .eq("id", budgetId)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteBudget(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const budgetId = text(formData, "budget_id");

  if (!budgetId) throw new Error("Budget is required.");

  const { error } = await supabase
    .from("budget_categories")
    .delete()
    .eq("id", budgetId)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);
  refresh();
}
