import "server-only";

import { requireActiveHousehold } from "@/lib/money-auth";
import { getTspEstimatedCurrentValue } from "@/lib/tsp-prices";

export const TSP_2026_RULES = {
  year: 2026,
  employeeDeferralLimit: 24_500,
  catchUp50Plus: 8_000,
  catchUpAge60To63: 11_250,
  annualAdditionsLimit: 72_000,
  rothCatchUpPriorYearWageThreshold: 150_000,
} as const;

export type TspProfile = {
  retirementSystem: "brs" | "legacy" | "unknown";
  serviceComponent: "active" | "reserve" | "guard" | "other";
  serviceEntryDate: string | null;
  ageAtYearEnd: number | null;
  annualBasicPay: number;
  traditionalContributionPct: number;
  rothContributionPct: number;
  externalDeferralsYtd: number;
  priorYearPlanWages: number;
  linkedAccountId: string | null;
};

export type TspSnapshot = {
  id: string;
  date: string;
  traditionalBalance: number;
  rothBalance: number;
  totalBalance: number;
  outstandingLoan: number;
  employeeContribYtd: number;
  serviceAutoYtd: number;
  serviceMatchYtd: number;
  note: string | null;
};

export type TspFundPosition = {
  code: string;
  name: string;
  balance: number;
  allocationPct: number;
};

export type TspSignal = {
  id: string;
  level: "critical" | "watch" | "positive" | "info";
  title: string;
  detail: string;
};

export type TspTracker = {
  rules: typeof TSP_2026_RULES;
  profile: TspProfile | null;
  snapshot: TspSnapshot | null;
  funds: TspFundPosition[];
  history: TspSnapshot[];
  totalContributionPct: number;
  employeeAnnualLimit: number;
  remainingEmployeeLimit: number;
  employeeLimitUsedPct: number;
  monthsRemaining: number;
  monthlyElectedContribution: number;
  monthlyNeededToMax: number | null;
  suggestedBasicPayPctToMax: number | null;
  projectedEmployeeDeferrals: number;
  projectedExcess: number;
  serviceMonths: number | null;
  brsAutomaticEligible: boolean;
  brsMatchingEligible: boolean;
  brsAutomaticPct: number;
  brsMatchPct: number;
  brsGovernmentPct: number;
  projectedMonthlyGovernmentContribution: number;
  fullMatchContributionPct: number;
  fullMatchReached: boolean;
  maxEarlyRisk: boolean;
  rothCatchUpRequired: boolean;
  fundBalanceTotal: number;
  fundReconciliationDifference: number;
  estimatedCurrentValue: number | null;
  estimatedChange: number | null;
  estimatedChangePct: number | null;
  latestPriceDate: string | null;
  mixedPriceDates: boolean;
  newestPriceDate: string | null;
  oldestPriceDate: string | null;
  priceAgeDays: number | null;
  estimatedFunds: Awaited<ReturnType<typeof getTspEstimatedCurrentValue>>["positions"];
  signals: TspSignal[];
};

