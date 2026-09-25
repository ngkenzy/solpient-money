import type {
  Holding,
  MoneyDataset,
} from "@/lib/demo-data";

export type PortfolioSignalLevel =
  | "critical"
  | "watch"
  | "positive"
  | "info";

export type PortfolioSignal = {
  id: string;
  level: PortfolioSignalLevel;
  category:
    | "concentration"
    | "allocation";
  title: string;
  detail: string;
  href: string;
  ticker?: string;
};

export type PortfolioPositionIntelligence = {
  ticker: string;
  name: string;
  sector: string;
  value: number;
  weightPct: number;
  currentPrice: number;
  costBasis: number;
  unrealizedPct: number | null;
  reviewPriority: number;
  reviewReasons: string[];
};

export type PortfolioSectorExposure = {
  sector: string;
  value: number;
  weightPct: number;
  holdingCount: number;
};

export type PortfolioIntelligenceReport = {
  version: "2.0";
  totalPortfolioValue: number;
  directStockValue: number;
  topThreeStockWeightPct: number;
  largestStockWeightPct: number;
  positions: PortfolioPositionIntelligence[];
  sectors: PortfolioSectorExposure[];
  signals: PortfolioSignal[];
  criticalCount: number;
  watchCount: number;
};

function positionIntelligence(
  holding: Holding,
  totalPortfolioValue: number,
  reviewThresholdPct: number
): PortfolioPositionIntelligence {
  const weightPct =
    totalPortfolioValue > 0
      ? (holding.value / totalPortfolioValue) * 100
      : 0;

  const unrealizedPct =
    holding.costBasis > 0
      ? ((holding.value - holding.costBasis) /
          holding.costBasis) *
        100
      : null;

  const reasons: string[] = [];
  let priority = Math.round(weightPct * 2);

  if (weightPct > reviewThresholdPct) {
    priority += 25;
    reasons.push(
      `Position weight ${weightPct.toFixed(
        1
      )}% exceeds the household ${reviewThresholdPct}% single-stock review line.`
    );
  }

  if (!reasons.length) {
    reasons.push(
      "Position size is within the household single-stock review line."
    );
  }

  return {
    ticker: holding.ticker,
    name: holding.name,
    sector: holding.sector,
    value: holding.value,
    weightPct,
    currentPrice: holding.price,
    costBasis: holding.costBasis,
    unrealizedPct,
    reviewPriority: priority,
    reviewReasons: reasons,
  };
}

export function buildPortfolioIntelligence(
  dataset: MoneyDataset
): PortfolioIntelligenceReport {
  const directStocks = dataset.holdings.filter(
    (holding) => holding.kind === "stock"
  );
  const totalPortfolioValue =
    dataset.holdings.reduce(
      (sum, holding) => sum + holding.value,
      0
    );
  const directStockValue =
    directStocks.reduce(
      (sum, holding) => sum + holding.value,
      0
    );

  const positions = directStocks
    .map((holding) =>
      positionIntelligence(
        holding,
        totalPortfolioValue,
        dataset.householdPlan
          .singleStockReviewPct
      )
    )
    .sort(
      (a, b) =>
        b.reviewPriority -
        a.reviewPriority
    );

  const weightOrdered =
    [...positions].sort(
      (a, b) =>
        b.weightPct - a.weightPct
    );

  const bySector =
    new Map<
      string,
      {
        value: number;
        count: number;
      }
    >();

  for (const holding of directStocks) {
    const sector =
      holding.sector || "Other";
    const current =
      bySector.get(sector) ?? {
        value: 0,
        count: 0,
      };
    current.value += holding.value;
    current.count += 1;
    bySector.set(sector, current);
  }

  const sectors =
    Array.from(bySector.entries())
      .map(
        ([sector, value]):
          PortfolioSectorExposure => ({
          sector,
          value: value.value,
          weightPct:
            totalPortfolioValue > 0
              ? (value.value /
                  totalPortfolioValue) *
                100
              : 0,
          holdingCount: value.count,
        })
      )
      .sort(
        (a, b) =>
          b.weightPct - a.weightPct
      );

  const signals: PortfolioSignal[] =
    [];

  const topThree =
    weightOrdered
      .slice(0, 3)
      .reduce(
        (sum, position) =>
          sum + position.weightPct,
        0
      );

  if (
    topThree >
    dataset.householdPlan
      .topThreeStockReviewPct
  ) {
    signals.push({
      id: "portfolio:top-three-concentration",
      level: "watch",
      category: "concentration",
      title:
        "Top-three stock concentration exceeds the household review line",
      detail:
        `The three largest direct stocks represent ${topThree.toFixed(
          1
        )}% of invested assets versus the ${dataset.householdPlan.topThreeStockReviewPct}% household review line.`,
      href: "/portfolio-intelligence",
    });
  }

  for (const position of positions) {
    const concentrated =
      position.weightPct >
      dataset.householdPlan
        .singleStockReviewPct;

    if (concentrated) {
      signals.push({
        id: `portfolio:${position.ticker}:concentration`,
        level: "watch",
        category: "concentration",
        ticker: position.ticker,
        title:
          `${position.ticker} exceeds the single-stock review line`,
        detail:
          `${position.ticker} is ${position.weightPct.toFixed(
            1
          )}% of invested assets versus the ${dataset.householdPlan.singleStockReviewPct}% household review line.`,
        href: `/portfolio/${position.ticker.toLowerCase()}`,
      });
    }
  }

  if (
    !signals.some(
      (signal) =>
        signal.level === "critical" ||
        signal.level === "watch"
    )
  ) {
    signals.push({
      id: "portfolio:concentration-ok",
      level: "positive",
      category: "concentration",
      title:
        "Position concentration is within household review lines",
      detail:
        "No direct-stock position or top-three grouping currently exceeds the household concentration review lines.",
      href: "/portfolio-intelligence",
    });
  }

  const rank: Record<
    PortfolioSignalLevel,
    number
  > = {
    critical: 4,
    watch: 3,
    positive: 2,
    info: 1,
  };

  signals.sort(
    (a, b) =>
      rank[b.level] - rank[a.level]
  );

  return {
    version: "2.0",
    totalPortfolioValue,
    directStockValue,
    topThreeStockWeightPct:
      topThree,
    largestStockWeightPct:
      weightOrdered[0]?.weightPct ??
      0,
    positions,
    sectors,
    signals,
    criticalCount:
      signals.filter(
        (signal) =>
          signal.level === "critical"
      ).length,
    watchCount:
      signals.filter(
        (signal) =>
          signal.level === "watch"
      ).length,
  };
}
