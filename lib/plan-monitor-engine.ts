import "server-only";

import { getCashFlowIntelligence } from "@/lib/cash-flow-intelligence";
import {
  buildHouseholdFinancialPlan,
  type HouseholdFinancialPlan,
} from "@/lib/financial-plan-engine";
import { requireActiveHousehold } from "@/lib/money-auth";
import { requireMoneyDataset } from "@/lib/money-data";

type SnapshotRow = {
  id: string;
  plan_month: unknown;
  plan_version: string;
  planned_income_cents: unknown;
  planned_spending_cents: unknown;
  planned_surplus_cents: unknown;
  reserve_allocation_cents: unknown;
  debt_allocation_cents: unknown;
  goal_allocation_cents: unknown;
  retirement_allocation_cents: unknown;
  flexible_allocation_cents: unknown;
  debt_payoff_months: unknown;
  retirement_required_monthly_cents: unknown;
  baseline_plan: unknown;
  reset_count: unknown;
  captured_at: unknown;
  updated_at: unknown;
};

export type MonitorLevel = "critical" | "watch" | "positive" | "info";

export type PlanMonitorSignal = {
  id: string;
  level: MonitorLevel;
  category:
    | "spending"
    | "income"
    | "surplus"
    | "debt"
    | "goal"
    | "retirement"
    | "reserve"
    | "plan";
  title: string;
  detail: string;
  href: string;
};

export type PaceMetric = {
  plannedMonth: number;
  plannedToDate: number;
  actualToDate: number;
  projectedMonthEnd: number;
  projectedVariance: number;
  projectedVariancePct: number | null;
};

export type GoalDrift = {
  id: string;
  name: string;
  baselineRequiredMonthly: number | null;
  currentRequiredMonthly: number | null;
  baselinePlannedMonthly: number;
  currentPlannedMonthly: number;
  requiredMonthlyDelta: number | null;
  status: "stable" | "higher_requirement" | "lower_requirement" | "new" | "removed";
};

export type PlanMonitorHistory = {
  month: string;
  plannedSurplus: number;
  debtAllocation: number;
  goalAllocation: number;
  retirementAllocation: number;
  flexibleAllocation: number;
};

export type PlanMonitoringReport = {
  version: "1.2";
  month: string;
  monthLabel: string;
  dayOfMonth: number;
  daysInMonth: number;
  progressPct: number;
  baselineCapturedAt: string;
  baselineResetCount: number;
  baselinePersisted: boolean;
  baselinePlan: HouseholdFinancialPlan;
  currentPlan: HouseholdFinancialPlan;
  pace: {
    income: PaceMetric;
    spending: PaceMetric;
    surplus: PaceMetric;
  };
  drift: {
    monthlySurplusDelta: number;
    debtPayoffDeltaMonths: number | null;
    retirementRequiredMonthlyDelta: number;
    reserveAllocationDelta: number;
    debtAllocationDelta: number;
    goalAllocationDelta: number;
    retirementAllocationDelta: number;
    flexibleAllocationDelta: number;
    goals: GoalDrift[];
  };
  signals: PlanMonitorSignal[];
  alignmentScore: number;
  materialSignalCount: number;
  history: PlanMonitorHistory[];
};

function cents(value: number) {
  return Math.round(value * 100);
}

function dollars(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function monthStart(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  )
    .toISOString()
    .slice(0, 10);
}

function monthKey(date: Date) {
  return monthStart(date).slice(0, 7);
}

