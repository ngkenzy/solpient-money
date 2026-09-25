import { demoMoneyDataset, type MoneyDataset } from "@/lib/demo-data";

export type HealthComponent = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  status: "healthy" | "review" | "critical";
  detail: string;
  inputs: string[];
  calculation: string;
};

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function getHouseholdMetrics(
  dataset: MoneyDataset = demoMoneyDataset
) {
  const { accounts, holdings, householdGoals, householdPlan, monthlyCashFlow } = dataset;
  const assets = accounts.filter((a) => a.balance > 0).reduce((sum, a) => sum + a.balance, 0);
  const debtAccounts = accounts.filter((a) => a.type === "debt");
  const liabilities = Math.abs(debtAccounts.reduce((sum, a) => sum + a.balance, 0));
  const bankCash = accounts.filter((a) => a.type === "cash").reduce((sum, a) => sum + a.balance, 0);
  const propertyValue = accounts.filter((a) => a.type === "property").reduce((sum, a) => sum + a.balance, 0);
  const investments = holdings.reduce((sum, h) => sum + h.value, 0);
  const portfolioCash = holdings.filter((h) => h.kind === "cash").reduce((sum, h) => sum + h.value, 0);
  const averageMonthlyIncome = average(monthlyCashFlow.map((m) => m.income));
  const averageMonthlySpending = average(monthlyCashFlow.map((m) => m.spending));
  const averageMonthlySavings = averageMonthlyIncome - averageMonthlySpending;
  const savingsRate = averageMonthlyIncome > 0 ? (averageMonthlySavings / averageMonthlyIncome) * 100 : 0;
  const emergencyFundMonths = averageMonthlySpending > 0 ? bankCash / averageMonthlySpending : 0;
  const reserveTarget = averageMonthlySpending * householdPlan.emergencyFundTargetMonths;
  const excessBankCash = Math.max(0, bankCash - reserveTarget);
  const debtToAssetsPct = assets > 0 ? (liabilities / assets) * 100 : 0;
  const highInterestDebts = debtAccounts.filter(
    (account) => (account.apr ?? 0) >= householdPlan.highInterestDebtAprPct
  );
  const highInterestDebt = Math.abs(highInterestDebts.reduce((sum, a) => sum + a.balance, 0));
  const annualizedDebtInterest = debtAccounts.reduce(
    (sum, account) => sum + Math.abs(account.balance) * ((account.apr ?? 0) / 100),
    0
  );

  const totalPortfolio = investments;
  const directStocks = holdings.filter((h) => h.kind === "stock");
  const stockWeights = directStocks
    .map((h) => ({ ticker: h.ticker, value: h.value, weight: totalPortfolio ? (h.value / totalPortfolio) * 100 : 0 }))
    .sort((a, b) => b.weight - a.weight);
  const largestStock = stockWeights[0] ?? null;
  const topThreeStockPct = stockWeights.slice(0, 3).reduce((sum, item) => sum + item.weight, 0);
  const portfolioCashPct = totalPortfolio ? (portfolioCash / totalPortfolio) * 100 : 0;

  const goalFundingPct =
    average(
      householdGoals.map((goal) => Math.min(1, goal.current / goal.target))
    ) * 100;

  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
    bankCash,
    propertyValue,
    investments,
    portfolioCash,
    averageMonthlyIncome,
    averageMonthlySpending,
    averageMonthlySavings,
    savingsRate,
    emergencyFundMonths,
    reserveTarget,
    excessBankCash,
    debtToAssetsPct,
    highInterestDebt,
    annualizedDebtInterest,
    largestStock,
    topThreeStockPct,
    portfolioCashPct,
    goalFundingPct,
  };
}

