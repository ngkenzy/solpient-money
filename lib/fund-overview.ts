import type { Holding, MoneyDataset } from "@/lib/demo-data";

export type FundPosition = {
  ticker: string;
  name: string;
  kind: Holding["kind"];
  sector: string;
  shares: number;
  value: number;
  costBasis: number;
  weightPct: number;
  shareOfDirectStocksPct: number;
};

export type FundSleeve = {
  kind: Holding["kind"];
  label: string;
  value: number;
  weightPct: number;
};

const SLEEVES: Array<{ kind: Holding["kind"]; label: string }> = [
  { kind: "stock", label: "Individual stocks" },
  { kind: "etf", label: "ETFs / diversified funds" },
  { kind: "bond", label: "Bonds" },
  { kind: "cash", label: "Cash-like holdings" },
];

function percent(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/**
 * Fund calculations use holdings only. Account balances may represent the
 * same assets, so adding accounts to holdings would double-count capital.
 * Ownership must be reconciled at import: Holding has no owner/account ID.
 */
export function buildFundOverview(dataset: MoneyDataset) {
  const byTicker = new Map<string, Omit<FundPosition, "weightPct" | "shareOfDirectStocksPct">>();
  for (const row of dataset.holdings) {
    const ticker = row.ticker.trim().toUpperCase();
    if (!ticker || !Number.isFinite(row.value) || row.value <= 0) continue;
    const existing = byTicker.get(ticker);
    if (existing) {
      existing.value += row.value;
      existing.shares += Number.isFinite(row.shares) ? row.shares : 0;
      existing.costBasis += Number.isFinite(row.costBasis) && row.costBasis > 0 ? row.costBasis : 0;
    } else {
      byTicker.set(ticker, {
        ticker,
        name: row.name,
        kind: row.kind,
        sector: row.sector || "Unclassified",
        value: row.value,
        shares: Number.isFinite(row.shares) ? row.shares : 0,
        costBasis: Number.isFinite(row.costBasis) && row.costBasis > 0 ? row.costBasis : 0,
      });
    }
  }

  const holdings = [...byTicker.values()];
  const investedValue = holdings.reduce((sum, row) => sum + row.value, 0);
  const directStockValue = holdings.filter((row) => row.kind === "stock")
    .reduce((sum, row) => sum + row.value, 0);
  const positions: FundPosition[] = holdings.map((row) => ({
    ...row,
    weightPct: percent(row.value, investedValue),
    shareOfDirectStocksPct: row.kind === "stock" ? percent(row.value, directStockValue) : 0,
  })).sort((a, b) => b.value - a.value || a.ticker.localeCompare(b.ticker));

  const stocks = positions.filter((row) => row.kind === "stock")
    .sort((a, b) => b.value - a.value);
  const sleeves: FundSleeve[] = SLEEVES.map(({ kind, label }) => {
    const value = positions.filter((row) => row.kind === kind)
      .reduce((sum, row) => sum + row.value, 0);
    return { kind, label, value, weightPct: percent(value, investedValue) };
  });
  const biggestStock = stocks[0] ?? null;
  const singleStockReviewPct = dataset.householdPlan.singleStockReviewPct;
  const topThreeReviewPct = dataset.householdPlan.topThreeStockReviewPct;
  const topThreeStockWeightPct = stocks.slice(0, 3)
    .reduce((sum, row) => sum + row.weightPct, 0);
  const topFiveDirectStockPct = percent(
    stocks.slice(0, 5).reduce((sum, row) => sum + row.value, 0),
    directStockValue
  );

  return {
    investedValue,
    directStockValue,
    cashLikeHoldings: sleeves.find((sleeve) => sleeve.kind === "cash")?.value ?? 0,
    positions,
    sleeves,
    biggestStock,
    topThreeStockWeightPct,
    topFiveDirectStockPct,
    singleStockReviewPct,
    topThreeReviewPct,
    concentrationAlerts: [
      ...(biggestStock && biggestStock.weightPct > singleStockReviewPct
        ? [`${biggestStock.ticker} is ${biggestStock.weightPct.toFixed(1)}% of invested holdings; the review line is ${singleStockReviewPct}%.`]
        : []),
      ...(topThreeStockWeightPct > topThreeReviewPct
        ? [`The three largest direct stocks are ${topThreeStockWeightPct.toFixed(1)}% of invested holdings; the review line is ${topThreeReviewPct}%.`]
        : []),
    ],
    // Sensitivity is not a forecast. All other holdings are held constant.
    biggestStockDown30Loss: biggestStock ? biggestStock.value * 0.30 : 0,
    biggestStockDown30PortfolioPct: biggestStock ? biggestStock.weightPct * 0.30 : 0,
    brokerageCashAccounts: dataset.accounts
      .filter((account) => account.type === "cash" && Number.isFinite(account.balance))
      .reduce((sum, account) => sum + Math.max(0, account.balance), 0),
  };
}
