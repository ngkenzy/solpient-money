import "server-only";

import type { CashFlowIntelligence } from "@/lib/cash-flow-intelligence";
import type { MoneyDataset } from "@/lib/demo-data";
import { getFinancialHealth } from "@/lib/intelligence";

export type PlanLineKind =
  | "reserve"
  | "high_interest_debt"
  | "goal"
  | "retirement"
  | "flexible";

export type PlanLine = {
  id: string;
  priority: number;
  kind: PlanLineKind;
  title: string;
  monthlyAllocation: number;
  current: number;
  target: number | null;
  gap: number | null;
  targetDate: string | null;
  estimatedCompletionMonths: number | null;
  status: "fund" | "on_track" | "complete" | "unfunded";
  why: string;
  changesWhen: string;
};

export type DebtPayoffRow = {
  id: string;
  name: string;
  apr: number;
  startingBalance: number;
  minimumPayment: number;
  payoffMonth: number | null;
  payoffDate: string | null;
};

export type GoalPlanRow = {
  id: string;
  name: string;
  current: number;
  target: number;
  gap: number;
  targetDate: string | null;
  monthsRemaining: number | null;
  requiredMonthly: number | null;
  plannedMonthly: number;
  onTrack: boolean | null;
};

export type HouseholdFinancialPlan = {
  version: "1.1";
  asOf: string;
  monthlyIncome: number;
  monthlySpending: number;
  monthlySurplus: number;
  allocatedMonthly: number;
  flexibleMonthly: number;
  reserveAllocation: number;
  debtAllocation: number;
  goalAllocation: number;
  retirementAllocation: number;
  retirementRequiredMonthly: number;
  retirementFundingGapMonthly: number;
  debtInterestSaved: number;
  debtPayoffMonths: number | null;
  baselineDebtPayoffMonths: number | null;
  planLines: PlanLine[];
  debtSchedule: DebtPayoffRow[];
  goals: GoalPlanRow[];
  policies: Array<{
    label: string;
    value: string;
    source: string;
  }>;
};