export function getFinancialHealth(
  dataset: MoneyDataset = demoMoneyDataset
) {
  const { householdPlan, householdGoals } = dataset;
  const m = getHouseholdMetrics(dataset);

  const liquidityScore =
    m.emergencyFundMonths >= householdPlan.emergencyFundTargetMonths
      ? 20
      : m.emergencyFundMonths >= 3
        ? 15
        : m.emergencyFundMonths >= 1
          ? 8
          : 3;

  const cashFlowScore =
    m.savingsRate >= 25 ? 20 : m.savingsRate >= 15 ? 16 : m.savingsRate >= 5 ? 10 : m.savingsRate >= 0 ? 6 : 2;

  let debtScore = 15;
  if (m.debtToAssetsPct > 30) debtScore -= 5;
  else if (m.debtToAssetsPct > 20) debtScore -= 3;
  if (m.highInterestDebt > 0) debtScore -= 5;
  debtScore = clamp(debtScore, 0, 15);

  let portfolioScore = 20;
  if ((m.largestStock?.weight ?? 0) > householdPlan.singleStockReviewPct) portfolioScore -= 5;
  if (m.topThreeStockPct > householdPlan.topThreeStockReviewPct) portfolioScore -= 3;
  if (m.portfolioCashPct > householdPlan.portfolioCashReviewPct) portfolioScore -= 2;
  portfolioScore = clamp(portfolioScore, 0, 20);

  const planningScore = clamp((m.goalFundingPct / 100) * 10, 0, 10);

  const components: HealthComponent[] = [
    {
      key: "liquidity",
      label: "Liquidity",
      score: liquidityScore,
      maxScore: 20,
      status: liquidityScore >= 18 ? "healthy" : liquidityScore >= 10 ? "review" : "critical",
      detail: `${m.emergencyFundMonths.toFixed(1)} months of average spending held in bank cash.`,
      inputs: [
        `Bank cash: $${m.bankCash.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        `Average monthly spending: $${m.averageMonthlySpending.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        `Target: ${householdPlan.emergencyFundTargetMonths} months`,
      ],
      calculation: "Bank cash ÷ average monthly spending",
    },
    {
      key: "cashflow",
      label: "Cash flow",
      score: cashFlowScore,
      maxScore: 20,
      status: cashFlowScore >= 16 ? "healthy" : cashFlowScore >= 10 ? "review" : "critical",
      detail: `${m.savingsRate.toFixed(1)}% six-month average savings rate.`,
      inputs: [
        `Average monthly income: $${m.averageMonthlyIncome.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        `Average monthly spending: $${m.averageMonthlySpending.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      ],
      calculation: "(Income − spending) ÷ income",
    },
    {
      key: "debt",
      label: "Debt",
      score: debtScore,
      maxScore: 15,
      status: m.highInterestDebt > 0 ? "review" : debtScore >= 12 ? "healthy" : "review",
      detail: m.highInterestDebt > 0
        ? `High-interest demo debt detected: $${m.highInterestDebt.toLocaleString("en-US", { maximumFractionDigits: 0 })}.`
        : `Debt is ${m.debtToAssetsPct.toFixed(1)}% of assets with no high-interest balance.`,
      inputs: [
        `Total liabilities: $${m.liabilities.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        `Debt/assets: ${m.debtToAssetsPct.toFixed(1)}%`,
        `High-interest debt: $${m.highInterestDebt.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      ],
      calculation: "Debt burden minus penalties for high-interest balances",
    },
    {
      key: "portfolio",
      label: "Portfolio",
      score: portfolioScore,
      maxScore: 20,
      status: portfolioScore >= 18 ? "healthy" : "review",
      detail: `Largest stock ${m.largestStock?.weight.toFixed(1) ?? "0.0"}%; top three ${m.topThreeStockPct.toFixed(1)}%; cash ${m.portfolioCashPct.toFixed(1)}%.`,
      inputs: [
        `Largest direct stock: ${m.largestStock?.ticker ?? "—"} ${m.largestStock?.weight.toFixed(1) ?? "0.0"}%`,
        `Top three stocks: ${m.topThreeStockPct.toFixed(1)}%`,
        `Portfolio cash: ${m.portfolioCashPct.toFixed(1)}%`,
      ],
      calculation: "Start at 20; subtract deterministic concentration/cash review penalties",
    },
    {
      key: "planning",
      label: "Goals",
      score: planningScore,
      maxScore: 10,
      status: planningScore >= 8 ? "healthy" : "review",
      detail: `${m.goalFundingPct.toFixed(0)}% average funding across tracked demo goals.`,
      inputs: householdGoals.map(
        (goal) => `${goal.name}: $${goal.current.toLocaleString()} / $${goal.target.toLocaleString()}`
      ),
      calculation: "Average capped funding ratio across tracked goals",
    },
  ];

  const totalScore = Math.round(components.reduce((sum, component) => sum + component.score, 0));
  return { score: totalScore, components, metrics: m };
}

export function getDebtPriority(dataset: MoneyDataset = demoMoneyDataset) {
  return dataset.accounts
    .filter((account) => account.type === "debt")
    .map((account) => ({
      id: account.id,
      name: account.name,
      balance: Math.abs(account.balance),
      apr: account.apr ?? 0,
      minimumPayment: account.minimumPayment ?? 0,
      annualizedInterest: Math.abs(account.balance) * ((account.apr ?? 0) / 100),
    }))
    .sort((a, b) => b.apr - a.apr);
}
