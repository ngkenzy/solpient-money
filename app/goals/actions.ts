"use server";

import { revalidatePath } from "next/cache";
import { requireActiveHousehold } from "@/lib/money-auth";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function dollarsToCents(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Dollar values must be valid non-negative numbers.");
  }
  return Math.round(parsed * 100);
}

function dateOrNull(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Target date must use YYYY-MM-DD.");
  }
  return value;
}

function priority(value: string) {
  const parsed = Number.parseInt(value || "100", 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(10000, parsed));
}

function refresh() {
  revalidatePath("/goals");
  revalidatePath("/plan");
  revalidatePath("/", "layout");
}

export async function createGoal(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const name = text(formData, "name");
  const current = text(formData, "current");
  const target = text(formData, "target");
  const targetDate = dateOrNull(text(formData, "target_date"));
  const goalPriority = priority(text(formData, "priority"));

  if (!name) throw new Error("Goal name is required.");

  const currentCents = dollarsToCents(current || "0");
  const targetCents = dollarsToCents(target);

  if (targetCents <= 0) {
    throw new Error("Goal target must be greater than zero.");
  }

  const { error } = await supabase.from("goals").insert({
    household_id: householdId,
    name,
    current_cents: currentCents,
    target_cents: targetCents,
    target_date: targetDate,
    priority: goalPriority,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  refresh();
}

export async function updateGoal(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const goalId = text(formData, "goal_id");
  const name = text(formData, "name");
  const currentCents = dollarsToCents(text(formData, "current") || "0");
  const targetCents = dollarsToCents(text(formData, "target"));
  const targetDate = dateOrNull(text(formData, "target_date"));
  const goalPriority = priority(text(formData, "priority"));

  if (!goalId || !name) throw new Error("Goal and name are required.");
  if (targetCents <= 0) {
    throw new Error("Goal target must be greater than zero.");
  }

  const { error } = await supabase
    .from("goals")
    .update({
      name,
      current_cents: currentCents,
      target_cents: targetCents,
      target_date: targetDate,
      priority: goalPriority,
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteGoal(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const goalId = text(formData, "goal_id");

  if (!goalId) throw new Error("Goal is required.");

  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", goalId)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);
  refresh();
}