function monthLabel(value: string) {
  const date = new Date(`${value.slice(0, 7)}-15T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function daysInMonth(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number) {
  return `${Math.abs(value).toFixed(0)}%`;
}

function safePlan(value: unknown): HouseholdFinancialPlan | null {
  if (!value || typeof value !== "object") return null;
  const plan = value as HouseholdFinancialPlan;
  return plan.version === "1.1" && Array.isArray(plan.planLines)
    ? plan
    : null;
}

function rowToBaseline(row: SnapshotRow): HouseholdFinancialPlan {
  const stored = safePlan(row.baseline_plan);
  if (!stored) {
    throw new Error(
      "The stored V1.2 baseline is missing its V1.1 plan payload."
    );
  }
  return stored;
}

function snapshotPayload({
  householdId,
  month,
  plan,
  resetCount,
}: {
  householdId: string;
  month: string;
  plan: HouseholdFinancialPlan;
  resetCount: number;
}) {
  return {
    household_id: householdId,
    plan_month: month,
    plan_version: plan.version,
    planned_income_cents: cents(plan.monthlyIncome),
    planned_spending_cents: cents(plan.monthlySpending),
    planned_surplus_cents: cents(plan.monthlySurplus),
    reserve_allocation_cents: cents(plan.reserveAllocation),
    debt_allocation_cents: cents(plan.debtAllocation),
    goal_allocation_cents: cents(plan.goalAllocation),
    retirement_allocation_cents: cents(plan.retirementAllocation),
    flexible_allocation_cents: cents(plan.flexibleMonthly),
    debt_payoff_months: plan.debtPayoffMonths,
    retirement_required_monthly_cents: cents(
      plan.retirementRequiredMonthly
    ),
    baseline_plan: plan,
    reset_count: resetCount,
    captured_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function getCurrentInputs(now: Date) {
  const [context, cashFlow, auth] = await Promise.all([
    requireMoneyDataset(),
    getCashFlowIntelligence(),
    requireActiveHousehold(),
  ]);

  const plan = buildHouseholdFinancialPlan(
    context.dataset,
    cashFlow,
    now
  );

  return {
    context,
    cashFlow,
    auth,
    plan,
  };
}

async function selectMonthlySnapshot(
  householdId: string,
  month: string
) {
  const { supabase } = await requireActiveHousehold();
  const { data, error } = await supabase
    .from("financial_plan_snapshots")
    .select("*")
    .eq("household_id", householdId)
    .eq("plan_month", month)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read V1.2 plan baseline: ${error.message}`
    );
  }

  return (data ?? null) as SnapshotRow | null;
}

export async function saveCurrentMonthBaseline({
  overwrite = false,
  now = new Date(),
}: {
  overwrite?: boolean;
  now?: Date;
} = {}) {
  const { auth, plan } = await getCurrentInputs(now);
  const month = monthStart(now);

  const { data: existing, error: existingError } = await auth.supabase
    .from("financial_plan_snapshots")
    .select("*")
    .eq("household_id", auth.householdId)
    .eq("plan_month", month)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing && !overwrite) {
    return existing as SnapshotRow;
  }

  const resetCount = existing
    ? numberValue((existing as SnapshotRow).reset_count) + 1
    : 0;

  const payload = snapshotPayload({
    householdId: auth.householdId,
    month,
    plan,
    resetCount,
  });

  if (existing) {
    const { data, error } = await auth.supabase
      .from("financial_plan_snapshots")
      .update(payload)
      .eq("id", String((existing as SnapshotRow).id))
      .eq("household_id", auth.householdId)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(
        error?.message ?? "Unable to reset the monthly plan baseline."
      );
    }

    return data as SnapshotRow;
  }

  const { data, error } = await auth.supabase
    .from("financial_plan_snapshots")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Unable to create the monthly plan baseline."
    );
  }

  return data as SnapshotRow;
}

function paceMetric(
  plannedMonth: number,
  actualToDate: number,
  fraction: number
): PaceMetric {
  const safeFraction = Math.max(0.05, Math.min(1, fraction));
  const plannedToDate = plannedMonth * safeFraction;
  const projectedMonthEnd = actualToDate / safeFraction;
  const projectedVariance = projectedMonthEnd - plannedMonth;

  return {
    plannedMonth,
    plannedToDate,
    actualToDate,
    projectedMonthEnd,
    projectedVariance,
    projectedVariancePct:
      plannedMonth > 0
        ? (projectedVariance / plannedMonth) * 100
        : null,
  };
}

