import "server-only";

import { getMonthlyCategoryActuals } from "@/lib/cash-flow-intelligence";
import { requireActiveHousehold } from "@/lib/money-auth";

export type BudgetCategory = {
  id: string;
  category: string;
  /** Configured monthly budget in dollars. */
  monthlyAmount: number;
  rollover: boolean;
};

export type BudgetRow = {
  id: string;
  category: string;
  /** Configured monthly budget in dollars. */
  baseBudget: number;
  /** Effective budget for the selected month (base + rolled-over unspent). */
  budgeted: number;
  rollover: boolean;
  rolloverAdded: number;
  actual: number;
  remaining: number;
  /** 0-100+ percentage of the effective budget spent. */
  pct: number;
};

export type BudgetOverview = {
  /** Descending "YYYY-MM" keys for the month picker. */
  months: string[];
  monthLabels: Record<string, string>;
  selectedMonth: string;
  selectedLabel: string;
  budgets: BudgetCategory[];
  rows: BudgetRow[];
  totalBudgeted: number;
  totalActual: number;
  totalRemaining: number;
  unbudgetedSpending: number;
  unbudgetedCategories: number;
  /** Every category ever observed, for the add-budget datalist. */
  observedCategories: string[];
};

function monthKeyNow() {
  return new Date().toISOString().slice(0, 7);
}

function monthLabelLong(key: string) {
  const date = new Date(`${key}-15T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function validMonthKey(value: string | null | undefined) {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value)
    ? value
    : null;
}

export async function getBudgetOverview(
  monthParam: string | null | undefined
): Promise<BudgetOverview> {
  const { supabase, householdId } = await requireActiveHousehold();

  const { data: budgetRows, error } = await supabase
    .from("budget_categories")
    .select("id,category,monthly_amount_cents,rollover")
    .eq("household_id", householdId)
    .order("category", { ascending: true });

  if (error) {
    throw new Error(`Budget load failed: ${error.message}`);
  }

  const budgets: BudgetCategory[] = (budgetRows ?? []).map((row) => ({
    id: String(row.id),
    category: String(row.category),
    monthlyAmount: Number(row.monthly_amount_cents ?? 0) / 100,
    rollover: Boolean(row.rollover),
  }));

  const actuals = await getMonthlyCategoryActuals();
  const current = monthKeyNow();
  const monthSet = new Set(actuals.months);
  monthSet.add(current);
  const monthsAsc = [...monthSet].sort();
  const requested = validMonthKey(monthParam);
  const selectedMonth =
    requested && monthSet.has(requested) ? requested : current;

  const monthLabels: Record<string, string> = {};
  for (const month of monthSet) monthLabels[month] = monthLabelLong(month);

  // Effective budget per category per month. When rollover is on, unspent
  // dollars carry forward and accumulate month to month.
  const effectiveByCategory = new Map<string, Map<string, number>>();
  for (const budget of budgets) {
    const byMonth = new Map<string, number>();
    let carry = 0;
    for (const month of monthsAsc) {
      const effective =
        budget.monthlyAmount + (budget.rollover ? carry : 0);
      byMonth.set(month, effective);
      const actual = actuals.totals[month]?.[budget.category] ?? 0;
      carry = Math.max(0, effective - actual);
    }
    effectiveByCategory.set(budget.category, byMonth);
  }

  const rows: BudgetRow[] = budgets
    .map((budget): BudgetRow => {
      const budgeted =
        effectiveByCategory.get(budget.category)?.get(selectedMonth) ??
        budget.monthlyAmount;
      const actual =
        actuals.totals[selectedMonth]?.[budget.category] ?? 0;
      return {
        id: budget.id,
        category: budget.category,
        baseBudget: budget.monthlyAmount,
        budgeted,
        rollover: budget.rollover,
        rolloverAdded: Math.max(0, budgeted - budget.monthlyAmount),
        actual,
        remaining: budgeted - actual,
        pct:
          budgeted > 0
            ? (actual / budgeted) * 100
            : actual > 0
              ? 100
              : 0,
      };
    })
    .sort((a, b) => b.actual - a.actual);

  const budgetedCategories = new Set(budgets.map((b) => b.category));
  const selectedTotals = actuals.totals[selectedMonth] ?? {};
  const observedCategories = new Set<string>();
  let unbudgetedSpending = 0;
  let unbudgetedCategories = 0;

  for (const month of actuals.months) {
    for (const category of Object.keys(actuals.totals[month])) {
      observedCategories.add(category);
    }
  }
  for (const [category, amount] of Object.entries(selectedTotals)) {
    observedCategories.add(category);
    if (!budgetedCategories.has(category) && amount > 0) {
      unbudgetedSpending += amount;
      unbudgetedCategories += 1;
    }
  }

  return {
    months: [...monthsAsc].reverse(),
    monthLabels,
    selectedMonth,
    selectedLabel: monthLabels[selectedMonth],
    budgets,
    rows,
    totalBudgeted: rows.reduce((sum, row) => sum + row.budgeted, 0),
    totalActual: rows.reduce((sum, row) => sum + row.actual, 0),
    totalRemaining: rows.reduce((sum, row) => sum + row.remaining, 0),
    unbudgetedSpending,
    unbudgetedCategories,
    observedCategories: [...observedCategories].sort((a, b) =>
      a.localeCompare(b)
    ),
  };
}
