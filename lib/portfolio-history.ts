import "server-only";

import type { Holding, MoneyDataset } from "@/lib/demo-data";
import { requireActiveHousehold } from "@/lib/money-auth";
import type {
  PortfolioIntelligenceReport,
  PortfolioPositionIntelligence,
} from "@/lib/portfolio-intelligence";

export type InvestmentDecisionType =
  | "hold"
  | "add_later"
  | "reduce_later"
  | "watch"
  | "no_action";

export type PortfolioHistoryPoint = {
  id: string;
  date: string;
  ticker: string;
  name: string;
  sector: string;
  shares: number;
  price: number;
  marketValue: number;
  costBasis: number;
  weightPct: number;
  unrealizedPct: number | null;
  researchCovered: boolean;
  researchVersion: number | null;
  researchScore: number | null;
  baseValue: number | null;
  valuationGapPct: number | null;
  thesisHealth: string | null;
  thesisWeakenedCount: number;
  evidenceConfidence: number | null;
  decisionReadiness: number | null;
  researchAgeDays: number | null;
  reviewPriority: number;
  reviewReasons: string[];
  createdAt: string;
};

export type InvestmentDecision = {
  id: string;
  ticker: string;
  decisionType: InvestmentDecisionType;
  note: string | null;
  actionItemId: string | null;
  positionSnapshotId: string | null;
  baselineSnapshot: PortfolioHistoryPoint | null;
  decidedAt: string;
};

export type DecisionChange = {
  ticker: string;
  decision: InvestmentDecision | null;
  baseline: PortfolioHistoryPoint | null;
  current: PortfolioHistoryPoint | null;
  priceChangePct: number | null;
  valueChangePct: number | null;
  weightChangePctPoints: number | null;
  baseValueChangePct: number | null;
  evidenceChange: number | null;
  reviewPriorityChange: number | null;
  thesisChanged: boolean;
  summary: string;
};