function compareGoalPlans(
  baseline: HouseholdFinancialPlan,
  current: HouseholdFinancialPlan
): GoalDrift[] {
  const baselineById = new Map(
    baseline.goals.map((goal) => [goal.id, goal])
  );
  const currentById = new Map(
    current.goals.map((goal) => [goal.id, goal])
  );
  const ids = new Set([
    ...baselineById.keys(),
    ...currentById.keys(),
  ]);

  return Array.from(ids).map((id) => {
    const before = baselineById.get(id);
    const after = currentById.get(id);

    if (!before && after) {
      return {
        id,
        name: after.name,
        baselineRequiredMonthly: null,
        currentRequiredMonthly: after.requiredMonthly,
        baselinePlannedMonthly: 0,
        currentPlannedMonthly: after.plannedMonthly,
        requiredMonthlyDelta: after.requiredMonthly,
        status: "new" as const,
      };
    }

    if (before && !after) {
      return {
        id,
        name: before.name,
        baselineRequiredMonthly: before.requiredMonthly,
        currentRequiredMonthly: null,
        baselinePlannedMonthly: before.plannedMonthly,
        currentPlannedMonthly: 0,
        requiredMonthlyDelta:
          before.requiredMonthly == null
            ? null
            : -before.requiredMonthly,
        status: "removed" as const,
      };
    }

    const beforeRequired = before?.requiredMonthly ?? null;
    const afterRequired = after?.requiredMonthly ?? null;
    const delta =
      beforeRequired == null || afterRequired == null
        ? null
        : afterRequired - beforeRequired;

    return {
      id,
      name: after?.name ?? before?.name ?? "Goal",
      baselineRequiredMonthly: beforeRequired,
      currentRequiredMonthly: afterRequired,
      baselinePlannedMonthly: before?.plannedMonthly ?? 0,
      currentPlannedMonthly: after?.plannedMonthly ?? 0,
      requiredMonthlyDelta: delta,
      status:
        delta == null || Math.abs(delta) < 25
          ? ("stable" as const)
          : delta > 0
            ? ("higher_requirement" as const)
            : ("lower_requirement" as const),
    };
  });
}

