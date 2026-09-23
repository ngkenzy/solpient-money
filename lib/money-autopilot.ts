import "server-only";

import { getCashFlowIntelligence } from "@/lib/cash-flow-intelligence";
import {
  getConnectorOverviews,
  runConnectorSync,
} from "@/lib/connect/registry";
import type {
  ConnectorId,
  ConnectorOverview,
  ConnectorSyncResult,
} from "@/lib/connect/sdk";
import { getFinancialSummary, getPortfolioMetrics } from "@/lib/finance";
import { buildFinancialHealthEngine } from "@/lib/financial-health-engine";
import { requireActiveHousehold } from "@/lib/money-auth";
import { requireMoneyDataset } from "@/lib/money-data";
import { getPlanMonitoring } from "@/lib/plan-monitor-engine";
import { syncActionCenterFromAlerts } from "@/lib/money-action-center";
import { buildPortfolioIntelligence } from "@/lib/portfolio-intelligence";
import { loadResearchSnapshots } from "@/lib/research";
import { capturePortfolioHistory } from "@/lib/portfolio-history";
import { getTspTracker } from "@/lib/tsp-tracker";
import { syncTspSharePrices } from "@/lib/tsp-prices";

export type AutopilotLevel =
  | "critical"
  | "watch"
  | "positive"
  | "info";

export type AutopilotAlert = {
  id: string;
  level: AutopilotLevel;
  category:
    | "connector"
    | "cash_flow"
    | "plan"
    | "change"
    | "data"
    | "portfolio"
    | "tsp";
  title: string;
  detail: string;
  href: string;
};

export type AutopilotMetricSnapshot = {
  observedAt: string;
  netWorth: number;
  assets: number;
  liabilities: number;
  cash: number;
  investments: number;
  monthlyIncome: number;
  monthlySpending: number;
  monthlySurplus: number;
  trailingSavingsRate: number;
  healthScore: number;
  planAlignment: number;
  planMaterialSignals: number;
  transactionCount: number;
  accountCount: number;
  holdingCount: number;
};

