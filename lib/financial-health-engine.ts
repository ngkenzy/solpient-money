import "server-only";

import type { MoneyDataset } from "@/lib/demo-data";
import type { CashFlowIntelligence } from "@/lib/cash-flow-intelligence";

export type HealthStatus = "healthy" | "review" | "critical";

export type FinancialHealthComponent = {
  key: "liquidity" | "cashflow" | "debt" | "portfolio" | "retirement" | "goals";
  label: string;
  score: number;
  maxScore: number;
  status: HealthStatus;
  detail: string;
  inputs: string[];
  calculation: string;
  href: string;
};

export type FinancialHealthAttention = {
  id: string;
  priority: number;
  level: "critical" | "review" | "positive";
  title: string;
  detail: string;
  href: string;
};

export type FinancialHealthMetrics = {
  assets: number;
  liabilities: number;
  netWorth: number;
  propertyValue: number;
  bankCash: number;
  investments: number;
  emergencyFundMonths: number;
  reserveTarget: number;
  reserveGap: number;
  savingsRate: number;
  fixedCostRatioPct: number;
  incomeStabilityPct: number;
  debtToAssetsPct: number;
  monthlyDebtMinimums: number;
  debtServiceRatioPct: number;
  highInterestDebt: number;
  annualizedDebtInterest: number;
  largestStockTicker: string | null;
  largestStockPct: number;
  topThreeStockPct: number;
  portfolioCashPct: number;
  retirementProjectedAssets: number;
  retirementTargetAssets: number;
  retirementFundingPct: number;
  retirementYears: number;
  averageGoalFundingPct: number;
};

