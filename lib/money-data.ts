import { redirect } from "next/navigation";
import {
  demoMoneyDataset,
  householdPlan as demoPlan,
  type Account,
  type Holding,
  type MoneyDataset,
  type Transaction,
} from "@/lib/demo-data";
import {
  createLocalDbClient,
  testLocalDatabase,
} from "@/lib/local-db/client";
import {
  isLocalDatabaseConfigured,
  LOCAL_USER_EMAIL,
  LOCAL_USER_ID,
} from "@/lib/local-db/config";

export type MoneyHousehold = {
  id: string;
  name: string;
  baseCurrency: string;
};

export type MoneyContext = {
  source: "database" | "demo-unconfigured";
  configured: boolean;
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  household: MoneyHousehold | null;
  dataset: MoneyDataset | null;
};

function dollars(cents: unknown) {
  const value = Number(cents ?? 0);
  return Number.isFinite(value) ? value / 100 : 0;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ""
      : value.toISOString().slice(0, 10);
  }

  const raw = String(value ?? "").trim();

  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toISOString().slice(0, 10);
}

function monthLabel(dateValue: unknown) {
  const normalized = normalizeDate(dateValue);
  if (!normalized) return "—";

  const date = new Date(`${normalized}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

function buildMonthlyCashFlow(transactions: Transaction[]) {
  const groups = new Map<string, { label: string; income: number; spending: number }>();

  for (const transaction of transactions) {
    const parsed = new Date(`${transaction.date}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
    const current = groups.get(key) ?? {
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(parsed),
      income: 0,
      spending: 0,
    };

    if (transaction.type === "income") current.income += Math.max(0, transaction.amount);
    if (transaction.type === "expense") current.spending += Math.abs(transaction.amount);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, value]) => value);
}

function buildAllocation(holdings: Holding[]) {
  const total = holdings.reduce((sum, holding) => sum + holding.value, 0);
  const buckets = [
    {
      label: "U.S. equities",
      value: holdings
        .filter(
          (holding) =>
            (holding.kind === "stock" || holding.kind === "etf") &&
            holding.sector !== "International"
        )
        .reduce((sum, holding) => sum + holding.value, 0),
      tone: "navy",
    },
    {
      label: "International",
      value: holdings
        .filter((holding) => holding.sector === "International")
        .reduce((sum, holding) => sum + holding.value, 0),
      tone: "blue",
    },
    {
      label: "Bonds",
      value: holdings
        .filter((holding) => holding.kind === "bond")
        .reduce((sum, holding) => sum + holding.value, 0),
      tone: "sky",
    },
    {
      label: "Cash",
      value: holdings
        .filter((holding) => holding.kind === "cash")
        .reduce((sum, holding) => sum + holding.value, 0),
      tone: "green",
    },
  ];

  const known = buckets.reduce((sum, item) => sum + item.value, 0);
  buckets.push({ label: "Other", value: Math.max(0, total - known), tone: "slate" });

  return buckets.map((item) => ({
    label: item.label,
    value: total > 0 ? Number(((item.value / total) * 100).toFixed(1)) : 0,
    tone: item.tone,
  }));
}

