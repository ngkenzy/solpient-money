import type { Holding } from "@/lib/demo-data";

const DEFAULT_RESEARCH_SUPABASE_URL = "https://hmfrlpsjszjpvzogrico.supabase.co";
const DEFAULT_RESEARCH_PUBLISHABLE_KEY = "sb_publishable_KVgQDNO-qAJAZ4KN8F1eCA_xOeEqw0m";

export type ThesisVariable = {
  variable_name: string | null;
  status: string | null;
  expectation: string | null;
  observed_value: string | null;
  evidence: string | null;
  breaker_condition: string | null;
};

export type ResearchRisk = {
  risk_key: string | null;
  title: string | null;
  category: string | null;
  probability: string | null;
  severity: string | null;
  description: string | null;
  leading_indicators: string | null;
  thesis_breaker: string | null;
  evidence: string | null;
};

export type ResearchChange = {
  category: string | null;
  change_type: string | null;
  metric_key: string | null;
  label: string | null;
  old_value: number | null;
  new_value: number | null;
  delta_value: number | null;
  delta_percent: number | null;
  old_text: string | null;
  new_text: string | null;
  direction: string | null;
  materiality: string | null;
  summary: string | null;
  created_at: string | null;
};

export type ResearchSnapshot = {
  ticker: string;
  company_name: string;
  sector: string | null;
  industry: string | null;
  research_run_id: string;
  research_version: number;
  researched_at: string | null;
  published_at: string | null;
  data_cutoff_at: string | null;
  standard_version: string | null;
  standard_status: string | null;
  completeness_pct: number | null;
  methodology_version: string | null;
  price_at_research: number | null;
  research_summary: string | null;
  overall_score: number | null;
  quality_score: number | null;
  growth_score: number | null;
  valuation_score: number | null;
  financial_strength_score: number | null;
  moat_score: number | null;
  thesis_integrity_score: number | null;
  bear_value: number | null;
  base_value: number | null;
  bull_value: number | null;
  mos_25_price: number | null;
  mos_35_price: number | null;
  mos_50_price: number | null;
  base_value_gap_pct: number | null;
  investment_thesis: Record<string, unknown> | null;
  decision_dashboard: Record<string, unknown> | null;
  final_conclusion: Record<string, unknown> | null;
  thesis_health: string;
  thesis_strengthened_count: number;
  thesis_weakened_count: number;
  thesis_unchanged_count: number;
  thesis_monitor_count: number;
  thesis_variables: ThesisVariable[];
  risks: ResearchRisk[];
  what_changed: ResearchChange[];
  evidence_confidence_score: number | null;
  evidence_component_coverage_pct: number | null;
  readiness_state: string | null;
  readiness_tier: number | null;
  ranking_methodology_version: string | null;
  evidence_confidence_as_of: string | null;
  current_coverage_pct: number | null;
  current_decision_readiness_pct: number | null;
  coverage_engine_version: string | null;
  coverage_as_of_date: string | null;
};

export type ResearchConnection = {
  connected: boolean;
  snapshots: Record<string, ResearchSnapshot>;
  error: string | null;
  source: "live-solpient-research" | "unavailable";
};

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(row: Record<string, unknown>): ResearchSnapshot {
  return {
    ...(row as unknown as ResearchSnapshot),
    ticker: String(row.ticker ?? "").toUpperCase(),
    company_name: String(row.company_name ?? ""),
    research_run_id: String(row.research_run_id ?? ""),
    research_version: Number(row.research_version ?? 0),
    completeness_pct: num(row.completeness_pct),
    price_at_research: num(row.price_at_research),
    overall_score: num(row.overall_score),
    quality_score: num(row.quality_score),
    growth_score: num(row.growth_score),
    valuation_score: num(row.valuation_score),
    financial_strength_score: num(row.financial_strength_score),
    moat_score: num(row.moat_score),
    thesis_integrity_score: num(row.thesis_integrity_score),
    bear_value: num(row.bear_value),
    base_value: num(row.base_value),
    bull_value: num(row.bull_value),
    mos_25_price: num(row.mos_25_price),
    mos_35_price: num(row.mos_35_price),
    mos_50_price: num(row.mos_50_price),
    base_value_gap_pct: num(row.base_value_gap_pct),
    thesis_health: String(row.thesis_health ?? "not_tracked"),
    thesis_strengthened_count: Number(row.thesis_strengthened_count ?? 0),
    thesis_weakened_count: Number(row.thesis_weakened_count ?? 0),
    thesis_unchanged_count: Number(row.thesis_unchanged_count ?? 0),
    thesis_monitor_count: Number(row.thesis_monitor_count ?? 0),
    thesis_variables: Array.isArray(row.thesis_variables) ? (row.thesis_variables as ThesisVariable[]) : [],
    risks: Array.isArray(row.risks) ? (row.risks as ResearchRisk[]) : [],
    what_changed: Array.isArray(row.what_changed) ? (row.what_changed as ResearchChange[]) : [],
    evidence_confidence_score: num(row.evidence_confidence_score),
    evidence_component_coverage_pct: num(row.evidence_component_coverage_pct),
    readiness_tier: num(row.readiness_tier),
    current_coverage_pct: num(row.current_coverage_pct),
    current_decision_readiness_pct: num(row.current_decision_readiness_pct),
  };
}