function buildSignals({
  pace,
  baseline,
  current,
  drift,
  progressPct,
}: {
  pace: PlanMonitoringReport["pace"];
  baseline: HouseholdFinancialPlan;
  current: HouseholdFinancialPlan;
  drift: PlanMonitoringReport["drift"];
  progressPct: number;
}) {
  const signals: PlanMonitorSignal[] = [];
  const reliablePace = progressPct >= 20;

  if (
    reliablePace &&
    pace.spending.projectedVariance > 100 &&
    (pace.spending.projectedVariancePct ?? 0) > 5
  ) {
    const high =
      pace.spending.projectedVariance > 300 &&
      (pace.spending.projectedVariancePct ?? 0) > 12;

    signals.push({
      id: "spending-pace",
      level: high ? "critical" : "watch",
      category: "spending",
      title: "Spending is pacing above the monthly baseline",
      detail: `Current pace projects ${money(
        pace.spending.projectedMonthEnd
      )} of spending, about ${money(
        pace.spending.projectedVariance
      )} above the saved monthly plan.`,
      href: "/cash-flow",
    });
  }

  if (
    reliablePace &&
    pace.income.projectedVariance < -200 &&
    (pace.income.projectedVariancePct ?? 0) < -8
  ) {
    signals.push({
      id: "income-pace",
      level: "watch",
      category: "income",
      title: "Income is pacing below the monthly baseline",
      detail: `Current pace projects about ${money(
        Math.abs(pace.income.projectedVariance)
      )} less income than the saved baseline.`,
      href: "/cash-flow",
    });
  }

  if (
    reliablePace &&
    pace.surplus.projectedVariance < -100 &&
    (pace.surplus.projectedVariancePct ?? 0) < -8
  ) {
    signals.push({
      id: "surplus-pace",
      level:
        pace.surplus.projectedVariance < -500 ? "critical" : "watch",
      category: "surplus",
      title: "Monthly surplus is pacing below plan",
      detail: `Projected surplus is ${money(
        pace.surplus.projectedMonthEnd
      )}, about ${money(
        Math.abs(pace.surplus.projectedVariance)
      )} below the monthly baseline.`,
      href: "/plan",
    });
  }

  if (
    drift.debtPayoffDeltaMonths != null &&
    drift.debtPayoffDeltaMonths > 0
  ) {
    signals.push({
      id: "debt-delay",
      level: drift.debtPayoffDeltaMonths >= 3 ? "critical" : "watch",
      category: "debt",
      title: `Debt payoff moved back ${drift.debtPayoffDeltaMonths} month${
        drift.debtPayoffDeltaMonths === 1 ? "" : "s"
      }`,
      detail: `The current V1.1 plan now models all tracked debt paid in ${current.debtPayoffMonths ?? "more than 600"} months versus ${baseline.debtPayoffMonths ?? "more than 600"} months at the saved baseline.`,
      href: "/debt",
    });
  } else if (
    drift.debtPayoffDeltaMonths != null &&
    drift.debtPayoffDeltaMonths < 0
  ) {
    signals.push({
      id: "debt-faster",
      level: "positive",
      category: "debt",
      title: "Debt payoff moved earlier",
      detail: `The current model is ${Math.abs(
        drift.debtPayoffDeltaMonths
      )} month(s) faster than the saved baseline.`,
      href: "/debt",
    });
  }

  if (drift.retirementRequiredMonthlyDelta > 100) {
    signals.push({
      id: "retirement-requirement",
      level:
        drift.retirementRequiredMonthlyDelta > 500 ? "critical" : "watch",
      category: "retirement",
      title: "Retirement contribution requirement increased",
      detail: `The modeled monthly requirement is now ${money(
        current.retirementRequiredMonthly
      )}, up ${money(
        drift.retirementRequiredMonthlyDelta
      )} from the saved monthly baseline.`,
      href: "/retirement",
    });
  } else if (drift.retirementRequiredMonthlyDelta < -100) {
    signals.push({
      id: "retirement-improved",
      level: "positive",
      category: "retirement",
      title: "Retirement contribution requirement decreased",
      detail: `The modeled monthly requirement improved by ${money(
        Math.abs(drift.retirementRequiredMonthlyDelta)
      )} versus the saved baseline.`,
      href: "/retirement",
    });
  }

  for (const goal of drift.goals) {
    if (
      goal.status === "higher_requirement" &&
      (goal.requiredMonthlyDelta ?? 0) >= 25
    ) {
      signals.push({
        id: `goal:${goal.id}:higher`,
        level:
          (goal.requiredMonthlyDelta ?? 0) >= 250
            ? "critical"
            : "watch",
        category: "goal",
        title: `${goal.name} needs a higher monthly contribution`,
        detail: `The required pace increased by ${money(
          goal.requiredMonthlyDelta ?? 0
        )}/month versus the saved baseline.`,
        href: "/goals",
      });
    }

    if (
      goal.status === "lower_requirement" &&
      (goal.requiredMonthlyDelta ?? 0) <= -25
    ) {
      signals.push({
        id: `goal:${goal.id}:lower`,
        level: "positive",
        category: "goal",
        title: `${goal.name} funding requirement improved`,
        detail: `The required monthly pace decreased by ${money(
          Math.abs(goal.requiredMonthlyDelta ?? 0)
        )}.`,
        href: "/goals",
      });
    }
  }

  if (drift.reserveAllocationDelta > 100) {
    signals.push({
      id: "reserve-gap",
      level: "watch",
      category: "reserve",
      title: "Reserve catch-up requirement increased",
      detail: `The current plan allocates ${money(
        current.reserveAllocation
      )}/month to reserves, up ${money(
        drift.reserveAllocationDelta
      )} from the baseline.`,
      href: "/accounts",
    });
  }

  if (!signals.some((signal) => signal.level !== "positive")) {
    signals.push({
      id: "plan-on-track",
      level: "positive",
      category: "plan",
      title: "No material plan drift detected",
      detail:
        "Current cash-flow pace and modeled plan timing remain within V1.2 materiality thresholds.",
      href: "/plan",
    });
  }

  return signals;
}

