import type {
  Holding,
  MoneyDataset,
} from "@/lib/demo-data";
import type {
  ResearchConnection,
  ResearchSnapshot,
} from "@/lib/research";

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
    | "thesis"
    | "valuation"
    | "evidence"
    | "coverage";
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
  researchCovered: boolean;
  researchVersion: number | null;
  researchScore: number | null;
  evidenceConfidence: number | null;
  decisionReadiness: number | null;
  thesisHealth: string | null;
  thesisWeakenedCount: number;
  baseValue: number | null;
  valuationGapPct: number | null;
  researchAgeDays: number | null;
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
  version: "1.5";
  researchConnected: boolean;
  researchError: string | null;
  totalPortfolioValue: number;
  directStockValue: number;
  coveredValue: number;
  coveragePct: number;
  weightedResearchScore: number | null;
  weightedEvidenceConfidence: number | null;
  weightedValuationGapPct: number | null;
  topThreeStockWeightPct: number;
  largestStockWeightPct: number;
  positions: PortfolioPositionIntelligence[];
  sectors: PortfolioSectorExposure[];
  signals: PortfolioSignal[];
  criticalCount: number;
  watchCount: number;
};

function weightedAverage(
  rows: Array<{ value: number; metric: number | null }>
) {
  const usable = rows.filter(
    (
      row
    ): row is { value: number; metric: number } =>
      row.metric != null &&
      Number.isFinite(row.metric) &&
      row.value > 0
  );

  const total = usable.reduce(
    (sum, row) => sum + row.value,
    0
  );

  if (!total) return null;

  return (
    usable.reduce(
      (sum, row) =>
        sum + row.metric * row.value,
      0
    ) / total
  );
}

function daysSince(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(
    0,
    Math.floor(
      (Date.now() - timestamp) / 86_400_000
    )
  );
}

function researchAge(
  snapshot: ResearchSnapshot
) {
  return daysSince(
    snapshot.evidence_confidence_as_of ??
      snapshot.coverage_as_of_date ??
      snapshot.published_at ??
      snapshot.data_cutoff_at ??
      snapshot.researched_at
  );
}

function valuationGap(
  holding: Holding,
  snapshot: ResearchSnapshot
) {
  if (
    !Number.isFinite(holding.price) ||
    holding.price <= 0 ||
    snapshot.base_value == null ||
    !Number.isFinite(snapshot.base_value)
  ) {
    return null;
  }

  return (
    ((snapshot.base_value - holding.price) /
      holding.price) *
    100
  );
}

function thesisNeedsReview(
  snapshot: ResearchSnapshot
) {
  const health = snapshot.thesis_health
    .trim()
    .toLowerCase();
  const weakenedChange =
    snapshot.what_changed.some(
      (change) =>
        String(change.direction ?? "")
          .toLowerCase() === "weakened"
    );

  return (
    snapshot.thesis_weakened_count > 0 ||
    weakenedChange ||
    [
      "watch",
      "monitor",
      "at_risk",
      "at risk",
      "weakened",
      "weakening",
    ].includes(health)
  );
}

function thesisCritical(
  snapshot: ResearchSnapshot
) {
  const health = snapshot.thesis_health
    .trim()
    .toLowerCase();
  const highMaterialityWeakening =
    snapshot.what_changed.some(
      (change) =>
        String(change.direction ?? "")
          .toLowerCase() === "weakened" &&
        String(change.materiality ?? "")
          .toLowerCase() === "high"
    );

  return (
    snapshot.thesis_weakened_count >= 2 ||
    highMaterialityWeakening ||
    [
      "at_risk",
      "at risk",
      "weakened",
    ].includes(health)
  );
}