export async function getMoneyContext(): Promise<MoneyContext> {
  if (!isLocalDatabaseConfigured()) {
    return {
      source: "demo-unconfigured",
      configured: false,
      authenticated: false,
      userId: null,
      email: null,
      household: null,
      dataset: demoMoneyDataset,
    };
  }

  await testLocalDatabase();
  const supabase = await createLocalDbClient();
  const userId = LOCAL_USER_ID;
  const email = LOCAL_USER_EMAIL;

  const [{ data: pref }, { data: firstMembership }] = await Promise.all([
    supabase
      .from("user_preferences")
      .select("active_household_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const householdId =
    (pref?.active_household_id as string | null | undefined) ??
    (firstMembership?.household_id as string | null | undefined) ??
    null;

  if (!householdId) {
    return {
      source: "database",
      configured: true,
      authenticated: true,
      userId,
      email,
      household: null,
      dataset: null,
    };
  }

  const { data: householdRow, error: householdError } = await supabase
    .from("households")
    .select("id,name,base_currency")
    .eq("id", householdId)
    .single();

  if (householdError || !householdRow) {
    return {
      source: "database",
      configured: true,
      authenticated: true,
      userId,
      email,
      household: null,
      dataset: null,
    };
  }

  const [
    accountsResult,
    holdingsResult,
    transactionsResult,
    goalsResult,
    planResult,
    netWorthResult,
    portfolioResult,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("holdings")
      .select("*")
      .eq("household_id", householdId)
      .eq("truth_suppressed", false)
      .order("market_value_cents", { ascending: false }),
    supabase
      .from("transactions")
      .select("*,account:accounts(name)")
      .eq("household_id", householdId)
      .is("duplicate_of_transaction_id", null)
      .order("posted_at", { ascending: false })
      .limit(500),
    supabase
      .from("goals")
      .select("*")
      .eq("household_id", householdId)
      .order("priority", { ascending: true }),
    supabase
      .from("planning_assumptions")
      .select("*")
      .eq("household_id", householdId)
      .maybeSingle(),
    supabase
      .from("net_worth_snapshots")
      .select("*")
      .eq("household_id", householdId)
      .order("snapshot_date", { ascending: true })
      .limit(60),
    supabase
      .from("portfolio_snapshots")
      .select("*")
      .eq("household_id", householdId)
      .order("snapshot_date", { ascending: true })
      .limit(60),
  ]);

  const queryError =
    accountsResult.error ??
    holdingsResult.error ??
    transactionsResult.error ??
    goalsResult.error ??
    planResult.error ??
    netWorthResult.error ??
    portfolioResult.error;

  if (queryError) {
    throw new Error(`Solpient Money database query failed: ${queryError.message}`);
  }

  const accounts: Account[] = (accountsResult.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    institution: String(row.institution ?? "Manual"),
    type: row.account_type as Account["type"],
    balance: dollars(row.balance_cents),
    changeYtd: numberValue(row.change_ytd_pct),
    owner: row.owner_scope as Account["owner"],
    lastFour: String(row.last_four ?? "—"),
    apr: row.apr_pct == null ? undefined : numberValue(row.apr_pct),
    minimumPayment:
      row.minimum_payment_cents == null
        ? undefined
        : dollars(row.minimum_payment_cents),
    source: (row.source ?? "manual") as Account["source"],
  }));

  const holdings: Holding[] = (holdingsResult.data ?? []).map((row) => ({
    ticker: String(row.ticker).toUpperCase(),
    name: String(row.name),
    kind: row.holding_kind as Holding["kind"],
    shares: numberValue(row.shares),
    price: numberValue(row.price),
    costBasis: dollars(row.cost_basis_cents),
    value: dollars(row.market_value_cents),
    dayChange: numberValue(row.day_change_pct),
    ytdReturn: numberValue(row.ytd_return_pct),
    sector: String(row.sector ?? "Other"),
    source: (row.source ?? "manual") as Holding["source"],
  }));

  const transactions: Transaction[] = (transactionsResult.data ?? []).map((row) => {
    const related = row.account as unknown as { name?: string } | null;
    return {
      id: String(row.id),
      date: normalizeDate(row.posted_at),
      merchant: String(row.normalized_merchant ?? row.merchant),
      category: String(row.truth_category ?? row.category ?? "Uncategorized"),
      account: related?.name ?? "Unassigned",
      amount: dollars(row.amount_cents),
      type: (row.detected_transfer ? "transfer" : row.transaction_type) as Transaction["type"],
      source: (row.source ?? "manual") as Transaction["source"],
    };
  });

  const planRow = planResult.data;
  const plan = {
    demoCurrentAge: numberValue(planRow?.current_age, demoPlan.demoCurrentAge),
    targetRetirementAge: numberValue(
      planRow?.target_retirement_age,
      demoPlan.targetRetirementAge
    ),
    emergencyFundTargetMonths: numberValue(
      planRow?.emergency_fund_target_months,
      demoPlan.emergencyFundTargetMonths
    ),
    expectedAnnualReturnPct: numberValue(
      planRow?.expected_annual_return_pct,
      demoPlan.expectedAnnualReturnPct
    ),
    targetRetirementAssets: dollars(
      planRow?.target_retirement_assets_cents ??
        demoPlan.targetRetirementAssets * 100
    ),
    singleStockReviewPct: numberValue(
      planRow?.single_stock_review_pct,
      demoPlan.singleStockReviewPct
    ),
    topThreeStockReviewPct: numberValue(
      planRow?.top_three_stock_review_pct,
      demoPlan.topThreeStockReviewPct
    ),
    portfolioCashReviewPct: numberValue(
      planRow?.portfolio_cash_review_pct,
      demoPlan.portfolioCashReviewPct
    ),
    highInterestDebtAprPct: numberValue(
      planRow?.high_interest_debt_apr_pct,
      demoPlan.highInterestDebtAprPct
    ),
  };

  const netWorthSeries = (netWorthResult.data ?? []).map((row) => ({
    label: monthLabel(row.snapshot_date),
    value: dollars(row.net_worth_cents),
  }));

  const portfolioPerformance = (portfolioResult.data ?? []).map((row) => ({
    label: monthLabel(row.snapshot_date),
    portfolio: numberValue(row.portfolio_return_pct),
    benchmark: numberValue(row.benchmark_return_pct),
  }));

  const dataset: MoneyDataset = {
    accounts,
    holdings,
    transactions,
    monthlyCashFlow: buildMonthlyCashFlow(transactions),
    netWorthSeries:
      netWorthSeries.length > 0
        ? netWorthSeries
        : [{ label: "Now", value: accounts.reduce((sum, account) => sum + account.balance, 0) }],
    portfolioPerformance:
      portfolioPerformance.length > 0
        ? portfolioPerformance
        : [{ label: "Now", portfolio: 0, benchmark: 0 }],
    allocation: buildAllocation(holdings),
    householdPlan: plan,
    householdGoals: (goalsResult.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      current: dollars(row.current_cents),
      target: dollars(row.target_cents),
    })),
  };

  return {
    source: "database",
    configured: true,
    authenticated: true,
    userId,
    email,
    household: {
      id: String(householdRow.id),
      name: String(householdRow.name),
      baseCurrency: String(householdRow.base_currency ?? "USD"),
    },
    dataset,
  };
}

export async function requireMoneyDataset() {
  const context = await getMoneyContext();

  if (context.configured && !context.authenticated) {
    redirect("/login");
  }

  if (context.configured && !context.household) {
    redirect("/setup");
  }

  return {
    ...context,
    dataset: context.dataset ?? demoMoneyDataset,
  };
}
