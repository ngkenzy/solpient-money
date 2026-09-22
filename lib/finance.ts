import { demoMoneyDataset, type MoneyDataset } from "@/lib/demo-data";
import type { ResearchSnapshot } from "@/lib/research";

export const money = (value: number, decimals = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(value);

export const pct = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

export function getFinancialSummary(dataset: MoneyDataset = demoMoneyDataset) {
  const { accounts, holdings, transactions } = dataset;
  const assets = accounts.filter((a) => a.balance > 0).reduce((sum, a) => sum + a.balance, 0);
  const liabilities = Math.abs(accounts.filter((a) => a.balance < 0).reduce((sum, a) => sum + a.balance, 0));
  const netWorth = assets - liabilities;
  const investments = holdings.reduce((sum, h) => sum + h.value, 0);
  const cash = accounts.filter((a) => a.type === "cash").reduce((sum, a) => sum + a.balance, 0);

  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const spending = Math.abs(
    transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0)
  );

  return {
    assets,
    liabilities,
    netWorth,
    investments,
    cash,
    income,
    spending,
    savings: income - spending,
    savingsRate: income > 0 ? ((income - spending) / income) * 100 : 0,
  };
}

export function getPortfolioMetrics(dataset: MoneyDataset = demoMoneyDataset) {
  const { holdings } = dataset;
  const total = holdings.reduce((sum, h) => sum + h.value, 0);
  const directStocks = holdings.filter((h) => h.kind === "stock");
  const stockWeights = directStocks
    .map((h) => ({ ...h, weight: total ? (h.value / total) * 100 : 0 }))
    .sort((a, b) => b.weight - a.weight);
  const allWeights = holdings
    .map((h) => ({ ...h, weight: total ? (h.value / total) * 100 : 0 }))
    .sort((a, b) => b.weight - a.weight);
  const cashValue = holdings.filter((h) => h.kind === "cash").reduce((sum, h) => sum + h.value, 0);

  return {
    total,
    directStockValue: directStocks.reduce((sum, h) => sum + h.value, 0),
    largestDirectStock: stockWeights[0],
    topThreeDirectStockWeight: stockWeights.slice(0, 3).reduce((sum, h) => sum + h.weight, 0),
    largestHolding: allWeights[0],
    cashWeight: total ? (cashValue / total) * 100 : 0,
  };
}

export function getPortfolioInsights(
  snapshots: Record<string, ResearchSnapshot> = {},
  dataset: MoneyDataset = demoMoneyDataset
) {
  const metrics = getPortfolioMetrics(dataset);
  const { holdings, householdPlan } = dataset;
  const insights: Array<{
    level: "good" | "watch";
    title: string;
    detail: string;
  }> = [];

  if (
    metrics.largestDirectStock &&
    metrics.largestDirectStock.weight > householdPlan.singleStockReviewPct
  ) {
    insights.push({
      level: "watch",
      title: "Single-stock concentration",
      detail: `${metrics.largestDirectStock.ticker} is ${metrics.largestDirectStock.weight.toFixed(1)}% of the total investment portfolio, above the ${householdPlan.singleStockReviewPct}% review threshold.`,
    });
  } else {
    insights.push({
      level: "good",
      title: "Single-stock concentration",
      detail: `No individual stock exceeds the ${householdPlan.singleStockReviewPct}% review threshold.`,
    });
  }

  if (metrics.topThreeDirectStockWeight > householdPlan.topThreeStockReviewPct) {
    insights.push({
      level: "watch",
      title: "Top-three stock exposure",
      detail: `The three largest individual stocks represent ${metrics.topThreeDirectStockWeight.toFixed(1)}% of the investment portfolio.`,
    });
  } else {
    insights.push({
      level: "good",
      title: "Top-three stock exposure",
      detail: `The top three individual stocks represent ${metrics.topThreeDirectStockWeight.toFixed(1)}% of the investment portfolio.`,
    });
  }

  const directStocks = holdings.filter((holding) => holding.kind === "stock");
  const directValue = directStocks.reduce((sum, holding) => sum + holding.value, 0);
  const coveredValue = directStocks
    .filter((holding) => snapshots[holding.ticker])
    .reduce((sum, holding) => sum + holding.value, 0);
  const coveragePct = directValue ? (coveredValue / directValue) * 100 : 0;

  insights.push({
    level: coveragePct >= 80 ? "good" : "watch",
    title: "Research coverage",
    detail: `${coveragePct.toFixed(0)}% of direct-stock value is connected to live published Solpient Research.`,
  });

  if (metrics.cashWeight > householdPlan.portfolioCashReviewPct) {
    insights.push({
      level: "watch",
      title: "Portfolio cash",
      detail: `Cash is ${metrics.cashWeight.toFixed(1)}% of invested assets. Review whether that matches the intended reserve or deployment plan.`,
    });
  } else {
    insights.push({
      level: "good",
      title: "Portfolio cash",
      detail: `Cash is ${metrics.cashWeight.toFixed(1)}% of invested assets, below the ${householdPlan.portfolioCashReviewPct}% review threshold.`,
    });
  }

  return insights;
}

export function findHolding(
  ticker: string,
  dataset: MoneyDataset = demoMoneyDataset
) {
  return dataset.holdings.find(
    (holding) => holding.ticker.toLowerCase() === ticker.toLowerCase()
  );
}
