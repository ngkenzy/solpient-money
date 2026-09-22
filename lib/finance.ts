import { accounts, holdings, transactions } from "@/lib/demo-data";

export const money = (value: number, decimals = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(value);

export const pct = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

export function getFinancialSummary() {
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

export function getPortfolioMetrics() {
  const total = holdings.reduce((sum, h) => sum + h.value, 0);
  const directStocks = holdings.filter((h) => h.kind === "stock");
  const coveredStocks = directStocks.filter((h) => h.researchScore != null);
  const directStockValue = directStocks.reduce((sum, h) => sum + h.value, 0);
  const coveredValue = coveredStocks.reduce((sum, h) => sum + h.value, 0);
  const stockWeights = directStocks
    .map((h) => ({ ...h, weight: total ? (h.value / total) * 100 : 0 }))
    .sort((a, b) => b.weight - a.weight);
  const allWeights = holdings
    .map((h) => ({ ...h, weight: total ? (h.value / total) * 100 : 0 }))
    .sort((a, b) => b.weight - a.weight);
  const cashValue = holdings.filter((h) => h.kind === "cash").reduce((sum, h) => sum + h.value, 0);
  const weightedResearchScore =
    coveredValue > 0
      ? coveredStocks.reduce((sum, h) => sum + (h.researchScore ?? 0) * h.value, 0) / coveredValue
      : 0;

  return {
    total,
    directStockValue,
    coveredValue,
    researchCoverage: directStockValue ? (coveredValue / directStockValue) * 100 : 0,
    weightedResearchScore,
    largestDirectStock: stockWeights[0],
    topThreeDirectStockWeight: stockWeights.slice(0, 3).reduce((sum, h) => sum + h.weight, 0),
    largestHolding: allWeights[0],
    cashWeight: total ? (cashValue / total) * 100 : 0,
  };
}

export function getPortfolioInsights() {
  const metrics = getPortfolioMetrics();
  const insights: Array<{
    level: "good" | "watch";
    title: string;
    detail: string;
  }> = [];

  if (metrics.largestDirectStock && metrics.largestDirectStock.weight > 15) {
    insights.push({
      level: "watch",
      title: "Single-stock concentration",
      detail: `${metrics.largestDirectStock.ticker} is ${metrics.largestDirectStock.weight.toFixed(1)}% of the total investment portfolio, above the 15% demo review threshold.`,
    });
  } else {
    insights.push({
      level: "good",
      title: "Single-stock concentration",
      detail: "No individual stock exceeds the 15% demo review threshold.",
    });
  }

  if (metrics.topThreeDirectStockWeight > 35) {
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

  insights.push({
    level: metrics.researchCoverage >= 80 ? "good" : "watch",
    title: "Research coverage",
    detail: `${metrics.researchCoverage.toFixed(0)}% of direct-stock value has a demo Solpient Research score.`,
  });

  if (metrics.cashWeight > 15) {
    insights.push({
      level: "watch",
      title: "Portfolio cash",
      detail: `Cash is ${metrics.cashWeight.toFixed(1)}% of invested assets. Review whether that matches the intended reserve or deployment plan.`,
    });
  } else {
    insights.push({
      level: "good",
      title: "Portfolio cash",
      detail: `Cash is ${metrics.cashWeight.toFixed(1)}% of invested assets, below the 15% demo review threshold.`,
    });
  }

  return insights;
}

export function findHolding(ticker: string) {
  return holdings.find((holding) => holding.ticker.toLowerCase() === ticker.toLowerCase());
}