function positionIntelligence(
  holding: Holding,
  totalPortfolioValue: number,
  snapshot: ResearchSnapshot | undefined,
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

  if (!snapshot) {
    const uncoveredMaterial =
      weightPct >=
      Math.max(5, reviewThresholdPct / 2);

    return {
      ticker: holding.ticker,
      name: holding.name,
      sector: holding.sector,
      value: holding.value,
      weightPct,
      currentPrice: holding.price,
      costBasis: holding.costBasis,
      unrealizedPct,
      researchCovered: false,
      researchVersion: null,
      researchScore: null,
      evidenceConfidence: null,
      decisionReadiness: null,
      thesisHealth: null,
      thesisWeakenedCount: 0,
      baseValue: null,
      valuationGapPct: null,
      researchAgeDays: null,
      reviewPriority:
        Math.round(weightPct * 2) +
        (uncoveredMaterial ? 30 : 10),
      reviewReasons: uncoveredMaterial
        ? [
            "Material portfolio position has no published Solpient Research coverage.",
          ]
        : [
            "No published Solpient Research coverage.",
          ],
    };
  }

  const gap = valuationGap(
    holding,
    snapshot
  );
  const age = researchAge(snapshot);
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

  if (thesisNeedsReview(snapshot)) {
    priority += thesisCritical(snapshot)
      ? 35
      : 22;
    reasons.push(
      `Published thesis health is ${snapshot.thesis_health.replaceAll(
        "_",
        " "
      )} with ${snapshot.thesis_weakened_count} weakened tracked condition(s).`
    );
  }

  if (
    gap != null &&
    gap <= -20
  ) {
    priority += 18;
    reasons.push(
      `Current holding price is ${Math.abs(
        gap
      ).toFixed(1)}% above the published Research base value.`
    );
  }

  if (
    snapshot.evidence_confidence_score != null &&
    snapshot.evidence_confidence_score < 60
  ) {
    priority +=
      snapshot.evidence_confidence_score < 45
        ? 22
        : 14;
    reasons.push(
      `Evidence confidence is ${snapshot.evidence_confidence_score.toFixed(
        0
      )}/100.`
    );
  }

  if (
    snapshot.current_decision_readiness_pct != null &&
    snapshot.current_decision_readiness_pct < 60
  ) {
    priority += 12;
    reasons.push(
      `Decision readiness is ${snapshot.current_decision_readiness_pct.toFixed(
        0
      )}%.`
    );
  }

  if (
    age != null &&
    age > 120
  ) {
    priority += 10;
    reasons.push(
      `Latest Research evidence is ${age} days old.`
    );
  }

  if (!reasons.length) {
    reasons.push(
      "No material portfolio/Research conflict detected."
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
    researchCovered: true,
    researchVersion: snapshot.research_version,
    researchScore:
      snapshot.overall_score,
    evidenceConfidence:
      snapshot.evidence_confidence_score,
    decisionReadiness:
      snapshot.current_decision_readiness_pct,
    thesisHealth:
      snapshot.thesis_health,
    thesisWeakenedCount:
      snapshot.thesis_weakened_count,
    baseValue: snapshot.base_value,
    valuationGapPct: gap,
    researchAgeDays: age,
    reviewPriority: priority,
    reviewReasons: reasons,
  };
}

export function buildPortfolioIntelligence(
  dataset: MoneyDataset,
  research: ResearchConnection
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
        research.snapshots[holding.ticker],
        dataset.householdPlan
          .singleStockReviewPct
      )
    )
    .sort(
      (a, b) =>
        b.reviewPriority -
        a.reviewPriority
    );

  const covered =
    positions.filter(
      (position) =>
        position.researchCovered
    );
  const coveredValue =
    covered.reduce(
      (sum, position) =>
        sum + position.value,
      0
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

  if (!research.connected) {
    signals.push({
      id: "portfolio:research-unavailable",
      level: "watch",
      category: "coverage",
      title:
        "Portfolio Research connection is unavailable",
      detail:
        "Solpient can measure position exposure, but it cannot verify current published thesis, valuation, or evidence state until the Research read contract is reachable.",
      href: "/portfolio-intelligence",
    });
  }

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
    const snapshot =
      research.snapshots[position.ticker];
    const materialWeight =
      position.weightPct >=
      Math.max(
        5,
        dataset.householdPlan
          .singleStockReviewPct / 2
      );
    const concentrated =
      position.weightPct >
      dataset.householdPlan
        .singleStockReviewPct;

    if (
      research.connected &&
      !position.researchCovered &&
      materialWeight
    ) {
      signals.push({
        id: `portfolio:${position.ticker}:uncovered`,
        level: "watch",
        category: "coverage",
        ticker: position.ticker,
        title:
          `${position.ticker} is material but lacks published Research coverage`,
        detail:
          `${position.ticker} is ${position.weightPct.toFixed(
            1
          )}% of invested assets. Solpient will not substitute a synthetic thesis or valuation.`,
        href: `/portfolio/${position.ticker.toLowerCase()}`,
      });
      continue;
    }

    if (!snapshot) continue;

    if (
      concentrated &&
      thesisNeedsReview(snapshot)
    ) {
      signals.push({
        id: `portfolio:${position.ticker}:concentration-thesis`,
        level:
          thesisCritical(snapshot)
            ? "critical"
            : "watch",
        category: "thesis",
        ticker: position.ticker,
        title:
          `${position.ticker}: large position and thesis deterioration overlap`,
        detail:
          `${position.ticker} is ${position.weightPct.toFixed(
            1
          )}% of invested assets while published Research shows ${snapshot.thesis_weakened_count} weakened condition(s) and thesis health ${snapshot.thesis_health.replaceAll(
            "_",
            " "
          )}.`,
        href: `/portfolio/${position.ticker.toLowerCase()}`,
      });
    } else if (
      thesisNeedsReview(snapshot) &&
      materialWeight
    ) {
      signals.push({
        id: `portfolio:${position.ticker}:thesis`,
        level: "watch",
        category: "thesis",
        ticker: position.ticker,
        title:
          `${position.ticker}: published thesis deserves review`,
        detail:
          `The position is ${position.weightPct.toFixed(
            1
          )}% of invested assets and the latest Research package shows thesis health ${snapshot.thesis_health.replaceAll(
            "_",
            " "
          )}.`,
        href: `/portfolio/${position.ticker.toLowerCase()}`,
      });
    }

    if (
      position.valuationGapPct != null &&
      position.valuationGapPct <= -20 &&
      materialWeight
    ) {
      signals.push({
        id: `portfolio:${position.ticker}:valuation-stretch`,
        level: "watch",
        category: "valuation",
        ticker: position.ticker,
        title:
          `${position.ticker}: price is materially above Research base value`,
        detail:
          `Current holding price is ${Math.abs(
            position.valuationGapPct
          ).toFixed(
            1
          )}% above the latest published Research base value, with a ${position.weightPct.toFixed(
            1
          )}% portfolio weight.`,
        href: `/portfolio/${position.ticker.toLowerCase()}`,
      });
    }

    if (
      position.evidenceConfidence != null &&
      position.evidenceConfidence < 60 &&
      materialWeight
    ) {
      signals.push({
        id: `portfolio:${position.ticker}:evidence`,
        level:
          concentrated &&
          position.evidenceConfidence < 45
            ? "critical"
            : "watch",
        category: "evidence",
        ticker: position.ticker,
        title:
          `${position.ticker}: portfolio exposure exceeds Research confidence`,
        detail:
          `Evidence confidence is ${position.evidenceConfidence.toFixed(
            0
          )}/100 for a position representing ${position.weightPct.toFixed(
            1
          )}% of invested assets.`,
        href: `/portfolio/${position.ticker.toLowerCase()}`,
      });
    }

    if (
      position.researchAgeDays != null &&
      position.researchAgeDays > 120 &&
      materialWeight
    ) {
      signals.push({
        id: `portfolio:${position.ticker}:stale-research`,
        level: "watch",
        category: "evidence",
        ticker: position.ticker,
        title:
          `${position.ticker}: Research evidence is stale for the position size`,
        detail:
          `The latest Research evidence is ${position.researchAgeDays} days old while the holding represents ${position.weightPct.toFixed(
            1
          )}% of invested assets.`,
        href: `/portfolio/${position.ticker.toLowerCase()}`,
      });
    }

    if (
      position.valuationGapPct != null &&
      position.valuationGapPct >= 25 &&
      (position.evidenceConfidence ?? 0) >=
        70 &&
      !thesisNeedsReview(snapshot)
    ) {
      signals.push({
        id: `portfolio:${position.ticker}:valuation-support`,
        level: "positive",
        category: "valuation",
        ticker: position.ticker,
        title:
          `${position.ticker}: valuation and evidence currently align`,
        detail:
          `Published Research base value is ${position.valuationGapPct.toFixed(
            1
          )}% above the current holding price with evidence confidence ${position.evidenceConfidence?.toFixed(
            0
          )}/100 and no tracked thesis deterioration.`,
        href: `/portfolio/${position.ticker.toLowerCase()}`,
      });
    }
  }

  if (
    research.connected &&
    !signals.some(
      (signal) =>
        signal.level === "critical" ||
        signal.level === "watch"
    )
  ) {
    signals.push({
      id: "portfolio:no-material-conflict",
      level: "positive",
      category: "coverage",
      title:
        "No material portfolio/Research conflict detected",
      detail:
        "Current position sizes, published thesis status, valuation context, and evidence confidence are within V1.5 review thresholds.",
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
    version: "1.5",
    researchConnected:
      research.connected,
    researchError: research.error,
    totalPortfolioValue,
    directStockValue,
    coveredValue,
    coveragePct:
      directStockValue > 0
        ? (coveredValue /
            directStockValue) *
          100
        : 0,
    weightedResearchScore:
      weightedAverage(
        covered.map((position) => ({
          value: position.value,
          metric:
            position.researchScore,
        }))
      ),
    weightedEvidenceConfidence:
      weightedAverage(
        covered.map((position) => ({
          value: position.value,
          metric:
            position.evidenceConfidence,
        }))
      ),
    weightedValuationGapPct:
      weightedAverage(
        covered.map((position) => ({
          value: position.value,
          metric:
            position.valuationGapPct,
        }))
      ),
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
