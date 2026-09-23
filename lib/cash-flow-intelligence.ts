import "server-only";

import { requireActiveHousehold } from "@/lib/money-auth";

type CashFlowRow = {
  id: string;
  posted_at: unknown;
  merchant: string;
  normalized_merchant?: string | null;
  category?: string | null;
  truth_category?: string | null;
  amount_cents: unknown;
  transaction_type?: string | null;
  source?: string | null;
  duplicate_of_transaction_id?: string | null;
  detected_transfer?: boolean | null;
};

type CleanTransaction = {
  id: string;
  date: string;
  dateMs: number;
  month: string;
  merchant: string;
  category: string;
  amount: number;
  type: "income" | "expense";
};

export type CashFlowMonth = {
  key: string;
  label: string;
  income: number;
  spending: number;
  saved: number;
  savingsRate: number;
};

export type RecurringCashFlow = {
  key: string;
  merchant: string;
  category: string;
  kind: "income" | "bill" | "subscription";
  cadence: "weekly" | "biweekly" | "monthly" | "quarterly" | "recurring";
  averageAmount: number;
  monthlyEquivalent: number;
  occurrences: number;
  medianGapDays: number;
  amountVariationPct: number;
  lastDate: string;
};

export type CategorySpend = {
  category: string;
  amount: number;
  sharePct: number;
  priorAverage: number;
  changePct: number | null;
};

export type SpendingAlert = {
  id: string;
  level: "watch" | "high";
  title: string;
  detail: string;
  amount: number;
  date: string | null;
};

export type CashFlowHealth = {
  latestMonth: string;
  latestIncome: number;
  latestSpending: number;
  latestSaved: number;
  latestSavingsRate: number;
  trailingSavingsRate: number;
  recurringIncomeMonthly: number;
  recurringBillsMonthly: number;
  subscriptionsMonthly: number;
  fixedCostRatioPct: number;
  discretionarySpending: number;
  incomeStabilityPct: number;
  monthsObserved: number;
};