export type AutopilotMetricChange = {
  key: keyof Pick<
    AutopilotMetricSnapshot,
    | "netWorth"
    | "assets"
    | "liabilities"
    | "cash"
    | "investments"
    | "monthlyIncome"
    | "monthlySpending"
    | "monthlySurplus"
    | "healthScore"
    | "planAlignment"
    | "transactionCount"
  >;
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

export type AutopilotConnectorSummary = {
  id: ConnectorId;
  name: string;
  health: ConnectorOverview["health"];
  instanceCount: number;
  accountCount: number;
  staleCount: number;
  attentionCount: number;
  lastSyncedAt: string | null;
  automaticSync: boolean;
};

export type MoneyAutopilotBriefing = {
  version: "1.3";
  portfolioIntelligenceVersion: "1.5";
  decisionHistoryVersion: "1.6";
  tspTrackerVersion: "1.7";
  tspPriceSyncVersion: "1.7.1";
  runDate: string;
  observedAt: string;
  persisted: boolean;
  skippedBecauseAlreadyRun: boolean;
  previousRunDate: string | null;
  summary: string;
  snapshot: AutopilotMetricSnapshot;
  changes: AutopilotMetricChange[];
  alerts: AutopilotAlert[];
  connectors: AutopilotConnectorSummary[];
  syncResults: ConnectorSyncResult[];
  newTransactionCount: number;
  criticalCount: number;
  watchCount: number;
};

type AutopilotRunRow = {
  id: string;
  run_date: unknown;
  run_kind: unknown;
  started_at: unknown;
  completed_at: unknown;
  snapshot: unknown;
  connector_report: unknown;
  briefing: unknown;
  critical_count: unknown;
  watch_count: unknown;
  new_transaction_count: unknown;
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeSnapshot(value: unknown): AutopilotMetricSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<AutopilotMetricSnapshot>;
  if (
    typeof snapshot.observedAt !== "string" ||
    !Number.isFinite(Number(snapshot.netWorth))
  ) {
    return null;
  }

  return {
    observedAt: snapshot.observedAt,
    netWorth: numberValue(snapshot.netWorth),
    assets: numberValue(snapshot.assets),
    liabilities: numberValue(snapshot.liabilities),
    cash: numberValue(snapshot.cash),
    investments: numberValue(snapshot.investments),
    monthlyIncome: numberValue(snapshot.monthlyIncome),
    monthlySpending: numberValue(snapshot.monthlySpending),
    monthlySurplus: numberValue(snapshot.monthlySurplus),
    trailingSavingsRate: numberValue(snapshot.trailingSavingsRate),
    healthScore: numberValue(snapshot.healthScore),
    planAlignment: numberValue(snapshot.planAlignment),
    planMaterialSignals: numberValue(snapshot.planMaterialSignals),
    transactionCount: numberValue(snapshot.transactionCount),
    accountCount: numberValue(snapshot.accountCount),
    holdingCount: numberValue(snapshot.holdingCount),
  };
}

function connectorSummary(
  overview: ConnectorOverview
): AutopilotConnectorSummary {
  return {
    id: overview.manifest.id,
    name: overview.manifest.shortName,
    health: overview.health,
    instanceCount: overview.instanceCount,
    accountCount: overview.accountCount,
    staleCount: overview.staleCount,
    attentionCount: overview.attentionCount,
    lastSyncedAt: overview.lastSyncedAt,
    automaticSync: overview.manifest.capabilities.automaticSync,
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function metricChanges(
  current: AutopilotMetricSnapshot,
  previous: AutopilotMetricSnapshot | null
): AutopilotMetricChange[] {
  if (!previous) return [];

  const definitions: Array<{
    key: AutopilotMetricChange["key"];
    label: string;
  }> = [
    { key: "netWorth", label: "Net worth" },
    { key: "assets", label: "Assets" },
    { key: "liabilities", label: "Liabilities" },
    { key: "cash", label: "Cash" },
    { key: "investments", label: "Investments" },
    { key: "monthlyIncome", label: "Month-to-date income" },
    { key: "monthlySpending", label: "Month-to-date spending" },
    { key: "monthlySurplus", label: "Month-to-date surplus" },
    { key: "healthScore", label: "Financial health" },
    { key: "planAlignment", label: "Plan alignment" },
    { key: "transactionCount", label: "Transactions" },
  ];

  return definitions
    .map(({ key, label }) => {
      const currentValue = numberValue(current[key]);
      const previousValue = numberValue(previous[key]);
      const delta = currentValue - previousValue;
      return {
        key,
        label,
        current: currentValue,
        previous: previousValue,
        delta,
        deltaPct:
          previousValue !== 0
            ? (delta / Math.abs(previousValue)) * 100
            : null,
      };
    })
    .filter((change) => Math.abs(change.delta) > 0.0001);
}

function buildAlerts({
  connectors,
  cashFlowAlerts,
  planSignals,
  portfolioSignals,
  tspSignals,
  changes,
  previous,
  newTransactionCount,
}: {
  connectors: AutopilotConnectorSummary[];
  cashFlowAlerts: Array<{
    id: string;
    level: "watch" | "high";
    title: string;
    detail: string;
  }>;
  planSignals: Array<{
    id: string;
    level: "critical" | "watch" | "positive" | "info";
    title: string;
    detail: string;
    href: string;
  }>;
  portfolioSignals: Array<{
    id: string;
    level: "critical" | "watch" | "positive" | "info";
    title: string;
    detail: string;
    href: string;
  }>;
  tspSignals: Array<{
    id: string;
    level: "critical" | "watch" | "positive" | "info";
    title: string;
    detail: string;
  }>;
  changes: AutopilotMetricChange[];
  previous: AutopilotMetricSnapshot | null;
  newTransactionCount: number;
}) {
  const alerts: AutopilotAlert[] = [];

  for (const connector of connectors) {
    if (connector.attentionCount > 0 || connector.health === "attention") {
      alerts.push({
        id: `connector:${connector.id}:attention`,
        level: "critical",
        category: "connector",
        title: `${connector.name} needs attention`,
        detail:
          `${connector.attentionCount || connector.instanceCount} connection(s) require repair or review before Solpient can trust a fresh sync.`,
        href: "/connect",
      });
    } else if (connector.staleCount > 0 || connector.health === "stale") {
      alerts.push({
        id: `connector:${connector.id}:stale`,
        level: "watch",
        category: "connector",
        title: `${connector.name} data is stale`,
        detail:
          `${connector.staleCount || connector.instanceCount} source(s) are beyond their freshness window. Autopilot will not describe stale data as newly refreshed.`,
        href: connector.id === "files" ? "/connect" : "/connect",
      });
    }
  }

  for (const alert of cashFlowAlerts.slice(0, 4)) {
    alerts.push({
      id: `cash:${alert.id}`,
      level: alert.level === "high" ? "critical" : "watch",
      category: "cash_flow",
      title: alert.title,
      detail: alert.detail,
      href: "/cash-flow",
    });
  }

  for (const signal of planSignals) {
    if (signal.level === "info") continue;
    alerts.push({
      id: `plan:${signal.id}`,
      level: signal.level,
      category: "plan",
      title: signal.title,
      detail: signal.detail,
      href: signal.href,
    });
  }

  for (const signal of portfolioSignals) {
    if (signal.level === "info") continue;
    alerts.push({
      id: signal.id,
      level: signal.level,
      category: "portfolio",
      title: signal.title,
      detail: signal.detail,
      href: signal.href,
    });
  }

  for (const signal of tspSignals) {
    if (signal.level === "info") continue;
    alerts.push({
      id: signal.id,
      level: signal.level,
      category: "tsp",
      title: signal.title,
      detail: signal.detail,
      href: "/tsp",
    });
  }

  if (previous) {
    const netWorth = changes.find((change) => change.key === "netWorth");
    if (
      netWorth &&
      netWorth.delta < -5000 &&
      (netWorth.deltaPct ?? 0) < -1
    ) {
      alerts.push({
        id: "change:net-worth-down",
        level:
          netWorth.delta < -20000 && (netWorth.deltaPct ?? 0) < -3
            ? "critical"
            : "watch",
        category: "change",
        title: "Observed net worth decreased",
        detail:
          `${money(Math.abs(netWorth.delta))} lower than the prior daily snapshot. This is an observed balance change, not a diagnosis of the cause.`,
        href: "/",
      });
    }

    const spending = changes.find(
      (change) => change.key === "monthlySpending"
    );
    if (spending && spending.delta > 1000) {
      alerts.push({
        id: "change:spending-jump",
        level: spending.delta > 3000 ? "critical" : "watch",
        category: "change",
        title: "Month-to-date spending increased materially",
        detail:
          `${money(spending.delta)} of additional reconciled spending appears since the prior daily snapshot.`,
        href: "/cash-flow",
      });
    }
  }

  if (newTransactionCount > 0) {
    alerts.push({
      id: "data:new-transactions",
      level: "info",
      category: "data",
      title: `${newTransactionCount} new transaction${newTransactionCount === 1 ? "" : "s"} observed`,
      detail:
        "Autopilot found transactions created after the prior daily run. They remain subject to the Truth Engine and reconciliation rules.",
      href: "/transactions",
    });
  }

  if (!alerts.length) {
    alerts.push({
      id: "autopilot:quiet",
      level: "positive",
      category: "data",
      title: "No material new issues detected",
      detail:
        "Connector freshness, cash-flow anomalies, and plan drift are within current Solpient review thresholds.",
      href: "/autopilot",
    });
  }

  const rank: Record<AutopilotLevel, number> = {
    critical: 4,
    watch: 3,
    positive: 2,
    info: 1,
  };

  return alerts.sort(
    (a, b) => rank[b.level] - rank[a.level]
  );
}

function buildSummary(
  alerts: AutopilotAlert[],
  changes: AutopilotMetricChange[],
  previousRunDate: string | null
) {
  const critical = alerts.filter(
    (alert) => alert.level === "critical"
  ).length;
  const watch = alerts.filter(
    (alert) => alert.level === "watch"
  ).length;

  if (!previousRunDate) {
    return critical || watch
      ? `Autopilot established its first daily baseline and found ${critical} critical and ${watch} watch item(s).`
      : "Autopilot established its first daily baseline. No material issues were detected.";
  }

  const netWorth = changes.find(
    (change) => change.key === "netWorth"
  );

  if (critical || watch) {
    return `Since the ${previousRunDate} snapshot, Autopilot found ${critical} critical and ${watch} watch item(s).${netWorth ? ` Net worth changed by ${money(netWorth.delta)}.` : ""}`;
  }

  return `Since the ${previousRunDate} snapshot, no material new issues were detected.${netWorth ? ` Net worth changed by ${money(netWorth.delta)}.` : ""}`;
}

async function previousRun(
  householdId: string,
  beforeDate: string
) {
  const { supabase } = await requireActiveHousehold();
  const { data, error } = await supabase
    .from("money_autopilot_runs")
    .select("*")
    .eq("household_id", householdId)
    .lt("run_date", beforeDate)
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read previous Autopilot run: ${error.message}`
    );
  }

  return (data ?? null) as AutopilotRunRow | null;
}

async function todayRun(
  householdId: string,
  runDate: string
) {
  const { supabase } = await requireActiveHousehold();
  const { data, error } = await supabase
    .from("money_autopilot_runs")
    .select("*")
    .eq("household_id", householdId)
    .eq("run_date", runDate)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read today's Autopilot run: ${error.message}`
    );
  }

  return (data ?? null) as AutopilotRunRow | null;
}

async function countNewTransactions(
  householdId: string,
  since: string | null
) {
  if (!since) return 0;
  const { supabase } = await requireActiveHousehold();
  const { count, error } = await supabase
    .from("transactions")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("household_id", householdId)
    .gt("created_at", since)
    .is("duplicate_of_transaction_id", null);

  if (error) {
    throw new Error(
      `Unable to count new transactions for Autopilot: ${error.message}`
    );
  }

  return count ?? 0;
}

async function observeCurrentState(now: Date) {
  const [
    context,
    cashFlow,
    plan,
    auth,
    tsp,
  ] = await Promise.all([
    requireMoneyDataset(),
    getCashFlowIntelligence(),
    getPlanMonitoring(now, {
      createBaseline: false,
    }),
    requireActiveHousehold(),
    getTspTracker(now),
  ]);

  const directTickers = context.dataset.holdings
    .filter((holding) => holding.kind === "stock")
    .map((holding) => holding.ticker);
  const research = await loadResearchSnapshots(directTickers);
  const portfolioIntelligence =
    buildPortfolioIntelligence(
      context.dataset,
      research
    );

  const summary = getFinancialSummary(context.dataset);
  const portfolio = getPortfolioMetrics(context.dataset);
  const health = buildFinancialHealthEngine(
    context.dataset,
    cashFlow
  );

  const snapshot: AutopilotMetricSnapshot = {
    observedAt: now.toISOString(),
    netWorth: summary.netWorth,
    assets: summary.assets,
    liabilities: summary.liabilities,
    cash: summary.cash,
    investments: portfolio.total,
    monthlyIncome: cashFlow.health.latestIncome,
    monthlySpending: cashFlow.health.latestSpending,
    monthlySurplus: cashFlow.health.latestSaved,
    trailingSavingsRate: cashFlow.health.trailingSavingsRate,
    healthScore: health.score,
    planAlignment: plan.alignmentScore,
    planMaterialSignals: plan.materialSignalCount,
    transactionCount: cashFlow.transactionCount,
    accountCount: context.dataset.accounts.length,
    holdingCount: context.dataset.holdings.length,
  };

  return {
    auth,
    context,
    cashFlow,
    plan,
    portfolioIntelligence,
    tsp,
    snapshot,
  };
}

async function connectorState() {
  const auth = await requireActiveHousehold();
  const overviews = await getConnectorOverviews({
    supabase: auth.supabase,
    householdId: auth.householdId,
  });
  return {
    auth,
    overviews,
    summaries: overviews.map(connectorSummary),
  };
}

async function syncAutomaticConnectors(
  overviews: ConnectorOverview[],
  householdId: string
) {
  const { supabase } = await requireActiveHousehold();
  const results: ConnectorSyncResult[] = [];

  for (const overview of overviews) {
    if (!overview.manifest.capabilities.automaticSync) continue;

    const syncable = overview.instances.filter(
      (instance) => instance.canSync
    );
    if (!syncable.length) continue;

    try {
      const connectorResults = await runConnectorSync(
        overview.manifest.id,
        { supabase, householdId }
      );
      results.push(...connectorResults);
    } catch (error) {
      results.push({
        connectorId: overview.manifest.id,
        instanceId: "all",
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Automatic connector sync failed.",
        action: "none",
      });
    }
  }

  return results;
}

function rowToBriefing(
  row: AutopilotRunRow,
  skippedBecauseAlreadyRun: boolean
): MoneyAutopilotBriefing | null {
  if (!row.briefing || typeof row.briefing !== "object") {
    return null;
  }
  const stored = row.briefing as MoneyAutopilotBriefing;
  if (
    stored.version !== "1.3" ||
    stored.portfolioIntelligenceVersion !== "1.5" ||
    stored.decisionHistoryVersion !== "1.6" ||
    stored.tspTrackerVersion !== "1.7" ||
    stored.tspPriceSyncVersion !== "1.7.1"
  ) {
    return null;
  }

  return {
    ...stored,
    persisted: true,
    skippedBecauseAlreadyRun,
  };
}

export async function getMoneyAutopilotBriefing(
  now: Date = new Date()
): Promise<MoneyAutopilotBriefing> {
  const { householdId } = await requireActiveHousehold();
  const runDate = dayKey(now);
  const existing = await todayRun(householdId, runDate);
  const stored = existing
    ? rowToBriefing(existing, true)
    : null;

  if (stored) return stored;

  const previous = await previousRun(
    householdId,
    runDate
  );
  const previousSnapshot = previous
    ? safeSnapshot(previous.snapshot)
    : null;

  const [
    observation,
    connectors,
  ] = await Promise.all([
    observeCurrentState(now),
    connectorState(),
  ]);

  const changes = metricChanges(
    observation.snapshot,
    previousSnapshot
  );
  const newTransactionCount =
    await countNewTransactions(
      householdId,
      previous?.completed_at
        ? iso(previous.completed_at)
        : null
    );

  const alerts = buildAlerts({
    connectors: connectors.summaries,
    cashFlowAlerts: observation.cashFlow.alerts,
    planSignals: observation.plan.signals,
    portfolioSignals:
      observation.portfolioIntelligence.signals,
    tspSignals:
      observation.tsp.profile
        ? observation.tsp.signals
        : [],
    changes,
    previous: previousSnapshot,
    newTransactionCount,
  });

  return {
    version: "1.3",
    portfolioIntelligenceVersion: "1.5",
    decisionHistoryVersion: "1.6",
    tspTrackerVersion: "1.7",
    tspPriceSyncVersion: "1.7.1",
    runDate,
    observedAt: now.toISOString(),
    persisted: false,
    skippedBecauseAlreadyRun: false,
    previousRunDate: previous
      ? String(previous.run_date).slice(0, 10)
      : null,
    summary: buildSummary(
      alerts,
      changes,
      previous
        ? String(previous.run_date).slice(0, 10)
        : null
    ),
    snapshot: observation.snapshot,
    changes,
    alerts,
    connectors: connectors.summaries,
    syncResults: [],
    newTransactionCount,
    criticalCount: alerts.filter(
      (alert) => alert.level === "critical"
    ).length,
    watchCount: alerts.filter(
      (alert) => alert.level === "watch"
    ).length,
  };
}

export async function runMoneyAutopilot({
  now = new Date(),
  force = false,
  runKind = "automatic",
}: {
  now?: Date;
  force?: boolean;
  runKind?: "automatic" | "manual";
} = {}): Promise<MoneyAutopilotBriefing> {
  const auth = await requireActiveHousehold();
  const runDate = dayKey(now);
  const existing = await todayRun(
    auth.householdId,
    runDate
  );

  if (existing && !force) {
    const stored = rowToBriefing(existing, true);
    if (stored) {
      await syncActionCenterFromAlerts(
        stored.alerts,
        stored.observedAt
      );
      return stored;
    }
  }

  const previous = await previousRun(
    auth.householdId,
    runDate
  );
  const previousSnapshot = previous
    ? safeSnapshot(previous.snapshot)
    : null;

  const before = await getConnectorOverviews({
    supabase: auth.supabase,
    householdId: auth.householdId,
  });

  const syncResults =
    await syncAutomaticConnectors(
      before,
      auth.householdId
    );

  await syncTspSharePrices(now);

  const [
    observation,
    after,
  ] = await Promise.all([
    observeCurrentState(now),
    getConnectorOverviews({
      supabase: auth.supabase,
      householdId: auth.householdId,
    }),
  ]);

  const connectors = after.map(
    connectorSummary
  );
  const changes = metricChanges(
    observation.snapshot,
    previousSnapshot
  );
  const newTransactionCount =
    await countNewTransactions(
      auth.householdId,
      previous?.completed_at
        ? iso(previous.completed_at)
        : null
    );

  const alerts = buildAlerts({
    connectors,
    cashFlowAlerts:
      observation.cashFlow.alerts,
    planSignals: observation.plan.signals,
    portfolioSignals:
      observation.portfolioIntelligence.signals,
    tspSignals:
      observation.tsp.profile
        ? observation.tsp.signals
        : [],
    changes,
    previous: previousSnapshot,
    newTransactionCount,
  });

  const briefing: MoneyAutopilotBriefing = {
    version: "1.3",
    portfolioIntelligenceVersion: "1.5",
    decisionHistoryVersion: "1.6",
    tspTrackerVersion: "1.7",
    tspPriceSyncVersion: "1.7.1",
    runDate,
    observedAt: now.toISOString(),
    persisted: true,
    skippedBecauseAlreadyRun: false,
    previousRunDate: previous
      ? String(previous.run_date).slice(0, 10)
      : null,
    summary: buildSummary(
      alerts,
      changes,
      previous
        ? String(previous.run_date).slice(0, 10)
        : null
    ),
    snapshot: observation.snapshot,
    changes,
    alerts,
    connectors,
    syncResults,
    newTransactionCount,
    criticalCount: alerts.filter(
      (alert) => alert.level === "critical"
    ).length,
    watchCount: alerts.filter(
      (alert) => alert.level === "watch"
    ).length,
  };

  const payload = {
    household_id: auth.householdId,
    run_date: runDate,
    run_kind: runKind,
    started_at:
      existing?.started_at ??
      now.toISOString(),
    completed_at: new Date().toISOString(),
    snapshot: observation.snapshot,
    connector_report: connectors,
    briefing,
    critical_count: briefing.criticalCount,
    watch_count: briefing.watchCount,
    new_transaction_count:
      newTransactionCount,
    updated_at: new Date().toISOString(),
  };

  const { error } = await auth.supabase
    .from("money_autopilot_runs")
    .upsert(payload, {
      onConflict: "household_id,run_date",
    });

  if (error) {
    throw new Error(
      `Unable to save Money Autopilot daily run: ${error.message}`
    );
  }

  await capturePortfolioHistory(
    observation.portfolioIntelligence,
    observation.context.dataset,
    now
  );

  await syncActionCenterFromAlerts(
    briefing.alerts,
    briefing.observedAt
  );

  return briefing;
}