type Debt = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minimumPayment: number;
};

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function roundDollar(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function monthDifference(from: Date, to: Date) {
  if (to.getTime() <= from.getTime()) return 1;
  const years = to.getUTCFullYear() - from.getUTCFullYear();
  const months = to.getUTCMonth() - from.getUTCMonth();
  const dayAdjustment = to.getUTCDate() > from.getUTCDate() ? 1 : 0;
  return Math.max(1, years * 12 + months + dayAdjustment);
}

function addMonthsIso(asOf: Date, months: number | null) {
  if (months == null) return null;
  const date = new Date(
    Date.UTC(
      asOf.getUTCFullYear(),
      asOf.getUTCMonth() + months,
      1
    )
  );
  return date.toISOString().slice(0, 10);
}

function amortizingPayment(
  balance: number,
  annualRatePct: number,
  months: number
) {
  if (balance <= 0 || months <= 0) return 0;
  const rate = Math.max(0, annualRatePct) / 100 / 12;
  if (rate < 0.0000001) return balance / months;
  return (
    (balance * rate) /
    (1 - Math.pow(1 + rate, -months))
  );
}

function requiredContributionForTarget({
  principal,
  target,
  annualReturnPct,
  months,
}: {
  principal: number;
  target: number;
  annualReturnPct: number;
  months: number;
}) {
  if (months <= 0 || target <= 0) return 0;
  const rate = annualReturnPct / 100 / 12;
  const growth = Math.pow(1 + rate, months);
  const futurePrincipal = principal * growth;
  if (futurePrincipal >= target) return 0;

  if (Math.abs(rate) < 0.0000001) {
    return (target - principal) / months;
  }

  const annuityFactor = (growth - 1) / rate;
  return Math.max(0, (target - futurePrincipal) / annuityFactor);
}

function futureValueOfContributions({
  principal,
  monthlyContribution,
  annualReturnPct,
  months,
}: {
  principal: number;
  monthlyContribution: number;
  annualReturnPct: number;
  months: number;
}) {
  if (months <= 0) return principal;
  const rate = annualReturnPct / 100 / 12;
  const growth = Math.pow(1 + rate, months);
  const futurePrincipal = principal * growth;
  if (Math.abs(rate) < 0.0000001) {
    return futurePrincipal + monthlyContribution * months;
  }
  const annuityFactor = (growth - 1) / rate;
  return futurePrincipal + monthlyContribution * annuityFactor;
}

function simulateDebtPlan(
  inputDebts: Debt[],
  extraMonthly: number,
  asOf: Date,
  maxMonths = 600
) {
  const debts = inputDebts
    .map((debt) => ({
      ...debt,
      balance: Math.max(0, debt.balance),
      payoffMonth: null as number | null,
    }))
    .sort((a, b) => b.apr - a.apr);

  const originalMinimumBudget = debts.reduce(
    (sum, debt) => sum + Math.max(0, debt.minimumPayment),
    0
  );
  const totalBudget = originalMinimumBudget + Math.max(0, extraMonthly);
  let interestPaid = 0;
  let allPaidMonth: number | null = debts.length ? null : 0;

  for (let month = 1; month <= maxMonths; month += 1) {
    for (const debt of debts) {
      if (debt.balance <= 0.005) continue;
      const interest = debt.balance * (Math.max(0, debt.apr) / 100 / 12);
      debt.balance += interest;
      interestPaid += interest;
    }

    let spentOnMinimums = 0;

    for (const debt of debts) {
      if (debt.balance <= 0.005) continue;
      const payment = Math.min(
        debt.balance,
        Math.max(0, debt.minimumPayment)
      );
      debt.balance -= payment;
      spentOnMinimums += payment;

      if (debt.balance <= 0.005 && debt.payoffMonth == null) {
        debt.balance = 0;
        debt.payoffMonth = month;
      }
    }

    let avalancheBudget = Math.max(0, totalBudget - spentOnMinimums);

    for (const debt of debts) {
      if (debt.balance <= 0.005 || avalancheBudget <= 0) continue;
      const payment = Math.min(debt.balance, avalancheBudget);
      debt.balance -= payment;
      avalancheBudget -= payment;

      if (debt.balance <= 0.005 && debt.payoffMonth == null) {
        debt.balance = 0;
        debt.payoffMonth = month;
      }
    }

    if (debts.every((debt) => debt.balance <= 0.005)) {
      allPaidMonth = month;
      break;
    }
  }

  return {
    interestPaid,
    allPaidMonth,
    rows: debts.map((debt) => ({
      id: debt.id,
      name: debt.name,
      apr: debt.apr,
      startingBalance:
        inputDebts.find((item) => item.id === debt.id)?.balance ?? 0,
      minimumPayment: debt.minimumPayment,
      payoffMonth: debt.payoffMonth,
      payoffDate: addMonthsIso(asOf, debt.payoffMonth),
    })),
  };
}

export function buildHouseholdFinancialPlan(
  dataset: MoneyDataset,
  cashFlow: CashFlowIntelligence,
  asOfInput: Date = new Date()
): HouseholdFinancialPlan {
  const asOf = new Date(
    Date.UTC(
      asOfInput.getUTCFullYear(),
      asOfInput.getUTCMonth(),
      asOfInput.getUTCDate()
    )
  );

  const health = getFinancialHealth(dataset);
  const plan = dataset.householdPlan;
  const monthlyIncome = average(
    cashFlow.monthly.map((month) => month.income)
  );
  const monthlySpending = average(
    cashFlow.monthly.map((month) => month.spending)
  );
  const monthlySurplus = roundDollar(
    Math.max(0, monthlyIncome - monthlySpending)
  );

  let remaining = monthlySurplus;

  const reserveGap = Math.max(
    0,
    health.metrics.reserveTarget - health.metrics.bankCash
  );
  const reserveRequiredMonthly =
    reserveGap > 0 ? reserveGap / 12 : 0;
  const reserveAllocation = roundDollar(
    Math.min(remaining, reserveRequiredMonthly)
  );
  remaining -= reserveAllocation;

  const debts: Debt[] = dataset.accounts
    .filter((account) => account.type === "debt")
    .map((account) => ({
      id: account.id,
      name: account.name,
      balance: Math.abs(account.balance),
      apr: account.apr ?? 0,
      minimumPayment: account.minimumPayment ?? 0,
    }))
    .sort((a, b) => b.apr - a.apr);

  const highInterest = debts.filter(
    (debt) => debt.apr >= plan.highInterestDebtAprPct
  );
  const debtRequiredMonthly = highInterest.reduce((sum, debt) => {
    const targetPayment = amortizingPayment(
      debt.balance,
      debt.apr,
      12
    );
    return (
      sum +
      Math.max(0, targetPayment - debt.minimumPayment)
    );
  }, 0);

  const debtAllocation = roundDollar(
    Math.min(remaining, debtRequiredMonthly)
  );
  remaining -= debtAllocation;

  const nonReserveGoals = dataset.householdGoals
    .filter(
      (goal) =>
        goal.target > goal.current &&
        !/emergency|reserve/i.test(goal.name)
    )
    .map((goal) => {
      const targetDate = goal.targetDate
        ? new Date(`${goal.targetDate}T12:00:00Z`)
        : null;
      const validDate =
        targetDate && !Number.isNaN(targetDate.getTime())
          ? targetDate
          : null;
      const monthsRemaining = validDate
        ? monthDifference(asOf, validDate)
        : null;
      const gap = Math.max(0, goal.target - goal.current);
      const requiredMonthly =
        monthsRemaining != null ? gap / monthsRemaining : null;

      return {
        ...goal,
        gap,
        monthsRemaining,
        requiredMonthly,
      };
    })
    .sort((a, b) => {
      const aPriority = a.priority ?? 100;
      const bPriority = b.priority ?? 100;
      if (aPriority !== bPriority) return aPriority - bPriority;
      if (a.monthsRemaining == null) return 1;
      if (b.monthsRemaining == null) return -1;
      return a.monthsRemaining - b.monthsRemaining;
    });

  const goalRows: GoalPlanRow[] = [];
  let goalAllocation = 0;

  for (const goal of nonReserveGoals) {
    const planned =
      goal.requiredMonthly == null
        ? 0
        : roundDollar(
            Math.min(remaining, goal.requiredMonthly)
          );

    remaining -= planned;
    goalAllocation += planned;

    goalRows.push({
      id: goal.id,
      name: goal.name,
      current: goal.current,
      target: goal.target,
      gap: goal.gap,
      targetDate: goal.targetDate ?? null,
      monthsRemaining: goal.monthsRemaining,
      requiredMonthly:
        goal.requiredMonthly == null
          ? null
          : roundDollar(goal.requiredMonthly),
      plannedMonthly: planned,
      onTrack:
        goal.requiredMonthly == null
          ? null
          : planned + 0.5 >= goal.requiredMonthly,
    });
  }

  const retirementMonths = Math.max(
    0,
    (plan.targetRetirementAge - plan.demoCurrentAge) * 12
  );
  const retirementRequiredMonthly = roundDollar(
    requiredContributionForTarget({
      principal: health.metrics.investments,
      target: plan.targetRetirementAssets,
      annualReturnPct: plan.expectedAnnualReturnPct,
      months: retirementMonths,
    })
  );
  const retirementAllocation = roundDollar(
    Math.min(remaining, retirementRequiredMonthly)
  );
  remaining -= retirementAllocation;

  const flexibleMonthly = roundDollar(Math.max(0, remaining));

  const retirementProjectedAssets = futureValueOfContributions({
    principal: health.metrics.investments,
    monthlyContribution: retirementAllocation,
    annualReturnPct: plan.expectedAnnualReturnPct,
    months: retirementMonths,
  });

  const debtScenario = simulateDebtPlan(
    debts,
    debtAllocation,
    asOf
  );
  const debtBaseline = simulateDebtPlan(
    debts,
    0,
    asOf
  );

  const lines: PlanLine[] = [];

  lines.push({
    id: "reserve",
    priority: 1,
    kind: "reserve",
    title: "Emergency reserve",
    monthlyAllocation: reserveAllocation,
    current: health.metrics.bankCash,
    target: health.metrics.reserveTarget,
    gap: reserveGap,
    targetDate: null,
    estimatedCompletionMonths:
      reserveAllocation > 0
        ? Math.ceil(reserveGap / reserveAllocation)
        : reserveGap <= 0
          ? 0
          : null,
    status:
      reserveGap <= 0
        ? "complete"
        : reserveAllocation > 0
          ? "fund"
          : "unfunded",
    why:
      reserveGap <= 0
        ? "Bank cash already meets the configured emergency-fund target."
        : `Close the ${money(
            reserveGap
          )} reserve gap over roughly 12 months before treating all surplus as long-term capital.`,
    changesWhen:
      "Changes if average spending, bank cash, or the configured emergency-fund target changes.",
  });

  lines.push({
    id: "high-interest-debt",
    priority: 2,
    kind: "high_interest_debt",
    title: "High-interest debt",
    monthlyAllocation: debtAllocation,
    current: health.metrics.highInterestDebt,
    target: 0,
    gap: health.metrics.highInterestDebt,
    targetDate: null,
    estimatedCompletionMonths:
      highInterest.length && debtAllocation > 0
        ? debtScenario.rows
            .filter((row) =>
              highInterest.some((debt) => debt.id === row.id)
            )
            .reduce<number | null>(
              (latest, row) =>
                row.payoffMonth == null
                  ? latest
                  : Math.max(latest ?? 0, row.payoffMonth),
              null
            )
        : health.metrics.highInterestDebt <= 0
          ? 0
          : null,
    status:
      health.metrics.highInterestDebt <= 0
        ? "complete"
        : debtAllocation > 0
          ? "fund"
          : "unfunded",
    why:
      health.metrics.highInterestDebt <= 0
        ? "No tracked debt is above the household high-interest review threshold."
        : `Adds enough extra payment, when surplus allows, to target roughly a 12-month payoff for debt at or above ${plan.highInterestDebtAprPct}% APR.`,
    changesWhen:
      "Changes when debt balances, APRs, minimum payments, or the high-interest threshold changes.",
  });

  let nextPriority = 3;
  for (const goal of goalRows) {
    lines.push({
      id: `goal:${goal.id}`,
      priority: nextPriority++,
      kind: "goal",
      title: goal.name,
      monthlyAllocation: goal.plannedMonthly,
      current: goal.current,
      target: goal.target,
      gap: goal.gap,
      targetDate: goal.targetDate,
      estimatedCompletionMonths:
        goal.plannedMonthly > 0
          ? Math.ceil(goal.gap / goal.plannedMonthly)
          : null,
      status:
        goal.gap <= 0
          ? "complete"
          : goal.onTrack === true
            ? "on_track"
            : goal.plannedMonthly > 0
              ? "fund"
              : "unfunded",
      why:
        goal.requiredMonthly == null
          ? "This goal has no target date, so Solpient does not invent a monthly deadline."
          : `The goal needs about ${money(
              goal.requiredMonthly
            )}/month to cover its remaining ${money(
              goal.gap
            )} by the tracked target date.`,
      changesWhen:
        "Changes when the goal balance, target amount, target date, priority, or available monthly surplus changes.",
    });
  }

  lines.push({
    id: "retirement",
    priority: nextPriority++,
    kind: "retirement",
    title: "Retirement investing",
    monthlyAllocation: retirementAllocation,
    current: health.metrics.investments,
    target: plan.targetRetirementAssets,
    gap: Math.max(
      0,
      plan.targetRetirementAssets - retirementProjectedAssets
    ),
    targetDate: null,
    estimatedCompletionMonths: retirementMonths || null,
    status:
      retirementRequiredMonthly <= 0
        ? "complete"
        : retirementAllocation >= retirementRequiredMonthly
          ? "on_track"
          : retirementAllocation > 0
            ? "fund"
            : "unfunded",
    why:
      retirementRequiredMonthly <= 0
        ? "Current invested assets already reach the tracked retirement target under the household return assumption."
        : `The tracked retirement target requires about ${money(
            retirementRequiredMonthly
          )}/month from this point under the ${plan.expectedAnnualReturnPct}% return assumption.`,
    changesWhen:
      "Changes with invested assets, retirement age, retirement target, return assumption, or available surplus.",
  });

  lines.push({
    id: "flexible",
    priority: nextPriority,
    kind: "flexible",
    title: "Flexible / unallocated",
    monthlyAllocation: flexibleMonthly,
    current: 0,
    target: null,
    gap: null,
    targetDate: null,
    estimatedCompletionMonths: null,
    status: flexibleMonthly > 0 ? "fund" : "complete",
    why:
      flexibleMonthly > 0
        ? "This is the monthly surplus left after the plan funds all currently measurable priorities."
        : "The current measurable priorities use the full observed monthly surplus.",
    changesWhen:
      "Changes whenever any earlier priority or monthly cash-flow assumption changes.",
  });

  return {
    version: "1.1",
    asOf: asOf.toISOString().slice(0, 10),
    monthlyIncome,
    monthlySpending,
    monthlySurplus,
    allocatedMonthly:
      reserveAllocation +
      debtAllocation +
      goalAllocation +
      retirementAllocation,
    flexibleMonthly,
    reserveAllocation,
    debtAllocation,
    goalAllocation,
    retirementAllocation,
    retirementRequiredMonthly,
    retirementFundingGapMonthly: Math.max(
      0,
      retirementRequiredMonthly - retirementAllocation
    ),
    debtInterestSaved: Math.max(
      0,
      debtBaseline.interestPaid - debtScenario.interestPaid
    ),
    debtPayoffMonths: debtScenario.allPaidMonth,
    baselineDebtPayoffMonths: debtBaseline.allPaidMonth,
    planLines: lines,
    debtSchedule: debtScenario.rows,
    goals: goalRows,
    policies: [
      {
        label: "Emergency reserve",
        value: `${plan.emergencyFundTargetMonths} months`,
        source: "Household planning assumption",
      },
      {
        label: "High-interest debt",
        value: `APR ≥ ${plan.highInterestDebtAprPct}%`,
        source: "Household planning assumption",
      },
      {
        label: "High-interest payoff horizon",
        value: "12 months",
        source: "V1.1 plan-engine policy",
      },
      {
        label: "Reserve catch-up horizon",
        value: "12 months",
        source: "V1.1 plan-engine policy",
      },
      {
        label: "Retirement return",
        value: `${plan.expectedAnnualReturnPct}% annual`,
        source: "Household planning assumption",
      },
    ],
  };
}