function numberValue(
  value: unknown,
  fallback = 0
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function nullableNumber(value: unknown) {
  if (
    value == null ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function isoDate(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw.slice(0, 10)
    : parsed.toISOString().slice(0, 10);
}

function isoTimestamp(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : parsed.toISOString();
}

function dollars(value: unknown) {
  return numberValue(value) / 100;
}

function pctChange(
  current: number,
  baseline: number
) {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(baseline) ||
    baseline === 0
  ) {
    return null;
  }

  return (
    ((current - baseline) /
      Math.abs(baseline)) *
    100
  );
}

function historyPoint(
  row: Record<string, unknown>
): PortfolioHistoryPoint {
  return {
    id: String(row.id ?? ""),
    date: isoDate(row.snapshot_date),
    ticker: String(row.ticker ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    sector: String(row.sector ?? "Other"),
    shares: numberValue(row.shares),
    price: numberValue(row.price),
    marketValue: dollars(
      row.market_value_cents
    ),
    costBasis: dollars(
      row.cost_basis_cents
    ),
    weightPct: numberValue(
      row.portfolio_weight_pct
    ),
    unrealizedPct: nullableNumber(
      row.unrealized_pct
    ),
    researchCovered:
      row.research_covered === true,
    researchVersion:
      row.research_version == null
        ? null
        : numberValue(
            row.research_version
          ),
    researchScore: nullableNumber(
      row.research_score
    ),
    baseValue: nullableNumber(
      row.base_value
    ),
    valuationGapPct: nullableNumber(
      row.valuation_gap_pct
    ),
    thesisHealth:
      row.thesis_health == null
        ? null
        : String(row.thesis_health),
    thesisWeakenedCount:
      numberValue(
        row.thesis_weakened_count
      ),
    evidenceConfidence:
      nullableNumber(
        row.evidence_confidence
      ),
    decisionReadiness:
      nullableNumber(
        row.decision_readiness
      ),
    researchAgeDays:
      row.research_age_days == null
        ? null
        : numberValue(
            row.research_age_days
          ),
    reviewPriority:
      numberValue(
        row.review_priority
      ),
    reviewReasons:
      Array.isArray(row.review_reasons)
        ? row.review_reasons.map(String)
        : [],
    createdAt: isoTimestamp(
      row.created_at
    ),
  };
}

function decisionRow(
  row: Record<string, unknown>
): InvestmentDecision {
  const type = String(
    row.decision_type ?? "watch"
  ) as InvestmentDecisionType;

  return {
    id: String(row.id ?? ""),
    ticker: String(
      row.ticker ?? ""
    ).toUpperCase(),
    decisionType: type,
    note:
      row.note == null
        ? null
        : String(row.note),
    actionItemId:
      row.action_item_id == null
        ? null
        : String(row.action_item_id),
    positionSnapshotId:
      row.position_snapshot_id == null
        ? null
        : String(row.position_snapshot_id),
    baselineSnapshot:
      row.baseline_snapshot &&
      typeof row.baseline_snapshot === "object" &&
      Object.keys(
        row.baseline_snapshot as Record<string, unknown>
      ).length
        ? historyPoint(
            row.baseline_snapshot as Record<string, unknown>
          )
        : null,
    decidedAt: isoTimestamp(
      row.decided_at
    ),
  };
}

function cents(value: number) {
  return Math.round(value * 100);
}

function snapshotPayload(
  householdId: string,
  snapshotDate: string,
  position: PortfolioPositionIntelligence,
  holding: Holding
) {
  return {
    household_id: householdId,
    snapshot_date: snapshotDate,
    ticker: position.ticker,
    name: position.name,
    sector: position.sector,
    shares: holding.shares,
    price: position.currentPrice,
    market_value_cents:
      cents(position.value),
    cost_basis_cents:
      cents(position.costBasis),
    portfolio_weight_pct:
      position.weightPct,
    unrealized_pct:
      position.unrealizedPct,
    research_covered:
      position.researchCovered,
    research_version:
      position.researchVersion,
    research_score:
      position.researchScore,
    base_value:
      position.baseValue,
    valuation_gap_pct:
      position.valuationGapPct,
    thesis_health:
      position.thesisHealth,
    thesis_weakened_count:
      position.thesisWeakenedCount,
    evidence_confidence:
      position.evidenceConfidence,
    decision_readiness:
      position.decisionReadiness,
    research_age_days:
      position.researchAgeDays,
    review_priority:
      position.reviewPriority,
    review_reasons:
      JSON.stringify(
        position.reviewReasons
      ),
  };
}

export async function capturePortfolioHistory(
  report: PortfolioIntelligenceReport,
  dataset: MoneyDataset,
  now = new Date()
) {
  const { supabase, householdId } =
    await requireActiveHousehold();

  const snapshotDate =
    now.toISOString().slice(0, 10);

  const holdingsByTicker = new Map(
    dataset.holdings.map(
      (holding) => [
        holding.ticker.toUpperCase(),
        holding,
      ]
    )
  );

  let captured = 0;

  for (const position of report.positions) {
    const holding = holdingsByTicker.get(
      position.ticker
    );
    if (!holding) continue;

    const payload = snapshotPayload(
      householdId,
      snapshotDate,
      {
        ...position,
        currentPrice: holding.price,
        costBasis: holding.costBasis,
        value: holding.value,
      },
      holding
    );

    const { error } = await supabase
      .from(
        "portfolio_position_snapshots"
      )
      .upsert(payload, {
        onConflict:
          "household_id,snapshot_date,ticker",
      });

    if (error) {
      throw new Error(
        `Unable to save V1.6 portfolio history for ${position.ticker}: ${error.message}`
      );
    }

    captured += 1;
  }

  return {
    snapshotDate,
    captured,
  };
}

export async function createInvestmentDecision({
  ticker,
  decisionType,
  note,
  actionItemId = null,
}: {
  ticker: string;
  decisionType: InvestmentDecisionType;
  note?: string | null;
  actionItemId?: string | null;
}) {
  const cleanTicker =
    ticker.trim().toUpperCase();

  if (!cleanTicker) {
    throw new Error(
      "Ticker is required."
    );
  }

  if (
    ![
      "hold",
      "add_later",
      "reduce_later",
      "watch",
      "no_action",
    ].includes(decisionType)
  ) {
    throw new Error(
      "Unsupported investment decision type."
    );
  }

  const { supabase, householdId } =
    await requireActiveHousehold();

  const { data: latest, error: snapshotError } =
    await supabase
      .from(
        "portfolio_position_snapshots"
      )
      .select("*")
      .eq(
        "household_id",
        householdId
      )
      .eq("ticker", cleanTicker)
      .order("snapshot_date", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (snapshotError) {
    throw new Error(
      `Unable to find current portfolio history for ${cleanTicker}: ${snapshotError.message}`
    );
  }

  const trimmedNote =
    String(note ?? "")
      .trim()
      .slice(0, 4000);

  let validatedActionItemId: string | null = null;

  if (actionItemId) {
    const { data: actionItem, error: actionError } =
      await supabase
        .from("money_action_items")
        .select("id,household_id")
        .eq("id", actionItemId)
        .eq("household_id", householdId)
        .maybeSingle();

    if (actionError) {
      throw new Error(
        `Unable to validate Action Center link: ${actionError.message}`
      );
    }

    validatedActionItemId =
      actionItem?.id
        ? String(actionItem.id)
        : null;
  }

  const { error } = await supabase
    .from("investment_decisions")
    .insert({
      household_id: householdId,
      ticker: cleanTicker,
      decision_type: decisionType,
      note:
        trimmedNote || null,
      action_item_id:
        validatedActionItemId,
      position_snapshot_id:
        latest?.id ?? null,
      baseline_snapshot:
        latest ?? {},
      decided_at:
        new Date().toISOString(),
    });

  if (error) {
    throw new Error(
      `Unable to save investment decision: ${error.message}`
    );
  }
}

export async function getTickerHistory(
  ticker: string,
  limit = 180
) {
  const cleanTicker =
    ticker.trim().toUpperCase();
  const { supabase, householdId } =
    await requireActiveHousehold();

  const { data, error } = await supabase
    .from(
      "portfolio_position_snapshots"
    )
    .select("*")
    .eq("household_id", householdId)
    .eq("ticker", cleanTicker)
    .order("snapshot_date", {
      ascending: true,
    })
    .limit(
      Math.max(
        1,
        Math.min(730, limit)
      )
    );

  if (error) {
    throw new Error(
      `Unable to load ${cleanTicker} history: ${error.message}`
    );
  }

  return (
    (data ?? []) as Array<
      Record<string, unknown>
    >
  ).map(historyPoint);
}

export async function getDecisionJournal(
  limit = 100
) {
  const { supabase, householdId } =
    await requireActiveHousehold();

  const { data, error } = await supabase
    .from("investment_decisions")
    .select("*")
    .eq("household_id", householdId)
    .order("decided_at", {
      ascending: false,
    })
    .limit(
      Math.max(
        1,
        Math.min(500, limit)
      )
    );

  if (error) {
    throw new Error(
      `Unable to load decision journal: ${error.message}`
    );
  }

  return (
    (data ?? []) as Array<
      Record<string, unknown>
    >
  ).map(decisionRow);
}

async function snapshotById(
  id: string | null
) {
  if (!id) return null;

  const { supabase, householdId } =
    await requireActiveHousehold();

  const { data, error } = await supabase
    .from(
      "portfolio_position_snapshots"
    )
    .select("*")
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load decision snapshot: ${error.message}`
    );
  }

  return data
    ? historyPoint(
        data as Record<
          string,
          unknown
        >
      )
    : null;
}

export async function getDecisionChange(
  ticker: string
): Promise<DecisionChange> {
  const cleanTicker =
    ticker.trim().toUpperCase();

  const { supabase, householdId } =
    await requireActiveHousehold();

  const [
    decisionResult,
    currentResult,
  ] = await Promise.all([
    supabase
      .from("investment_decisions")
      .select("*")
      .eq(
        "household_id",
        householdId
      )
      .eq("ticker", cleanTicker)
      .order("decided_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle(),
    supabase
      .from(
        "portfolio_position_snapshots"
      )
      .select("*")
      .eq(
        "household_id",
        householdId
      )
      .eq("ticker", cleanTicker)
      .order("snapshot_date", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle(),
  ]);

  if (decisionResult.error) {
    throw new Error(
      `Unable to load latest ${cleanTicker} decision: ${decisionResult.error.message}`
    );
  }

  if (currentResult.error) {
    throw new Error(
      `Unable to load current ${cleanTicker} history: ${currentResult.error.message}`
    );
  }

  const decision =
    decisionResult.data
      ? decisionRow(
          decisionResult.data as Record<
            string,
            unknown
          >
        )
      : null;

  const baseline =
    decision?.baselineSnapshot ??
    (decision
      ? await snapshotById(
          decision.positionSnapshotId
        )
      : null);

  const current =
    currentResult.data
      ? historyPoint(
          currentResult.data as Record<
            string,
            unknown
          >
        )
      : null;

  const priceChangePct =
    baseline && current
      ? pctChange(
          current.price,
          baseline.price
        )
      : null;
  const valueChangePct =
    baseline && current
      ? pctChange(
          current.marketValue,
          baseline.marketValue
        )
      : null;
  const baseValueChangePct =
    baseline?.baseValue != null &&
    current?.baseValue != null
      ? pctChange(
          current.baseValue,
          baseline.baseValue
        )
      : null;
  const weightChangePctPoints =
    baseline && current
      ? current.weightPct -
        baseline.weightPct
      : null;
  const evidenceChange =
    baseline?.evidenceConfidence != null &&
    current?.evidenceConfidence != null
      ? current.evidenceConfidence -
        baseline.evidenceConfidence
      : null;
  const reviewPriorityChange =
    baseline && current
      ? current.reviewPriority -
        baseline.reviewPriority
      : null;
  const thesisChanged =
    Boolean(
      baseline &&
        current &&
        baseline.thesisHealth !==
          current.thesisHealth
    );

  let summary: string;

  if (!decision) {
    summary =
      `No V1.6 decision has been recorded for ${cleanTicker} yet.`;
  } else if (
    !baseline ||
    !current
  ) {
    summary =
      `The latest ${cleanTicker} decision is recorded, but Solpient does not yet have enough position-history snapshots to compare what changed afterward.`;
  } else {
    const changes: string[] = [];

    if (priceChangePct != null) {
      changes.push(
        `price ${priceChangePct >= 0 ? "+" : ""}${priceChangePct.toFixed(1)}%`
      );
    }
    if (
      weightChangePctPoints != null
    ) {
      changes.push(
        `portfolio weight ${weightChangePctPoints >= 0 ? "+" : ""}${weightChangePctPoints.toFixed(1)} pts`
      );
    }
    if (
      evidenceChange != null &&
      Math.abs(evidenceChange) >= 0.1
    ) {
      changes.push(
        `evidence confidence ${evidenceChange >= 0 ? "+" : ""}${evidenceChange.toFixed(0)}`
      );
    }
    if (thesisChanged) {
      changes.push(
        `thesis ${baseline.thesisHealth ?? "none"} → ${current.thesisHealth ?? "none"}`
      );
    }

    summary =
      changes.length
        ? `Since your ${decision.decisionType.replaceAll("_", " ")} decision on ${cleanTicker}: ${changes.join(", ")}.`
        : `No material tracked V1.6 change is visible since your latest ${cleanTicker} decision.`;
  }

  return {
    ticker: cleanTicker,
    decision,
    baseline,
    current,
    priceChangePct,
    valueChangePct,
    weightChangePctPoints,
    baseValueChangePct,
    evidenceChange,
    reviewPriorityChange,
    thesisChanged,
    summary,
  };
}

export async function getPortfolioAttribution() {
  const { supabase, householdId } =
    await requireActiveHousehold();

  const { data, error } = await supabase
    .from(
      "portfolio_position_snapshots"
    )
    .select("*")
    .eq("household_id", householdId)
    .order("snapshot_date", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Unable to calculate V1.6 portfolio attribution: ${error.message}`
    );
  }

  const rows = (
    (data ?? []) as Array<
      Record<string, unknown>
    >
  ).map(historyPoint);

  const byTicker = new Map<
    string,
    PortfolioHistoryPoint[]
  >();

  for (const row of rows) {
    const list =
      byTicker.get(row.ticker) ?? [];
    list.push(row);
    byTicker.set(
      row.ticker,
      list
    );
  }

  return Array.from(
    byTicker.entries()
  )
    .map(([ticker, history]) => {
      const first = history[0];
      const latest =
        history[history.length - 1];
      const valueChange =
        latest.marketValue -
        first.marketValue;

      return {
        ticker,
        firstDate: first.date,
        latestDate: latest.date,
        firstValue:
          first.marketValue,
        latestValue:
          latest.marketValue,
        valueChange,
        valueChangePct:
          pctChange(
            latest.marketValue,
            first.marketValue
          ),
        weightChangePctPoints:
          latest.weightPct -
          first.weightPct,
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.valueChange) -
        Math.abs(a.valueChange)
    );
}
