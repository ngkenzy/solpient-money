"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  accounts,
  holdings,
  householdGoals,
  householdPlan,
  monthlyCashFlow,
  netWorthSeries,
  portfolioPerformance,
  transactions,
} from "@/lib/demo-data";
import { requireAuthenticatedMoneyUser } from "@/lib/money-auth";

function cents(value: number) {
  return Math.round(value * 100);
}

function isoDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export async function createHouseholdWithDemoData(formData: FormData) {
  const { supabase, userId, email } = await requireAuthenticatedMoneyUser();
  const requestedName = String(formData.get("household_name") ?? "").trim();
  const householdName = requestedName || "My Household";

  const { data: existingMembership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (existingMembership?.household_id) {
    await supabase.from("user_preferences").upsert({
      user_id: userId,
      active_household_id: existingMembership.household_id,
      updated_at: new Date().toISOString(),
    });
    redirect("/");
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    user_id: userId,
    display_name: email?.split("@")[0] ?? "Solpient User",
    updated_at: new Date().toISOString(),
  });
  if (profileError) throw new Error(profileError.message);

  const { data: household, error: householdError } = await supabase
    .from("households")
    .insert({
      name: householdName,
      base_currency: "USD",
      created_by: userId,
    })
    .select("id")
    .single();

  if (householdError || !household) {
    throw new Error(householdError?.message ?? "Unable to create household.");
  }

  const householdId = String(household.id);

  const { error: preferenceError } = await supabase.from("user_preferences").upsert({
    user_id: userId,
    active_household_id: householdId,
    updated_at: new Date().toISOString(),
  });
  if (preferenceError) throw new Error(preferenceError.message);

  const { error: planError } = await supabase.from("planning_assumptions").insert({
    household_id: householdId,
    current_age: householdPlan.demoCurrentAge,
    target_retirement_age: householdPlan.targetRetirementAge,
    emergency_fund_target_months: householdPlan.emergencyFundTargetMonths,
    expected_annual_return_pct: householdPlan.expectedAnnualReturnPct,
    target_retirement_assets_cents: cents(householdPlan.targetRetirementAssets),
    single_stock_review_pct: householdPlan.singleStockReviewPct,
    top_three_stock_review_pct: householdPlan.topThreeStockReviewPct,
    portfolio_cash_review_pct: householdPlan.portfolioCashReviewPct,
    high_interest_debt_apr_pct: householdPlan.highInterestDebtAprPct,
  });
  if (planError) throw new Error(planError.message);

  const { data: insertedAccounts, error: accountsError } = await supabase
    .from("accounts")
    .insert(
      accounts.map((account, index) => ({
        household_id: householdId,
        name: account.name,
        institution: account.institution,
        account_type: account.type,
        balance_cents: cents(account.balance),
        change_ytd_pct: account.changeYtd,
        owner_scope: account.owner,
        last_four: account.lastFour,
        apr_pct: account.apr ?? null,
        minimum_payment_cents:
          account.minimumPayment == null ? null : cents(account.minimumPayment),
        sort_order: index,
      }))
    )
    .select("id,name,account_type");

  if (accountsError || !insertedAccounts) {
    throw new Error(accountsError?.message ?? "Unable to seed accounts.");
  }

  const accountByName = new Map(
    insertedAccounts.map((account) => [String(account.name), String(account.id)])
  );
  const checkingId = accountByName.get("Everyday Checking") ?? null;
  const taxableId = accountByName.get("Taxable Brokerage") ?? null;
  const retirementId = accountByName.get("Employer Retirement") ?? null;

  const { error: holdingsError } = await supabase.from("holdings").insert(
    holdings.map((holding) => ({
      household_id: householdId,
      account_id:
        holding.kind === "bond"
          ? retirementId
          : holding.kind === "stock" || holding.kind === "etf" || holding.kind === "cash"
            ? taxableId
            : null,
      ticker: holding.ticker,
      name: holding.name,
      holding_kind: holding.kind,
      shares: holding.shares,
      price: holding.price,
      cost_basis_cents: cents(holding.costBasis),
      market_value_cents: cents(holding.value),
      day_change_pct: holding.dayChange,
      ytd_return_pct: holding.ytdReturn,
      sector: holding.sector,
      source: "demo",
    }))
  );
  if (holdingsError) throw new Error(holdingsError.message);

  const historicalTransactions = monthlyCashFlow
    .filter((row) => row.label !== "Sep")
    .flatMap((row, index) => {
      const month = index + 4;
      const day = "15";
      const date = `2026-${String(month).padStart(2, "0")}-${day}`;
      return [
        {
          household_id: householdId,
          account_id: checkingId,
          posted_at: date,
          merchant: `${row.label} income summary`,
          category: "Income",
          amount_cents: cents(row.income),
          transaction_type: "income",
          source: "demo",
        },
        {
          household_id: householdId,
          account_id: checkingId,
          posted_at: date,
          merchant: `${row.label} spending summary`,
          category: "Historical spending",
          amount_cents: -cents(row.spending),
          transaction_type: "expense",
          source: "demo",
        },
      ];
    });

  const septemberTransactions = transactions.map((transaction) => ({
    household_id: householdId,
    account_id:
      transaction.account === "Everyday Checking"
        ? checkingId
        : transaction.account === "Credit Card"
          ? accountByName.get("Credit Card") ?? null
          : transaction.account === "High-Yield Savings"
            ? accountByName.get("High-Yield Savings") ?? null
            : null,
    posted_at: isoDate(transaction.date),
    merchant: transaction.merchant,
    category: transaction.category,
    amount_cents: cents(transaction.amount),
    transaction_type: transaction.type,
    source: "demo",
  }));

  const { error: transactionsError } = await supabase
    .from("transactions")
    .insert([...historicalTransactions, ...septemberTransactions]);
  if (transactionsError) throw new Error(transactionsError.message);

  const { error: goalsError } = await supabase.from("goals").insert(
    householdGoals.map((goal, index) => ({
      household_id: householdId,
      name: goal.name,
      current_cents: cents(goal.current),
      target_cents: cents(goal.target),
      priority: (index + 1) * 100,
    }))
  );
  if (goalsError) throw new Error(goalsError.message);

  const currentLiabilities = Math.abs(
    accounts.filter((account) => account.type === "debt").reduce((sum, account) => sum + account.balance, 0)
  );

  const { error: netWorthError } = await supabase.from("net_worth_snapshots").insert(
    netWorthSeries.map((point, index) => {
      const month = index + 1;
      const date = `2026-${String(month).padStart(2, "0")}-01`;
      return {
        household_id: householdId,
        snapshot_date: date,
        assets_cents: cents(point.value + currentLiabilities),
        liabilities_cents: cents(currentLiabilities),
        net_worth_cents: cents(point.value),
        source: "demo",
      };
    })
  );
  if (netWorthError) throw new Error(netWorthError.message);

  const currentPortfolioValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
  const finalReturn = portfolioPerformance.at(-1)?.portfolio ?? 0;

  const { error: portfolioError } = await supabase.from("portfolio_snapshots").insert(
    portfolioPerformance.map((point, index) => ({
      household_id: householdId,
      snapshot_date: `2026-${String(index + 1).padStart(2, "0")}-01`,
      portfolio_value_cents: cents(
        currentPortfolioValue * ((100 + point.portfolio) / (100 + finalReturn))
      ),
      portfolio_return_pct: point.portfolio,
      benchmark_return_pct: point.benchmark,
    }))
  );
  if (portfolioError) throw new Error(portfolioError.message);

  revalidatePath("/", "layout");
  redirect("/");
}