export type CashFlowIntelligence = {
  health: CashFlowHealth;
  monthly: CashFlowMonth[];
  recurring: RecurringCashFlow[];
  categories: CategorySpend[];
  alerts: SpendingAlert[];
  transactionCount: number;
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }

  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(key: string) {
  const date = new Date(`${key}-15T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function coefficientOfVariation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  if (!average) return 0;

  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) /
    values.length;

  return Math.sqrt(variance) / average;
}

function cadenceFromGap(gap: number): RecurringCashFlow["cadence"] {
  if (gap >= 5 && gap <= 9) return "weekly";
  if (gap >= 11 && gap <= 18) return "biweekly";
  if (gap >= 24 && gap <= 40) return "monthly";
  if (gap >= 70 && gap <= 110) return "quarterly";
  return "recurring";
}

function monthlyMultiplier(cadence: RecurringCashFlow["cadence"]) {
  if (cadence === "weekly") return 52 / 12;
  if (cadence === "biweekly") return 26 / 12;
  if (cadence === "quarterly") return 1 / 3;
  if (cadence === "monthly") return 1;
  return 1;
}

function cleanRows(rows: CashFlowRow[]) {
  const cleaned: CleanTransaction[] = [];

  for (const row of rows) {
    if (row.duplicate_of_transaction_id || row.detected_transfer) continue;

    const rawType = String(row.transaction_type ?? "");
    if (rawType !== "income" && rawType !== "expense") continue;

    const date = normalizeDate(row.posted_at);
    if (!date) continue;

    const dateMs = new Date(`${date}T12:00:00Z`).getTime();
    if (!Number.isFinite(dateMs)) continue;

    const signed = numberValue(row.amount_cents) / 100;
    const amount =
      rawType === "income" ? Math.abs(signed) : Math.abs(signed);

    if (!amount) continue;

    cleaned.push({
      id: String(row.id),
      date,
      dateMs,
      month: monthKey(date),
      merchant: String(
        row.normalized_merchant ?? row.merchant ?? "Unknown"
      ).trim() || "Unknown",
      category: String(
        row.truth_category ?? row.category ?? "Uncategorized"
      ).trim() || "Uncategorized",
      amount,
      type: rawType,
    });
  }

  return cleaned.sort((a, b) => a.dateMs - b.dateMs);
}

function buildMonthly(transactions: CleanTransaction[]) {
  const groups = new Map<
    string,
    { income: number; spending: number }
  >();

  for (const transaction of transactions) {
    const current = groups.get(transaction.month) ?? {
      income: 0,
      spending: 0,
    };

    if (transaction.type === "income") {
      current.income += transaction.amount;
    } else {
      current.spending += transaction.amount;
    }

    groups.set(transaction.month, current);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, value]): CashFlowMonth => {
      const saved = value.income - value.spending;
      return {
        key,
        label: monthLabel(key),
        income: value.income,
        spending: value.spending,
        saved,
        savingsRate:
          value.income > 0 ? (saved / value.income) * 100 : 0,
      };
    });
}

function buildRecurring(transactions: CleanTransaction[]) {
  const groups = new Map<string, CleanTransaction[]>();

  for (const transaction of transactions) {
    const key = [
      transaction.type,
      transaction.merchant.toLowerCase(),
      transaction.category.toLowerCase(),
    ].join("|");
    const group = groups.get(key) ?? [];
    group.push(transaction);
    groups.set(key, group);
  }

  const recurring: RecurringCashFlow[] = [];

  for (const [key, group] of groups.entries()) {
    if (group.length < 2) continue;

    const ordered = [...group].sort((a, b) => a.dateMs - b.dateMs);
    const gaps = ordered
      .slice(1)
      .map(
        (transaction, index) =>
          (transaction.dateMs - ordered[index].dateMs) / 86_400_000
      )
      .filter((gap) => gap > 0 && gap <= 120);

    if (!gaps.length) continue;

    const medianGapDays = median(gaps);
    const cadence = cadenceFromGap(medianGapDays);

    if (
      cadence === "recurring" &&
      !(medianGapDays >= 5 && medianGapDays <= 60)
    ) {
      continue;
    }

    const amounts = ordered.map((transaction) => transaction.amount);
    const amountVariationPct = coefficientOfVariation(amounts) * 100;

    if (amountVariationPct > 35) continue;

    const averageAmount = mean(amounts);
    const category = ordered.at(-1)?.category ?? "Uncategorized";
    const merchant = ordered.at(-1)?.merchant ?? "Unknown";
    const isExpense = ordered[0].type === "expense";

    const subscriptionCategory =
      /subscription|streaming|software|membership|digital|media/i.test(
        category
      );

    const subscription =
      isExpense &&
      cadence === "monthly" &&
      amountVariationPct <= 15 &&
      (subscriptionCategory || averageAmount <= 250);

    recurring.push({
      key,
      merchant,
      category,
      kind:
        ordered[0].type === "income"
          ? "income"
          : subscription
            ? "subscription"
            : "bill",
      cadence,
      averageAmount,
      monthlyEquivalent:
        averageAmount * monthlyMultiplier(cadence),
      occurrences: ordered.length,
      medianGapDays,
      amountVariationPct,
      lastDate: ordered.at(-1)?.date ?? "",
    });
  }

  return recurring.sort(
    (a, b) => b.monthlyEquivalent - a.monthlyEquivalent
  );
}

function buildCategories(
  transactions: CleanTransaction[],
  latestMonth: string
) {
  const expense = transactions.filter(
    (transaction) => transaction.type === "expense"
  );
  const latest = expense.filter(
    (transaction) => transaction.month === latestMonth
  );
  const latestTotal = latest.reduce(
    (sum, transaction) => sum + transaction.amount,
    0
  );

  const latestByCategory = new Map<string, number>();
  for (const transaction of latest) {
    latestByCategory.set(
      transaction.category,
      (latestByCategory.get(transaction.category) ?? 0) +
        transaction.amount
    );
  }

  const priorMonths = Array.from(
    new Set(
      expense
        .map((transaction) => transaction.month)
        .filter((month) => month < latestMonth)
    )
  )
    .sort()
    .slice(-6);

  return Array.from(latestByCategory.entries())
    .map(([category, amount]): CategorySpend => {
      const priorValues = priorMonths.map((month) =>
        expense
          .filter(
            (transaction) =>
              transaction.month === month &&
              transaction.category === category
          )
          .reduce((sum, transaction) => sum + transaction.amount, 0)
      );
      const priorAverage = mean(priorValues);
      return {
        category,
        amount,
        sharePct: latestTotal > 0 ? (amount / latestTotal) * 100 : 0,
        priorAverage,
        changePct:
          priorAverage > 0
            ? ((amount - priorAverage) / priorAverage) * 100
            : null,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

function buildAlerts(
  transactions: CleanTransaction[],
  categories: CategorySpend[],
  latestMonth: string
) {
  const alerts: SpendingAlert[] = [];

  for (const category of categories) {
    if (
      category.priorAverage >= 100 &&
      category.amount >= category.priorAverage + 100 &&
      category.amount >= category.priorAverage * 1.5
    ) {
      alerts.push({
        id: `category:${category.category}`,
        level:
          category.amount >= category.priorAverage * 2 ? "high" : "watch",
        title: `${category.category} spending is elevated`,
        detail: `${Math.round(
          ((category.amount - category.priorAverage) /
            category.priorAverage) *
            100
        )}% above the recent monthly average.`,
        amount: category.amount - category.priorAverage,
        date: null,
      });
    }
  }

  const expenses = transactions.filter(
    (transaction) =>
      transaction.type === "expense" &&
      transaction.month === latestMonth
  );
  const historicalByMerchant = new Map<string, number[]>();

  for (const transaction of transactions) {
    if (
      transaction.type !== "expense" ||
      transaction.month === latestMonth
    ) {
      continue;
    }

    const values =
      historicalByMerchant.get(transaction.merchant.toLowerCase()) ?? [];
    values.push(transaction.amount);
    historicalByMerchant.set(
      transaction.merchant.toLowerCase(),
      values
    );
  }

  for (const transaction of expenses) {
    const history =
      historicalByMerchant.get(transaction.merchant.toLowerCase()) ?? [];
    if (history.length < 2) continue;

    const typical = median(history);
    if (
      typical >= 20 &&
      transaction.amount >= typical * 2 &&
      transaction.amount >= typical + 100
    ) {
      alerts.push({
        id: `transaction:${transaction.id}`,
        level: transaction.amount >= typical * 3 ? "high" : "watch",
        title: `${transaction.merchant} is unusually high`,
        detail: `${transaction.amount.toFixed(
          0
        )} vs a typical ${typical.toFixed(0)} for this merchant.`,
        amount: transaction.amount - typical,
        date: transaction.date,
      });
    }
  }

  return alerts
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === "high" ? -1 : 1;
      return b.amount - a.amount;
    })
    .slice(0, 8);
}

function incomeStability(monthly: CashFlowMonth[]) {
  const incomes = monthly
    .map((month) => month.income)
    .filter((value) => value > 0)
    .slice(-6);

  if (incomes.length < 2) return 0;

  const cv = coefficientOfVariation(incomes);
  return Math.max(0, Math.min(100, (1 - cv) * 100));
}

export async function getCashFlowIntelligence(): Promise<CashFlowIntelligence> {
  const { supabase, householdId } = await requireActiveHousehold();

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id,posted_at,merchant,normalized_merchant,category,truth_category,amount_cents,transaction_type,source,duplicate_of_transaction_id,detected_transfer"
    )
    .eq("household_id", householdId)
    .order("posted_at", { ascending: true })
    .limit(5000);

  if (error) {
    throw new Error(`Cash-flow intelligence query failed: ${error.message}`);
  }

  const transactions = cleanRows((data ?? []) as CashFlowRow[]);
  const monthly = buildMonthly(transactions);
  const latest = monthly.at(-1) ?? {
    key: "",
    label: "Current",
    income: 0,
    spending: 0,
    saved: 0,
    savingsRate: 0,
  };
  const recurring = buildRecurring(transactions);
  const categories = buildCategories(transactions, latest.key);
  const alerts = buildAlerts(transactions, categories, latest.key);

  const recurringIncomeMonthly = recurring
    .filter((item) => item.kind === "income")
    .reduce((sum, item) => sum + item.monthlyEquivalent, 0);

  const recurringBillsMonthly = recurring
    .filter((item) => item.kind === "bill")
    .reduce((sum, item) => sum + item.monthlyEquivalent, 0);

  const subscriptionsMonthly = recurring
    .filter((item) => item.kind === "subscription")
    .reduce((sum, item) => sum + item.monthlyEquivalent, 0);

  const recurringExpenseMonthly =
    recurringBillsMonthly + subscriptionsMonthly;

  const trailingIncome = monthly.reduce(
    (sum, month) => sum + month.income,
    0
  );
  const trailingSpending = monthly.reduce(
    (sum, month) => sum + month.spending,
    0
  );

  return {
    health: {
      latestMonth: latest.label,
      latestIncome: latest.income,
      latestSpending: latest.spending,
      latestSaved: latest.saved,
      latestSavingsRate: latest.savingsRate,
      trailingSavingsRate:
        trailingIncome > 0
          ? ((trailingIncome - trailingSpending) / trailingIncome) * 100
          : 0,
      recurringIncomeMonthly,
      recurringBillsMonthly,
      subscriptionsMonthly,
      fixedCostRatioPct:
        recurringIncomeMonthly > 0
          ? (recurringExpenseMonthly / recurringIncomeMonthly) * 100
          : latest.income > 0
            ? (recurringExpenseMonthly / latest.income) * 100
            : 0,
      discretionarySpending: Math.max(
        0,
        latest.spending - recurringExpenseMonthly
      ),
      incomeStabilityPct: incomeStability(monthly),
      monthsObserved: monthly.length,
    },
    monthly,
    recurring,
    categories,
    alerts,
    transactionCount: transactions.length,
  };
}