type Row = Record<string, unknown>;

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableN(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dollarsFromCents(value: unknown) {
  return n(value) / 100;
}

function dateOnly(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw.slice(0, 10)
    : parsed.toISOString().slice(0, 10);
}

function daysOfService(entryDate: string | null, now: Date) {
  if (!entryDate) return null;
  const start = new Date(`${entryDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start > now) return null;
  return Math.floor(
    (now.getTime() - start.getTime()) / 86_400_000
  );
}

function monthsOfService(entryDate: string | null, now: Date) {
  if (!entryDate) return null;
  const start = new Date(`${entryDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || start > now) return null;

  let months =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - start.getUTCMonth());

  if (now.getUTCDate() < start.getUTCDate()) {
    months -= 1;
  }

  return Math.max(0, months);
}

function employeeLimitForAge(age: number | null) {
  if (age == null || age < 50) {
    return TSP_2026_RULES.employeeDeferralLimit;
  }

  if (age >= 60 && age <= 63) {
    return (
      TSP_2026_RULES.employeeDeferralLimit +
      TSP_2026_RULES.catchUpAge60To63
    );
  }

  return (
    TSP_2026_RULES.employeeDeferralLimit +
    TSP_2026_RULES.catchUp50Plus
  );
}

function brsMatchPct(rate: number) {
  const safeRate = Math.max(0, rate);

  if (safeRate <= 3) {
    return safeRate;
  }

  if (safeRate < 5) {
    return 3 + (safeRate - 3) * 0.5;
  }

  return 4;
}

function profileFromRow(row: Row | null): TspProfile | null {
  if (!row) return null;

  const retirementSystem =
    row.retirement_system === "brs" ||
    row.retirement_system === "legacy"
      ? row.retirement_system
      : "unknown";

  const serviceComponent =
    row.service_component === "reserve" ||
    row.service_component === "guard" ||
    row.service_component === "other"
      ? row.service_component
      : "active";

  return {
    retirementSystem,
    serviceComponent,
    serviceEntryDate: dateOnly(row.service_entry_date),
    ageAtYearEnd: nullableN(row.age_at_year_end),
    annualBasicPay: dollarsFromCents(row.annual_basic_pay_cents),
    traditionalContributionPct: n(row.traditional_contribution_pct),
    rothContributionPct: n(row.roth_contribution_pct),
    externalDeferralsYtd: dollarsFromCents(row.external_deferrals_ytd_cents),
    priorYearPlanWages: dollarsFromCents(row.prior_year_plan_wages_cents),
    linkedAccountId:
      row.linked_account_id == null ? null : String(row.linked_account_id),
  };
}

function snapshotFromRow(row: Row): TspSnapshot {
  const traditionalBalance = dollarsFromCents(
    row.traditional_balance_cents
  );
  const rothBalance = dollarsFromCents(row.roth_balance_cents);

  return {
    id: String(row.id ?? ""),
    date: dateOnly(row.snapshot_date) ?? "",
    traditionalBalance,
    rothBalance,
    totalBalance: traditionalBalance + rothBalance,
    outstandingLoan: dollarsFromCents(row.outstanding_loan_cents),
    employeeContribYtd: dollarsFromCents(row.employee_contrib_ytd_cents),
    serviceAutoYtd: dollarsFromCents(row.service_auto_ytd_cents),
    serviceMatchYtd: dollarsFromCents(row.service_match_ytd_cents),
    note: row.note == null ? null : String(row.note),
  };
}

function monthsRemainingAfter(date: string | null, now: Date) {
  const basis = date ? new Date(`${date}T12:00:00`) : now;
  if (Number.isNaN(basis.getTime())) return 0;
  return Math.max(0, 11 - basis.getMonth());
}

export async function getTspTracker(
  now = new Date()
): Promise<TspTracker> {
  const { supabase, householdId } = await requireActiveHousehold();

  const [profileResult, snapshotsResult, estimate] = await Promise.all([
    supabase
      .from("tsp_profiles")
      .select("*")
      .eq("household_id", householdId)
      .maybeSingle(),
    supabase
      .from("tsp_snapshots")
      .select("*")
      .eq("household_id", householdId)
      .order("snapshot_date", { ascending: false })
      .limit(36),
    getTspEstimatedCurrentValue(),
  ]);

  if (profileResult.error) {
    throw new Error(
      `Unable to load TSP profile: ${profileResult.error.message}`
    );
  }

  if (snapshotsResult.error) {
    throw new Error(
      `Unable to load TSP history: ${snapshotsResult.error.message}`
    );
  }

  const profile = profileFromRow(
    (profileResult.data ?? null) as Row | null
  );

  const history = ((snapshotsResult.data ?? []) as Row[])
    .map(snapshotFromRow);

  const snapshot = history[0] ?? null;

  let fundRows: Row[] = [];
  if (snapshot) {
    const result = await supabase
      .from("tsp_fund_positions")
      .select("*")
      .eq("household_id", householdId)
      .eq("snapshot_id", snapshot.id)
      .order("balance_cents", { ascending: false });

    if (result.error) {
      throw new Error(
        `Unable to load TSP fund allocation: ${result.error.message}`
      );
    }

    fundRows = (result.data ?? []) as Row[];
  }

  const fundBalanceTotal = fundRows.reduce(
    (sum, row) => sum + dollarsFromCents(row.balance_cents),
    0
  );

  const funds: TspFundPosition[] = fundRows.map((row) => {
    const balance = dollarsFromCents(row.balance_cents);
    return {
      code: String(row.fund_code ?? "").toUpperCase(),
      name: String(row.fund_name ?? ""),
      balance,
      allocationPct:
        fundBalanceTotal > 0 ? (balance / fundBalanceTotal) * 100 : 0,
    };
  });

  const totalContributionPct = profile
    ? profile.traditionalContributionPct + profile.rothContributionPct
    : 0;
  const employeeAnnualLimit = employeeLimitForAge(
    profile?.ageAtYearEnd ?? null
  );
  const employeeUsed =
    (snapshot?.employeeContribYtd ?? 0) +
    (profile?.externalDeferralsYtd ?? 0);
  const remainingEmployeeLimit = Math.max(
    0,
    employeeAnnualLimit - employeeUsed
  );
  const employeeLimitUsedPct =
    employeeAnnualLimit > 0
      ? Math.min(100, (employeeUsed / employeeAnnualLimit) * 100)
      : 0;
  const monthsRemaining = monthsRemainingAfter(snapshot?.date ?? null, now);
  const monthlyBasicPay = (profile?.annualBasicPay ?? 0) / 12;
  const monthlyElectedContribution =
    monthlyBasicPay * (totalContributionPct / 100);
  const monthlyNeededToMax =
    monthsRemaining > 0
      ? remainingEmployeeLimit / monthsRemaining
      : remainingEmployeeLimit > 0
        ? null
        : 0;
  const suggestedBasicPayPctToMax =
    monthlyNeededToMax != null && monthlyBasicPay > 0
      ? (monthlyNeededToMax / monthlyBasicPay) * 100
      : null;
  const projectedEmployeeDeferrals =
    employeeUsed +
    monthlyElectedContribution * monthsRemaining;
  const projectedExcess = Math.max(
    0,
    projectedEmployeeDeferrals - employeeAnnualLimit
  );

  const serviceMonths = monthsOfService(
    profile?.serviceEntryDate ?? null,
    now
  );
  const serviceDays = daysOfService(
    profile?.serviceEntryDate ?? null,
    now
  );
  const isBrs = profile?.retirementSystem === "brs";
  const through26YearPayPeriod =
    serviceMonths == null ? false : serviceMonths <= 26 * 12;
  const brsAutomaticEligible =
    Boolean(
      isBrs &&
      serviceDays != null &&
      serviceDays >= 60 &&
      through26YearPayPeriod
    );
  const brsMatchingEligible =
    Boolean(
      isBrs &&
      serviceMonths != null &&
      serviceMonths >= 24 &&
      through26YearPayPeriod
    );
  const brsAutomaticPct = brsAutomaticEligible ? 1 : 0;
  const brsMatch = brsMatchingEligible
    ? brsMatchPct(totalContributionPct)
    : 0;
  const brsGovernmentPct = brsAutomaticPct + brsMatch;
  const projectedMonthlyGovernmentContribution =
    monthlyBasicPay * (brsGovernmentPct / 100);
  const fullMatchContributionPct = 5;
  const fullMatchReached =
    !brsMatchingEligible || totalContributionPct >= fullMatchContributionPct;
  const monthsUntilLimit =
    monthlyElectedContribution > 0
      ? remainingEmployeeLimit / monthlyElectedContribution
      : Number.POSITIVE_INFINITY;
  const maxEarlyRisk =
    brsMatchingEligible &&
    remainingEmployeeLimit > 0 &&
    monthsRemaining > 0 &&
    monthsUntilLimit + 0.15 < monthsRemaining;
  const rothCatchUpRequired =
    Boolean(
      profile &&
      (profile.ageAtYearEnd ?? 0) >= 50 &&
      profile.priorYearPlanWages >
        TSP_2026_RULES.rothCatchUpPriorYearWageThreshold
    );

  const signals: TspSignal[] = [];

  if (!profile) {
    signals.push({
      id: "tsp:profile-needed",
      level: "watch",
      title: "Complete your military TSP profile",
      detail:
        "Add retirement system, service entry date, age, basic pay, and contribution percentages so Solpient can calculate BRS matching and annual-limit pace.",
    });
  }

  if (!snapshot) {
    signals.push({
      id: "tsp:snapshot-needed",
      level: "watch",
      title: "Add your first TSP snapshot",
      detail:
        "Enter Traditional/Roth balances and year-to-date contributions from your TSP statement or account dashboard.",
    });
  }

  if (brsMatchingEligible && totalContributionPct < 5) {
    signals.push({
      id: "tsp:below-full-brs-match",
      level: "critical",
      title: "Contribution rate is below the full BRS match threshold",
      detail:
        `Your Traditional + Roth basic-pay contribution rate is ${totalContributionPct.toFixed(
          1
        )}%. A 5% member contribution receives the full 1% automatic plus up to 4% matching structure while eligible.`,
    });
  } else if (brsMatchingEligible && totalContributionPct >= 5) {
    signals.push({
      id: "tsp:full-brs-match",
      level: "positive",
      title: "Current election reaches the full BRS match threshold",
      detail:
        `Your combined member contribution is ${totalContributionPct.toFixed(
          1
        )}% of basic pay, at or above the 5% threshold for the full match structure while eligible.`,
    });
  }

  if (maxEarlyRisk) {
    signals.push({
      id: "tsp:max-too-early",
      level: "watch",
      title: "Projected to reach the employee limit before year-end",
      detail:
        "At the current estimated monthly pace, you may reach the annual elective-deferral limit before the final months of the year. BRS matching is pay-period based, so review the election rather than assuming a year-end true-up.",
    });
  }

  if (projectedExcess > 0) {
    signals.push({
      id: "tsp:projected-limit-excess",
      level: "watch",
      title: "Projected employee deferrals exceed the annual limit",
      detail:
        `Current TSP plus entered outside-plan deferrals project about $${projectedExcess.toLocaleString(
          "en-US",
          { maximumFractionDigits: 0 }
        )} above the ${TSP_2026_RULES.year} employee limit.`,
    });
  }

  if (rothCatchUpRequired) {
    signals.push({
      id: "tsp:roth-catchup-rule",
      level: "info",
      title: "2026 Roth catch-up rule may apply",
      detail:
        "You are age 50+ and entered prior-year plan wages above the 2026 threshold. Catch-up contributions may need to be Roth; verify payroll/TSP treatment for your specific compensation.",
    });
  }

  const fundReconciliationDifference =
    (snapshot?.totalBalance ?? 0) - fundBalanceTotal;

  const freshnessDate =
    estimate.oldestPriceDate ??
    estimate.priceDate;

  const priceAgeDays =
    freshnessDate
      ? Math.max(
          0,
          Math.floor(
            (now.getTime() -
              new Date(
                `${freshnessDate}T12:00:00Z`
              ).getTime()) /
              86_400_000
          )
        )
      : null;

  if (
    profile &&
    snapshot &&
    funds.length > 0 &&
    estimate.mixedPriceDates
  ) {
    signals.push({
      id: "tsp:mixed-price-dates",
      level: "watch",
      title: "Owned TSP funds have different official price dates",
      detail:
        "Solpient is showing each fund's latest official TSP share price, but it withholds the single total estimated value until all owned funds share one official as-of date.",
    });
  }

  if (
    profile &&
    snapshot &&
    funds.length > 0 &&
    estimate.estimatedCurrentValue == null &&
    !estimate.mixedPriceDates
  ) {
    signals.push({
      id: "tsp:prices-not-synced",
      level: "watch",
      title: "Daily TSP prices are not synced yet",
      detail:
        "Use Sync prices now or let the local Autopilot fetch the official TSP share-price feed. The official account snapshot remains unchanged.",
    });
  } else if (
    profile &&
    snapshot &&
    priceAgeDays != null &&
    priceAgeDays > 4
  ) {
    signals.push({
      id: "tsp:prices-stale",
      level: "watch",
      title: "Cached TSP share prices are stale",
      detail:
        `The newest cached TSP share price is dated ${estimate.priceDate}. Solpient will keep showing the last price date rather than describing it as live.`,
    });
  }

  if (
    snapshot &&
    funds.length > 0 &&
    Math.abs(fundReconciliationDifference) > 10
  ) {
    signals.push({
      id: "tsp:fund-balance-mismatch",
      level: "watch",
      title: "Fund balances do not reconcile to the TSP balance",
      detail:
        `Fund entries differ from Traditional + Roth balances by $${Math.abs(
          fundReconciliationDifference
        ).toLocaleString("en-US", { maximumFractionDigits: 0 })}. Check the snapshot before using allocation percentages.`,
    });
  }

  if (!signals.length) {
    signals.push({
      id: "tsp:no-material-issue",
      level: "positive",
      title: "No material TSP tracking issue detected",
      detail:
        "Current contribution pace, BRS match threshold, annual limit, and fund reconciliation are within the tracker’s rules.",
    });
  }

  const rank = {
    critical: 4,
    watch: 3,
    positive: 2,
    info: 1,
  };

  signals.sort((a, b) => rank[b.level] - rank[a.level]);

  return {
    rules: TSP_2026_RULES,
    profile,
    snapshot,
    funds,
    history,
    totalContributionPct,
    employeeAnnualLimit,
    remainingEmployeeLimit,
    employeeLimitUsedPct,
    monthsRemaining,
    monthlyElectedContribution,
    monthlyNeededToMax,
    suggestedBasicPayPctToMax,
    projectedEmployeeDeferrals,
    projectedExcess,
    serviceMonths,
    brsAutomaticEligible,
    brsMatchingEligible,
    brsAutomaticPct,
    brsMatchPct: brsMatch,
    brsGovernmentPct,
    projectedMonthlyGovernmentContribution,
    fullMatchContributionPct,
    fullMatchReached,
    maxEarlyRisk,
    rothCatchUpRequired,
    fundBalanceTotal,
    fundReconciliationDifference,
    estimatedCurrentValue:
      estimate.estimatedCurrentValue,
    estimatedChange:
      estimate.estimatedChange,
    estimatedChangePct:
      estimate.estimatedChangePct,
    latestPriceDate:
      estimate.priceDate,
    mixedPriceDates:
      estimate.mixedPriceDates,
    newestPriceDate:
      estimate.newestPriceDate,
    oldestPriceDate:
      estimate.oldestPriceDate,
    priceAgeDays,
    estimatedFunds:
      estimate.positions,
    signals,
  };
}