export async function loadResearchSnapshots(tickers: string[]): Promise<ResearchConnection> {
  const clean = Array.from(new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean)));
  if (!clean.length) {
    return { connected: true, snapshots: {}, error: null, source: "live-solpient-research" };
  }

  const baseUrl =
    process.env.SOLPIENT_RESEARCH_SUPABASE_URL?.replace(/\/$/, "") ??
    DEFAULT_RESEARCH_SUPABASE_URL;
  const publishableKey =
    process.env.SOLPIENT_RESEARCH_PUBLISHABLE_KEY ??
    DEFAULT_RESEARCH_PUBLISHABLE_KEY;

  const params = new URLSearchParams({
    select: "*",
    ticker: `in.(${clean.join(",")})`,
  });

  try {
    const response = await fetch(
      `${baseUrl}/rest/v1/money_research_snapshots_v1?${params.toString()}`,
      {
        headers: {
          apikey: publishableKey,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Research API returned ${response.status}: ${detail.slice(0, 180)}`);
    }

    const rows = (await response.json()) as Array<Record<string, unknown>>;
    const snapshots = Object.fromEntries(
      rows.map((row) => {
        const snapshot = normalize(row);
        return [snapshot.ticker, snapshot];
      })
    );

    return {
      connected: true,
      snapshots,
      error: null,
      source: "live-solpient-research",
    };
  } catch (error) {
    return {
      connected: false,
      snapshots: {},
      error: error instanceof Error ? error.message : "Unknown Research connection error",
      source: "unavailable",
    };
  }
}

export function summarizeResearchCoverage(
  holdings: Holding[],
  snapshots: Record<string, ResearchSnapshot>
) {
  const directStocks = holdings.filter((holding) => holding.kind === "stock");
  const totalDirectStockValue = directStocks.reduce((sum, holding) => sum + holding.value, 0);
  const covered = directStocks.filter((holding) => snapshots[holding.ticker]);
  const coveredValue = covered.reduce((sum, holding) => sum + holding.value, 0);

  const weightedScore =
    coveredValue > 0
      ? covered.reduce(
          (sum, holding) =>
            sum + (snapshots[holding.ticker]?.overall_score ?? 0) * holding.value,
          0
        ) / coveredValue
      : null;

  const confidenceCovered = covered.filter(
    (holding) => snapshots[holding.ticker]?.evidence_confidence_score != null
  );
  const confidenceValue = confidenceCovered.reduce((sum, holding) => sum + holding.value, 0);
  const weightedEvidenceConfidence =
    confidenceValue > 0
      ? confidenceCovered.reduce(
          (sum, holding) =>
            sum +
            (snapshots[holding.ticker]?.evidence_confidence_score ?? 0) * holding.value,
          0
        ) / confidenceValue
      : null;

  return {
    coveredCount: covered.length,
    totalDirectStockCount: directStocks.length,
    coveragePct: totalDirectStockValue > 0 ? (coveredValue / totalDirectStockValue) * 100 : 0,
    coveredValue,
    totalDirectStockValue,
    weightedScore,
    weightedEvidenceConfidence,
  };
}

export function formatResearchDate(value: string | null) {
  if (!value) return "Legacy publication";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
