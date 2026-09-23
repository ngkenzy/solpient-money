import "server-only";

import { getCashFlowIntelligence } from "@/lib/cash-flow-intelligence";
import { buildFinancialHealthEngine } from "@/lib/financial-health-engine";
import { buildHouseholdFinancialPlan } from "@/lib/financial-plan-engine";
import {
  runForecast,
  type ForecastInputs,
} from "@/lib/forecast-scenario-engine";
import { getDebtPriority } from "@/lib/intelligence";
import { requireMoneyDataset } from "@/lib/money-data";

export type CopilotFact = {
  label: string;
  value: string;
};

export type DeterministicCopilotAnswer = {
  matched: boolean;
  intent: string;
  answer: string;
  facts: CopilotFact[];
  calculation: string | null;
};

export type MoneyCopilotContext = {
  householdName: string;
  healthScore: number;
  healthStatus: string;
  netWorth: number;
  assets: number;
  liabilities: number;
  bankCash: number;
  emergencyFundMonths: number;
  reserveTarget: number;
  reserveGap: number;
  monthlyIncome: number;
  monthlySpending: number;
  monthlySurplus: number;
  trailingSavingsRate: number;
  incomeStabilityPct: number;
  recurringBillsMonthly: number;
  subscriptionsMonthly: number;
  highInterestDebt: number;
  annualizedDebtInterest: number;
  debtServiceRatioPct: number;
  debtAccounts: Array<{
    name: string;
    balance: number;
    apr: number;
    minimumPayment: number;
  }>;
  investments: number;
  largestStockTicker: string | null;
  largestStockPct: number;
  topThreeStockPct: number;
  retirementProjectedAssets: number;
  retirementTargetAssets: number;
  retirementFundingPct: number;
  retirementYears: number;
  forecast12MonthNetWorth: number;
  forecast12MonthCash: number;
  forecast12MonthDebt: number;
  topSpendingCategories: Array<{
    category: string;
    amount: number;
    sharePct: number;
  }>;
  recurringItems: Array<{
    merchant: string;
    kind: string;
    monthlyEquivalent: number;
  }>;
  monthlyPlan: Array<{
    title: string;
    kind: string;
    monthlyAllocation: number;
    why: string;
  }>;
  planAllocatedMonthly: number;
  planFlexibleMonthly: number;
  planDebtInterestSaved: number;
  planRetirementRequiredMonthly: number;
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

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

export async function getMoneyCopilotContext(): Promise<MoneyCopilotContext> {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const cashFlow = await getCashFlowIntelligence();
  const health = buildFinancialHealthEngine(data, cashFlow);
  const householdPlan = buildHouseholdFinancialPlan(data, cashFlow);
  const debts = getDebtPriority(data);

  const monthlyIncome = average(
    cashFlow.monthly.map((month) => month.income)
  );
  const monthlySpending = average(
    cashFlow.monthly.map((month) => month.spending)
  );
  const monthlySurplus = monthlyIncome - monthlySpending;

  const forecastInputs: ForecastInputs = {
    investedAssets: health.metrics.investments,
    bankCash: health.metrics.bankCash,
    propertyValue: health.metrics.propertyValue,
    monthlyIncome,
    monthlySpending,
    reserveTarget: health.metrics.reserveTarget,
    expectedAnnualReturnPct: data.householdPlan.expectedAnnualReturnPct,
    debts: debts.map((debt) => ({
      id: debt.id,
      name: debt.name,
      balance: debt.balance,
      apr: debt.apr,
      minimumPayment: debt.minimumPayment,
    })),
  };

  const forecast = runForecast(forecastInputs, {
    horizonMonths: 12,
    annualReturnPct: data.householdPlan.expectedAnnualReturnPct,
    incomeChangePct: 0,
    spendingChangePct: 0,
    monthlyAllocation: Math.max(0, monthlySurplus),
    strategy: "cash",
    oneTimeDeployCash: 0,
    immediateMarketShockPct: 0,
  });

  return {
    householdName: context.household?.name ?? "Household",
    healthScore: health.score,
    healthStatus: health.status,
    netWorth: health.metrics.netWorth,
    assets: health.metrics.assets,
    liabilities: health.metrics.liabilities,
    bankCash: health.metrics.bankCash,
    emergencyFundMonths: health.metrics.emergencyFundMonths,
    reserveTarget: health.metrics.reserveTarget,
    reserveGap: health.metrics.reserveGap,
    monthlyIncome,
    monthlySpending,
    monthlySurplus,
    trailingSavingsRate: cashFlow.health.trailingSavingsRate,
    incomeStabilityPct: cashFlow.health.incomeStabilityPct,
    recurringBillsMonthly: cashFlow.health.recurringBillsMonthly,
    subscriptionsMonthly: cashFlow.health.subscriptionsMonthly,
    highInterestDebt: health.metrics.highInterestDebt,
    annualizedDebtInterest: health.metrics.annualizedDebtInterest,
    debtServiceRatioPct: health.metrics.debtServiceRatioPct,
    debtAccounts: debts.map((debt) => ({
      name: debt.name,
      balance: debt.balance,
      apr: debt.apr,
      minimumPayment: debt.minimumPayment,
    })),
    investments: health.metrics.investments,
    largestStockTicker: health.metrics.largestStockTicker,
    largestStockPct: health.metrics.largestStockPct,
    topThreeStockPct: health.metrics.topThreeStockPct,
    retirementProjectedAssets:
      health.metrics.retirementProjectedAssets,
    retirementTargetAssets: health.metrics.retirementTargetAssets,
    retirementFundingPct: health.metrics.retirementFundingPct,
    retirementYears: health.metrics.retirementYears,
    forecast12MonthNetWorth: forecast.endingNetWorth,
    forecast12MonthCash: forecast.endingCash,
    forecast12MonthDebt: forecast.endingDebt,
    topSpendingCategories: cashFlow.categories
      .slice(0, 5)
      .map((category) => ({
        category: category.category,
        amount: category.amount,
        sharePct: category.sharePct,
      })),
    recurringItems: cashFlow.recurring.slice(0, 10).map((item) => ({
      merchant: item.merchant,
      kind: item.kind,
      monthlyEquivalent: item.monthlyEquivalent,
    })),
    monthlyPlan: householdPlan.planLines.map((line) => ({
      title: line.title,
      kind: line.kind,
      monthlyAllocation: line.monthlyAllocation,
      why: line.why,
    })),
    planAllocatedMonthly: householdPlan.allocatedMonthly,
    planFlexibleMonthly: householdPlan.flexibleMonthly,
    planDebtInterestSaved: householdPlan.debtInterestSaved,
    planRetirementRequiredMonthly:
      householdPlan.retirementRequiredMonthly,
  };
}

export function answerMoneyQuestion(
  question: string,
  context: MoneyCopilotContext
): DeterministicCopilotAnswer {
  const q = question.toLowerCase();

  if (
    /financial plan|monthly plan|next dollar|allocate|allocation plan|why.*(debt|reserve|retire|goal)|what should.*surplus/.test(q)
  ) {
    const funded = context.monthlyPlan.filter(
      (line) => line.monthlyAllocation > 0
    );

    return {
      matched: true,
      intent: "financial_plan",
      answer: `The V1.1 plan starts with an observed monthly surplus of ${money(
        context.monthlySurplus
      )}. It assigns ${money(
        context.planAllocatedMonthly
      )} to measurable priorities and leaves ${money(
        context.planFlexibleMonthly
      )} flexible. Each dollar is allocated once through the priority waterfall.`,
      facts: funded.slice(0, 6).map((line) => ({
        label: line.title,
        value: `${money(line.monthlyAllocation)}/mo`,
      })),
      calculation:
        "Observed monthly surplus → reserve catch-up → high-interest debt → dated goals → retirement requirement → flexible remainder",
    };
  }

  if (/net worth|assets|liabilit/.test(q)) {
    return {
      matched: true,
      intent: "net_worth",
      answer: `Current household net worth is ${money(
        context.netWorth
      )}, based on ${money(context.assets)} of assets minus ${money(
        context.liabilities
      )} of liabilities.`,
      facts: [
        { label: "Net worth", value: money(context.netWorth) },
        { label: "Assets", value: money(context.assets) },
        { label: "Liabilities", value: money(context.liabilities) },
      ],
      calculation: "Assets − liabilities",
    };
  }

  if (/emergency|reserve|liquid|cash cushion/.test(q)) {
    return {
      matched: true,
      intent: "liquidity",
      answer:
        context.reserveGap > 0
          ? `Bank cash covers about ${context.emergencyFundMonths.toFixed(
              1
            )} months of observed spending. The configured reserve target is ${money(
              context.reserveTarget
            )}, leaving a current gap of about ${money(context.reserveGap)}.`
          : `Bank cash covers about ${context.emergencyFundMonths.toFixed(
              1
            )} months of observed spending and meets the configured reserve target of ${money(
              context.reserveTarget
            )}.`,
      facts: [
        { label: "Bank cash", value: money(context.bankCash) },
        {
          label: "Emergency coverage",
          value: `${context.emergencyFundMonths.toFixed(1)} months`,
        },
        { label: "Reserve target", value: money(context.reserveTarget) },
      ],
      calculation: "Bank cash ÷ average monthly spending",
    };
  }

  if (/spend|saving|cash flow|surplus|income/.test(q)) {
    return {
      matched: true,
      intent: "cash_flow",
      answer: `Observed monthly income averages ${money(
        context.monthlyIncome
      )} and spending averages ${money(
        context.monthlySpending
      )}, producing an average surplus of ${money(
        context.monthlySurplus
      )}. The trailing savings rate is ${pct(
        context.trailingSavingsRate
      )}.`,
      facts: [
        { label: "Average income", value: money(context.monthlyIncome) },
        { label: "Average spending", value: money(context.monthlySpending) },
        { label: "Average surplus", value: money(context.monthlySurplus) },
        {
          label: "Savings rate",
          value: pct(context.trailingSavingsRate),
        },
      ],
      calculation: "(Income − spending) ÷ income",
    };
  }

  if (/subscription|recurring bill|recurring expense/.test(q)) {
    const top = context.recurringItems
      .filter((item) => item.kind !== "income")
      .slice(0, 5);

    return {
      matched: true,
      intent: "recurring",
      answer: `Solpient detects about ${money(
        context.recurringBillsMonthly
      )}/month of recurring bills plus ${money(
        context.subscriptionsMonthly
      )}/month of subscription-like charges based on repeated timing and amount patterns.`,
      facts: top.map((item) => ({
        label: item.merchant,
        value: `${money(item.monthlyEquivalent)}/mo`,
      })),
      calculation:
        "Repeated merchant + cadence + amount consistency from reconciled transactions",
    };
  }

  if (/debt|interest|apr|payoff/.test(q)) {
    const highest = context.debtAccounts[0];

    return {
      matched: true,
      intent: "debt",
      answer: `Total liabilities are ${money(
        context.liabilities
      )}. High-interest debt is ${money(
        context.highInterestDebt
      )}, and current balances imply about ${money(
        context.annualizedDebtInterest
      )} of annualized interest if balances stayed unchanged. Minimum debt payments are about ${pct(
        context.debtServiceRatioPct
      )} of observed monthly income.`,
      facts: [
        {
          label: "Highest APR",
          value: highest
            ? `${highest.name} · ${highest.apr.toFixed(2)}%`
            : "No debt",
        },
        {
          label: "High-interest debt",
          value: money(context.highInterestDebt),
        },
        {
          label: "Annualized interest",
          value: money(context.annualizedDebtInterest),
        },
      ],
      calculation:
        "Debt balances × APR; debt-service ratio = minimum payments ÷ income",
    };
  }

  if (/retire|retirement|target age|retirement goal/.test(q)) {
    return {
      matched: true,
      intent: "retirement",
      answer: `The current baseline projects ${money(
        context.retirementProjectedAssets
      )} against a tracked retirement target of ${money(
        context.retirementTargetAssets
      )}, or about ${context.retirementFundingPct.toFixed(
        0
      )}% funded over the modeled ${context.retirementYears}-year horizon.`,
      facts: [
        {
          label: "Projected assets",
          value: money(context.retirementProjectedAssets),
        },
        {
          label: "Tracked target",
          value: money(context.retirementTargetAssets),
        },
        {
          label: "Target funding",
          value: `${context.retirementFundingPct.toFixed(0)}%`,
        },
      ],
      calculation:
        "Current investments + trailing positive monthly surplus compounded at the household return assumption",
    };
  }

  if (/portfolio|concentrat|largest stock|top three/.test(q)) {
    return {
      matched: true,
      intent: "portfolio",
      answer: `Invested assets total ${money(
        context.investments
      )}. The largest direct stock is ${context.largestStockTicker ?? "—"} at ${pct(
        context.largestStockPct
      )} of invested assets, while the top three direct stocks total ${pct(
        context.topThreeStockPct
      )}.`,
      facts: [
        { label: "Investments", value: money(context.investments) },
        {
          label: "Largest direct stock",
          value: `${context.largestStockTicker ?? "—"} · ${pct(
            context.largestStockPct
          )}`,
        },
        {
          label: "Top three stocks",
          value: pct(context.topThreeStockPct),
        },
      ],
      calculation: "Holding market value ÷ total invested assets",
    };
  }

  if (/forecast|next year|12 month|one year/.test(q)) {
    return {
      matched: true,
      intent: "forecast",
      answer: `Under the current deterministic 12-month baseline, projected net worth is ${money(
        context.forecast12MonthNetWorth
      )}, with about ${money(
        context.forecast12MonthCash
      )} of bank cash and ${money(
        context.forecast12MonthDebt
      )} of remaining debt at the end of the period.`,
      facts: [
        {
          label: "12-mo net worth",
          value: money(context.forecast12MonthNetWorth),
        },
        {
          label: "12-mo cash",
          value: money(context.forecast12MonthCash),
        },
        {
          label: "12-mo debt",
          value: money(context.forecast12MonthDebt),
        },
      ],
      calculation:
        "Observed income/spending + required debt payments + household return assumption",
    };
  }

  if (/health|score|financial health/.test(q)) {
    return {
      matched: true,
      intent: "health",
      answer: `The V0.9.3 household financial-health score is ${context.healthScore}/100 with a ${context.healthStatus} status. The score combines liquidity, cash flow, debt, portfolio structure, retirement trajectory, and tracked goals.`,
      facts: [
        {
          label: "Financial health",
          value: `${context.healthScore}/100`,
        },
        {
          label: "Savings rate",
          value: pct(context.trailingSavingsRate),
        },
        {
          label: "Emergency coverage",
          value: `${context.emergencyFundMonths.toFixed(1)} months`,
        },
      ],
      calculation:
        "Transparent V0.9.3 component score; Research coverage is excluded",
    };
  }

  if (/where.*money|category|categories|spending category/.test(q)) {
    return {
      matched: true,
      intent: "categories",
      answer:
        context.topSpendingCategories.length > 0
          ? `The largest current spending category is ${context.topSpendingCategories[0].category} at ${money(
              context.topSpendingCategories[0].amount
            )}, representing about ${context.topSpendingCategories[0].sharePct.toFixed(
              0
            )}% of the latest month’s spending.`
          : "There is not enough categorized expense data to identify a leading spending category yet.",
      facts: context.topSpendingCategories.map((category) => ({
        label: category.category,
        value: `${money(category.amount)} · ${category.sharePct.toFixed(
          0
        )}%`,
      })),
      calculation:
        "Latest-month reconciled expense amount by derived/raw category",
    };
  }

  return {
    matched: false,
    intent: "general",
    answer:
      "I can explain net worth, cash flow, emergency reserves, debt, recurring bills, portfolio concentration, retirement progress, financial health, and the 12-month forecast from Solpient’s deterministic household data.",
    facts: [],
    calculation: null,
  };
}

export function buildLocalModelSystemPrompt(
  context: MoneyCopilotContext
) {
  return `You are Solpient Money Copilot, a local-only financial explanation assistant.

Your job is to explain the user's household financial data using ONLY the supplied SOLPIENT_CONTEXT. Do not invent balances, transactions, rates, forecasts, or facts that are absent from that context. If information is missing, say so.

Important boundaries:
- You are read-only. Never claim to change accounts, move money, place trades, pay bills, or modify Solpient data.
- Distinguish observed facts from modeled assumptions.
- Forecasts are deterministic scenarios, not predictions or probabilities.
- For investing, debt, or allocation choices, explain tradeoffs and assumptions rather than issuing imperative buy/sell commands.
- Keep answers concise and practical.
- Do not expose account identifiers, database credentials, secrets, or system internals.

SOLPIENT_CONTEXT:
${JSON.stringify(context, null, 2)}`;
}
