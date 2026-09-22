"use server";

import { revalidatePath } from "next/cache";
import { requireActiveHousehold } from "@/lib/money-auth";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function num(formData: FormData, key: string, fallback = 0) {
  const parsed = Number(text(formData, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function addAccount(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const accountType = text(formData, "account_type");
  const rawBalance = num(formData, "balance");
  const normalizedBalance =
    accountType === "debt" ? -Math.abs(rawBalance) : Math.abs(rawBalance);

  const { error } = await supabase.from("accounts").insert({
    household_id: householdId,
    name: text(formData, "name"),
    institution: text(formData, "institution") || "Manual",
    account_type: accountType,
    balance_cents: cents(normalizedBalance),
    owner_scope: text(formData, "owner_scope") || "Household",
    last_four: text(formData, "last_four") || null,
    apr_pct: accountType === "debt" ? num(formData, "apr", 0) : null,
    minimum_payment_cents:
      accountType === "debt" ? cents(num(formData, "minimum_payment", 0)) : null,
  });

  if (error) throw new Error(error.message);
  refresh();
}

export async function addTransaction(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();
  const type = text(formData, "transaction_type");
  const rawAmount = Math.abs(num(formData, "amount"));
  const signedAmount = type === "income" ? rawAmount : -rawAmount;

  const { error } = await supabase.from("transactions").insert({
    household_id: householdId,
    account_id: text(formData, "account_id") || null,
    posted_at: text(formData, "posted_at"),
    merchant: text(formData, "merchant"),
    category: text(formData, "category") || "Uncategorized",
    amount_cents: cents(signedAmount),
    transaction_type: type,
    source: "manual",
  });

  if (error) throw new Error(error.message);
  refresh();
}

export async function addHolding(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();

  const { error } = await supabase.from("holdings").insert({
    household_id: householdId,
    account_id: text(formData, "account_id") || null,
    ticker: text(formData, "ticker").toUpperCase(),
    name: text(formData, "name"),
    holding_kind: text(formData, "holding_kind"),
    shares: num(formData, "shares"),
    price: num(formData, "price"),
    cost_basis_cents: cents(num(formData, "cost_basis")),
    market_value_cents: cents(num(formData, "market_value")),
    day_change_pct: num(formData, "day_change"),
    ytd_return_pct: num(formData, "ytd_return"),
    sector: text(formData, "sector") || "Other",
    source: "manual",
  });

  if (error) throw new Error(error.message);
  refresh();
}

export async function addGoal(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();

  const { error } = await supabase.from("goals").insert({
    household_id: householdId,
    name: text(formData, "name"),
    current_cents: cents(num(formData, "current")),
    target_cents: cents(num(formData, "target")),
    priority: Math.round(num(formData, "priority", 100)),
  });

  if (error) throw new Error(error.message);
  refresh();
}

export async function updatePlanning(formData: FormData) {
  const { supabase, householdId } = await requireActiveHousehold();

  const { error } = await supabase.from("planning_assumptions").upsert({
    household_id: householdId,
    current_age: Math.round(num(formData, "current_age")),
    target_retirement_age: Math.round(num(formData, "target_retirement_age")),
    emergency_fund_target_months: num(formData, "emergency_fund_target_months"),
    expected_annual_return_pct: num(formData, "expected_annual_return_pct"),
    target_retirement_assets_cents: cents(num(formData, "target_retirement_assets")),
    single_stock_review_pct: num(formData, "single_stock_review_pct"),
    top_three_stock_review_pct: num(formData, "top_three_stock_review_pct"),
    portfolio_cash_review_pct: num(formData, "portfolio_cash_review_pct"),
    high_interest_debt_apr_pct: num(formData, "high_interest_debt_apr_pct"),
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  refresh();
}

async function remove(table: "accounts" | "transactions" | "holdings" | "goals", id: string) {
  const { supabase, householdId } = await requireActiveHousehold();
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteAccount(formData: FormData) {
  await remove("accounts", text(formData, "id"));
}

export async function deleteTransaction(formData: FormData) {
  await remove("transactions", text(formData, "id"));
}

export async function deleteHolding(formData: FormData) {
  await remove("holdings", text(formData, "id"));
}

export async function deleteGoal(formData: FormData) {
  await remove("goals", text(formData, "id"));
}