function alignmentScore(signals: PlanMonitorSignal[]) {
  let score = 100;

  for (const signal of signals) {
    if (signal.level === "critical") score -= 22;
    if (signal.level === "watch") score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

export async function getPlanMonitoring(
  now: Date = new Date(),
  options: { createBaseline?: boolean } = {}
): Promise<PlanMonitoringReport> {
  const { auth, cashFlow, plan: currentPlan } =
    await getCurrentInputs(now);
  const month = monthStart(now);

  let snapshot = await selectMonthlySnapshot(
    auth.householdId,
    month
  );
  let baselinePersisted = Boolean(snapshot);

  if (!snapshot && options.createBaseline !== false) {
    snapshot = await saveCurrentMonthBaseline({
      overwrite: false,
      now,
    });
    baselinePersisted = true;
  }

  if (!snapshot) {
    snapshot = {
      id: "ephemeral",
      plan_month: month,
      plan_version: currentPlan.version,
      planned_income_cents: cents(currentPlan.monthlyIncome),
      planned_spending_cents: cents(currentPlan.monthlySpending),
      planned_surplus_cents: cents(currentPlan.monthlySurplus),
      reserve_allocation_cents: cents(currentPlan.reserveAllocation),
      debt_allocation_cents: cents(currentPlan.debtAllocation),
      goal_allocation_cents: cents(currentPlan.goalAllocation),
      retirement_allocation_cents: cents(currentPlan.retirementAllocation),
      flexible_allocation_cents: cents(currentPlan.flexibleMonthly),
      debt_payoff_months: currentPlan.debtPayoffMonths,
      retirement_required_monthly_cents: cents(
        currentPlan.retirementRequiredMonthly
      ),
      baseline_plan: currentPlan,
      reset_count: 0,
      captured_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
  }

  const baselinePlan = rowToBaseline(snapshot);
  const key = monthKey(now);
  const currentMonth =
    cashFlow.monthly.find((item) => item.key === key) ?? null;

  const dayOfMonth = now.getUTCDate();
  const totalDays = daysInMonth(now);
  const fraction = Math.max(
    1 / totalDays,
    Math.min(1, dayOfMonth / totalDays)
  );

  const actualIncome = currentMonth?.income ?? 0;
  const actualSpending = currentMonth?.spending ?? 0;
  const actualSurplus = actualIncome - actualSpending;

  const pace = {
    income: paceMetric(
      baselinePlan.monthlyIncome,
      actualIncome,
      fraction
    ),
    spending: paceMetric(
      baselinePlan.monthlySpending,
      actualSpending,
      fraction
    ),
    surplus: paceMetric(
      baselinePlan.monthlySurplus,
      actualSurplus,
      fraction
    ),
  };

  const debtPayoffDeltaMonths =
    baselinePlan.debtPayoffMonths == null ||
    currentPlan.debtPayoffMonths == null
      ? null
      : currentPlan.debtPayoffMonths - baselinePlan.debtPayoffMonths;

  const goals = compareGoalPlans(
    baselinePlan,
    currentPlan
  );

  const drift = {
    monthlySurplusDelta:
      currentPlan.monthlySurplus - baselinePlan.monthlySurplus,
    debtPayoffDeltaMonths,
    retirementRequiredMonthlyDelta:
      currentPlan.retirementRequiredMonthly -
      baselinePlan.retirementRequiredMonthly,
    reserveAllocationDelta:
      currentPlan.reserveAllocation - baselinePlan.reserveAllocation,
    debtAllocationDelta:
      currentPlan.debtAllocation - baselinePlan.debtAllocation,
    goalAllocationDelta:
      currentPlan.goalAllocation - baselinePlan.goalAllocation,
    retirementAllocationDelta:
      currentPlan.retirementAllocation -
      baselinePlan.retirementAllocation,
    flexibleAllocationDelta:
      currentPlan.flexibleMonthly - baselinePlan.flexibleMonthly,
    goals,
  };

  const progressPct = fraction * 100;
  const signals = buildSignals({
    pace,
    baseline: baselinePlan,
    current: currentPlan,
    drift,
    progressPct,
  });

  const { data: historyRows, error: historyError } =
    await auth.supabase
      .from("financial_plan_snapshots")
      .select("*")
      .eq("household_id", auth.householdId)
      .order("plan_month", { ascending: false })
      .limit(12);

  if (historyError) {
    throw new Error(historyError.message);
  }

  const history: PlanMonitorHistory[] = (
    (historyRows ?? []) as SnapshotRow[]
  )
    .map((row) => ({
      month: String(row.plan_month).slice(0, 10),
      plannedSurplus: dollars(row.planned_surplus_cents),
      debtAllocation: dollars(row.debt_allocation_cents),
      goalAllocation: dollars(row.goal_allocation_cents),
      retirementAllocation: dollars(
        row.retirement_allocation_cents
      ),
      flexibleAllocation: dollars(
        row.flexible_allocation_cents
      ),
    }))
    .reverse();

  return {
    version: "1.2",
    month,
    monthLabel: monthLabel(month),
    dayOfMonth,
    daysInMonth: totalDays,
    progressPct,
    baselineCapturedAt: normalizeIso(snapshot.captured_at),
    baselineResetCount: numberValue(snapshot.reset_count),
    baselinePersisted,
    baselinePlan,
    currentPlan,
    pace,
    drift,
    signals,
    alignmentScore: alignmentScore(signals),
    materialSignalCount: signals.filter(
      (signal) =>
        signal.level === "critical" ||
        signal.level === "watch"
    ).length,
    history,
  };
}