export type FinancialHealthEngine = {
  version: "0.9.3";
  score: number;
  status: HealthStatus;
  components: FinancialHealthComponent[];
  attention: FinancialHealthAttention[];
  metrics: FinancialHealthMetrics;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function futureValue(
  principal: number,
  monthlyContribution: number,
  annualReturnPct: number,
  months: number
) {
  if (months <= 0) return principal;

  const monthlyRate = annualReturnPct / 100 / 12;

  if (Math.abs(monthlyRate) < 0.0000001) {
    return principal + monthlyContribution * months;
  }

  const growth = Math.pow(1 + monthlyRate, months);
  return (
    principal * growth +
    monthlyContribution * ((growth - 1) / monthlyRate)
  );
}

function componentStatus(
  score: number,
  maxScore: number,
  healthyRatio = 0.8,
  reviewRatio = 0.5
): HealthStatus {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (ratio >= healthyRatio) return "healthy";
  if (ratio >= reviewRatio) return "review";
  return "critical";
}

function overallStatus(score: number): HealthStatus {
  if (score >= 80) return "healthy";
  if (score >= 55) return "review";
  return "critical";
}

export function buildFinancialHealthEngine(
  dataset: MoneyDataset,
  cashFlow: CashFlowIntelligence
): FinancialHealthEngine {
  const { accounts, holdings, householdPlan, householdGoals } = dataset;

  const assets = accounts
    .filter((account) => account.balance > 0)
    .reduce((sum, account) => sum + account.balance, 0);

  const debtAccounts = accounts.filter(
    (account) => account.type === "debt"
  );

  const liabilities = Math.abs(
    debtAccounts.reduce((sum, account) => sum + account.balance, 0)
  );

  const propertyValue = accounts
    .filter((account) => account.type === "property")
    .reduce((sum, account) => sum + account.balance, 0);

  const bankCash = accounts
    .filter((account) => account.type === "cash")
    .reduce((sum, account) => sum + account.balance, 0);

  const investments = holdings.reduce(
    (sum, holding) => sum + holding.value,
    0
  );

  const portfolioCash = holdings
    .filter((holding) => holding.kind === "cash")
    .reduce((sum, holding) => sum + holding.value, 0);

  const monthlySpending =
    cashFlow.monthly.length > 0
      ? cashFlow.monthly.reduce(
          (sum, month) => sum + month.spending,
          0
        ) / cashFlow.monthly.length
      : 0;

  const monthlyIncome =
    cashFlow.monthly.length > 0
      ? cashFlow.monthly.reduce(
          (sum, month) => sum + month.income,
          0
        ) / cashFlow.monthly.length
      : 0;

  const emergencyFundMonths =
    monthlySpending > 0 ? bankCash / monthlySpending : 0;

  const reserveTarget =
    monthlySpending * householdPlan.emergencyFundTargetMonths;

  const reserveGap = Math.max(0, reserveTarget - bankCash);

  const highInterestDebt = debtAccounts
    .filter(
      (account) =>
        (account.apr ?? 0) >=
        householdPlan.highInterestDebtAprPct
    )
    .reduce((sum, account) => sum + Math.abs(account.balance), 0);

  const annualizedDebtInterest = debtAccounts.reduce(
    (sum, account) =>
      sum +
      Math.abs(account.balance) * ((account.apr ?? 0) / 100),
    0
  );

  const monthlyDebtMinimums = debtAccounts.reduce(
    (sum, account) => sum + (account.minimumPayment ?? 0),
    0
  );

  const debtToAssetsPct =
    assets > 0 ? (liabilities / assets) * 100 : 0;

  const debtServiceRatioPct =
    monthlyIncome > 0
      ? (monthlyDebtMinimums / monthlyIncome) * 100
      : monthlyDebtMinimums > 0
        ? 100
        : 0;

  const directStocks = holdings.filter(
    (holding) => holding.kind === "stock"
  );

  const stockWeights = directStocks
    .map((holding) => ({
      ticker: holding.ticker,
      weight:
        investments > 0
          ? (holding.value / investments) * 100
          : 0,
    }))
    .sort((a, b) => b.weight - a.weight);

  const largestStock = stockWeights[0] ?? null;
  const topThreeStockPct = stockWeights
    .slice(0, 3)
    .reduce((sum, item) => sum + item.weight, 0);

  const portfolioCashPct =
    investments > 0 ? (portfolioCash / investments) * 100 : 0;

  const retirementYears = Math.max(
    0,
    householdPlan.targetRetirementAge -
      householdPlan.demoCurrentAge
  );

  const positiveMonthlyContribution = Math.max(
    0,
    cashFlow.health.latestSaved,
    cashFlow.monthly.length
      ? cashFlow.monthly.reduce(
          (sum, month) => sum + month.saved,
          0
        ) / cashFlow.monthly.length
      : 0
  );

  const retirementProjectedAssets = futureValue(
    investments,
    positiveMonthlyContribution,
    householdPlan.expectedAnnualReturnPct,
    retirementYears * 12
  );

  const retirementFundingPct =
    householdPlan.targetRetirementAssets > 0
      ? (retirementProjectedAssets /
          householdPlan.targetRetirementAssets) *
        100
      : 0;

  const goalRatios = householdGoals
    .filter((goal) => goal.target > 0)
    .map((goal) => Math.min(1, goal.current / goal.target));

  const averageGoalFundingPct =
    goalRatios.length > 0
      ? (goalRatios.reduce((sum, ratio) => sum + ratio, 0) /
          goalRatios.length) *
        100
      : 0;

  const liquidityRatio =
    householdPlan.emergencyFundTargetMonths > 0
      ? emergencyFundMonths /
        householdPlan.emergencyFundTargetMonths
      : 0;
  const liquidityScore = clamp(liquidityRatio * 20, 0, 20);

  const savingsPoints =
    cashFlow.health.trailingSavingsRate >= 20
      ? 12
      : cashFlow.health.trailingSavingsRate >= 10
        ? 9
        : cashFlow.health.trailingSavingsRate >= 0
          ? 5
          : 1;

  const stabilityPoints =
    cashFlow.health.incomeStabilityPct >= 85
      ? 4
      : cashFlow.health.incomeStabilityPct >= 70
        ? 3
        : cashFlow.health.incomeStabilityPct >= 50
          ? 2
          : 1;

  const fixedCostPoints =
    cashFlow.health.fixedCostRatioPct <= 50
      ? 4
      : cashFlow.health.fixedCostRatioPct <= 70
        ? 2
        : 0;

  const cashFlowScore = clamp(
    savingsPoints + stabilityPoints + fixedCostPoints,
    0,
    20
  );

  let debtScore = 20;
  if (highInterestDebt > 0) debtScore -= 8;
  if (debtToAssetsPct > 40) debtScore -= 6;
  else if (debtToAssetsPct > 25) debtScore -= 3;
  if (debtServiceRatioPct > 30) debtScore -= 6;
  else if (debtServiceRatioPct > 20) debtScore -= 3;
  debtScore = clamp(debtScore, 0, 20);

  let portfolioScore = 15;
  if (
    (largestStock?.weight ?? 0) >
    householdPlan.singleStockReviewPct
  ) {
    portfolioScore -= 5;
  }
  if (
    topThreeStockPct >
    householdPlan.topThreeStockReviewPct
  ) {
    portfolioScore -= 4;
  }
  if (
    portfolioCashPct >
    householdPlan.portfolioCashReviewPct
  ) {
    portfolioScore -= 3;
  }
  portfolioScore = clamp(portfolioScore, 0, 15);

  const retirementScore = clamp(
    (retirementFundingPct / 100) * 20,
    0,
    20
  );

  const goalsScore = clamp(
    (averageGoalFundingPct / 100) * 5,
    0,
    5
  );

  const components: FinancialHealthComponent[] = [
    {
      key: "liquidity",
      label: "Liquidity",
      score: liquidityScore,
      maxScore: 20,
      status: componentStatus(liquidityScore, 20),
      detail: `${emergencyFundMonths.toFixed(
        1
      )} months of average spending held in bank cash against a ${householdPlan.emergencyFundTargetMonths}-month household target.`,
      inputs: [
        `Bank cash: ${money(bankCash)}`,
        `Average monthly spending: ${money(monthlySpending)}`,
        `Reserve target: ${money(reserveTarget)}`,
      ],
      calculation:
        "20 × min(1, emergency-fund months ÷ household target months)",
      href: "/accounts",
    },
    {
      key: "cashflow",
      label: "Cash flow",
      score: cashFlowScore,
      maxScore: 20,
      status: componentStatus(cashFlowScore, 20),
      detail: `${pct(
        cashFlow.health.trailingSavingsRate
      )} trailing savings rate, ${pct(
        cashFlow.health.incomeStabilityPct
      )} income stability, and ${pct(
        cashFlow.health.fixedCostRatioPct
      )} fixed-cost ratio.`,
      inputs: [
        `Latest income: ${money(
          cashFlow.health.latestIncome
        )}`,
        `Latest spending: ${money(
          cashFlow.health.latestSpending
        )}`,
        `Recurring bills + subscriptions: ${money(
          cashFlow.health.recurringBillsMonthly +
            cashFlow.health.subscriptionsMonthly
        )}/mo`,
      ],
      calculation:
        "Savings-rate points (12) + income-stability points (4) + fixed-cost points (4)",
      href: "/cash-flow",
    },
    {
      key: "debt",
      label: "Debt",
      score: debtScore,
      maxScore: 20,
      status:
        highInterestDebt > 0
          ? debtScore < 10
            ? "critical"
            : "review"
          : componentStatus(debtScore, 20),
      detail: `${pct(
        debtToAssetsPct
      )} debt/assets and ${pct(
        debtServiceRatioPct
      )} minimum-payment/income ratio.`,
      inputs: [
        `Total liabilities: ${money(liabilities)}`,
        `High-interest debt: ${money(highInterestDebt)}`,
        `Monthly minimum payments: ${money(monthlyDebtMinimums)}`,
        `Annualized interest at current balances: ${money(
          annualizedDebtInterest
        )}`,
      ],
      calculation:
        "Start at 20; subtract transparent penalties for high-interest debt, debt/assets, and minimum-payment burden",
      href: "/debt",
    },
    {
      key: "portfolio",
      label: "Portfolio structure",
      score: portfolioScore,
      maxScore: 15,
      status: componentStatus(portfolioScore, 15),
      detail: `Largest direct stock ${pct(
        largestStock?.weight ?? 0
      )}; top three ${pct(
        topThreeStockPct
      )}; portfolio cash ${pct(portfolioCashPct)}.`,
      inputs: [
        `Largest stock: ${largestStock?.ticker ?? "—"} ${pct(
          largestStock?.weight ?? 0
        )}`,
        `Single-stock review threshold: ${pct(
          householdPlan.singleStockReviewPct
        )}`,
        `Top-three review threshold: ${pct(
          householdPlan.topThreeStockReviewPct
        )}`,
        `Portfolio-cash review threshold: ${pct(
          householdPlan.portfolioCashReviewPct
        )}`,
      ],
      calculation:
        "Start at 15; subtract only when household-configured concentration or cash review thresholds are crossed",
      href: "/portfolio",
    },
    {
      key: "retirement",
      label: "Retirement trajectory",
      score: retirementScore,
      maxScore: 20,
      status: componentStatus(retirementScore, 20),
      detail: `Baseline projection funds ${retirementFundingPct.toFixed(
        0
      )}% of the ${money(
        householdPlan.targetRetirementAssets
      )} household target by age ${householdPlan.targetRetirementAge}.`,
      inputs: [
        `Invested assets: ${money(investments)}`,
        `Monthly contribution assumption: ${money(
          positiveMonthlyContribution
        )}`,
        `Return assumption: ${pct(
          householdPlan.expectedAnnualReturnPct
        )}`,
        `Years to target: ${retirementYears}`,
      ],
      calculation:
        "Projected assets using current investments + observed positive monthly surplus; score = 20 × capped target-funding ratio",
      href: "/retirement",
    },
    {
      key: "goals",
      label: "Tracked goals",
      score: goalsScore,
      maxScore: 5,
      status: componentStatus(goalsScore, 5, 0.8, 0.4),
      detail: `${averageGoalFundingPct.toFixed(
        0
      )}% average funding across tracked household goals.`,
      inputs:
        householdGoals.length > 0
          ? householdGoals.map(
              (goal) =>
                `${goal.name}: ${money(goal.current)} / ${money(
                  goal.target
                )}`
            )
          : ["No tracked household goals"],
      calculation:
        "5 × average capped current/target funding ratio across tracked goals",
      href: "/goals",
    },
  ];

  const score = Math.round(
    components.reduce(
      (sum, component) => sum + component.score,
      0
    )
  );

  const attention: FinancialHealthAttention[] = [];

  if (reserveGap > 0) {
    attention.push({
      id: "reserve-gap",
      priority: emergencyFundMonths < 1 ? 100 : 75,
      level: emergencyFundMonths < 1 ? "critical" : "review",
      title: "Emergency reserve is below the household target",
      detail: `${money(
        reserveGap
      )} separates current bank cash from the configured ${householdPlan.emergencyFundTargetMonths}-month reserve.`,
      href: "/accounts",
    });
  }

  if (highInterestDebt > 0) {
    attention.push({
      id: "high-interest-debt",
      priority: 95,
      level: "critical",
      title: "High-interest debt is consuming financial capacity",
      detail: `${money(
        highInterestDebt
      )} is at or above the household ${pct(
        householdPlan.highInterestDebtAprPct
      )} review threshold.`,
      href: "/debt",
    });
  }

  if (cashFlow.health.trailingSavingsRate < 0) {
    attention.push({
      id: "negative-cashflow",
      priority: 90,
      level: "critical",
      title: "Recent spending is above income",
      detail: `Trailing savings rate is ${pct(
        cashFlow.health.trailingSavingsRate
      )}.`,
      href: "/cash-flow",
    });
  } else if (cashFlow.health.trailingSavingsRate < 10) {
    attention.push({
      id: "thin-cashflow",
      priority: 65,
      level: "review",
      title: "Savings margin is relatively thin",
      detail: `Trailing savings rate is ${pct(
        cashFlow.health.trailingSavingsRate
      )}.`,
      href: "/cash-flow",
    });
  }

  if (
    (largestStock?.weight ?? 0) >
    householdPlan.singleStockReviewPct
  ) {
    attention.push({
      id: "single-stock-concentration",
      priority: 60,
      level: "review",
      title: "Single-stock concentration crossed the household review line",
      detail: `${largestStock?.ticker ?? "Largest stock"} is ${pct(
        largestStock?.weight ?? 0
      )} of invested assets versus a ${pct(
        householdPlan.singleStockReviewPct
      )} review threshold.`,
      href: "/portfolio",
    });
  }

  if (retirementFundingPct < 80) {
    attention.push({
      id: "retirement-gap",
      priority: retirementFundingPct < 60 ? 80 : 55,
      level: retirementFundingPct < 60 ? "critical" : "review",
      title: "Baseline retirement projection is below the tracked target",
      detail: `Current assumptions project ${retirementFundingPct.toFixed(
        0
      )}% funding by age ${householdPlan.targetRetirementAge}.`,
      href: "/retirement",
    });
  } else {
    attention.push({
      id: "retirement-on-track",
      priority: 15,
      level: "positive",
      title: "Retirement baseline is near or above the tracked target",
      detail: `Current assumptions project ${retirementFundingPct.toFixed(
        0
      )}% funding by age ${householdPlan.targetRetirementAge}.`,
      href: "/retirement",
    });
  }

  if (
    emergencyFundMonths >= householdPlan.emergencyFundTargetMonths &&
    cashFlow.health.trailingSavingsRate >= 15
  ) {
    attention.push({
      id: "resilience-positive",
      priority: 10,
      level: "positive",
      title: "Liquidity and cash flow provide household flexibility",
      detail: `${emergencyFundMonths.toFixed(
        1
      )} months of bank-cash coverage with a ${pct(
        cashFlow.health.trailingSavingsRate
      )} trailing savings rate.`,
      href: "/cash-flow",
    });
  }

  return {
    version: "0.9.3",
    score,
    status: overallStatus(score),
    components,
    attention: attention.sort(
      (a, b) => b.priority - a.priority
    ),
    metrics: {
      assets,
      liabilities,
      netWorth: assets - liabilities,
      propertyValue,
      bankCash,
      investments,
      emergencyFundMonths,
      reserveTarget,
      reserveGap,
      savingsRate: cashFlow.health.trailingSavingsRate,
      fixedCostRatioPct: cashFlow.health.fixedCostRatioPct,
      incomeStabilityPct: cashFlow.health.incomeStabilityPct,
      debtToAssetsPct,
      monthlyDebtMinimums,
      debtServiceRatioPct,
      highInterestDebt,
      annualizedDebtInterest,
      largestStockTicker: largestStock?.ticker ?? null,
      largestStockPct: largestStock?.weight ?? 0,
      topThreeStockPct,
      portfolioCashPct,
      retirementProjectedAssets,
      retirementTargetAssets:
        householdPlan.targetRetirementAssets,
      retirementFundingPct,
      retirementYears,
      averageGoalFundingPct,
    },
  };
}
