import type { SolpientDbClient } from "@/lib/local-db/client";

export type ConnectorId =
  | "files"
  | "ofx-direct";

export type ConnectorKind =
  | "native"
  | "aggregator"
  | "direct-api"
  | "direct-legacy";

export type ConnectorMaturity = "live" | "sandbox" | "future";

export type ConnectorHealth =
  | "healthy"
  | "attention"
  | "stale"
  | "setup_required"
  | "idle"
  | "unavailable";

export type ConnectorProvenance = {
  connectorId: ConnectorId;
  instanceId: string;
  externalId?: string | null;
  observedAt: string;
};

export type NormalizedConnectorAccount = {
  externalId: string;
  name: string;
  institution: string;
  accountType: "cash" | "investment" | "retirement" | "debt";
  balance: number;
  availableBalance?: number | null;
  lastFour?: string | null;
  provenance: ConnectorProvenance;
};

export type NormalizedConnectorTransaction = {
  externalId: string;
  accountExternalId: string;
  postedAt: string;
  merchant: string;
  category: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  provenance: ConnectorProvenance;
};

export type NormalizedConnectorHolding = {
  externalId: string;
  accountExternalId: string;
  ticker: string;
  name: string;
  kind: "stock" | "etf" | "bond" | "cash";
  shares: number;
  price: number;
  marketValue: number;
  costBasis?: number | null;
  provenance: ConnectorProvenance;
};

export type NormalizedConnectorLiability = {
  externalId: string;
  accountExternalId: string;
  aprPct?: number | null;
  minimumPayment?: number | null;
  provenance: ConnectorProvenance;
};

export type ConnectorCapabilities = {
  accounts: boolean;
  transactions: boolean;
  holdings: boolean;
  liabilities: boolean;
  manualImport: boolean;
  automaticSync: boolean;
  reconciliation: boolean;
  repair: boolean;
  disconnect: boolean;
};

export type ConnectorManifest = {
  id: ConnectorId;
  name: string;
  shortName: string;
  description: string;
  kind: ConnectorKind;
  maturity: ConnectorMaturity;
  href: string;
  capabilities: ConnectorCapabilities;
};

export type ConnectorInstance = {
  id: string;
  connectorId: ConnectorId;
  name: string;
  detail: string;
  health: ConnectorHealth;
  accountCount: number;
  lastSyncedAt: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  canSync: boolean;
  canRepair: boolean;
  canDisconnect: boolean;
};

export type ConnectorOverview = {
  manifest: ConnectorManifest;
  health: ConnectorHealth;
  instanceCount: number;
  accountCount: number;
  staleCount: number;
  attentionCount: number;
  lastSyncedAt: string | null;
  instances: ConnectorInstance[];
};

export type ConnectorSyncResult = {
  connectorId: ConnectorId;
  instanceId: string;
  ok: boolean;
  accountCount?: number;
  transactionCount?: number;
  holdingCount?: number;
  liabilityCount?: number;
  syncedAt?: string;
  errorCode?: string | null;
  error?: string;
  action?: "none" | "repair" | "reconnect";
};

export type ConnectorDisconnectResult = {
  connectorId: ConnectorId;
  instanceId: string;
  ok: boolean;
  error?: string;
};

export type ConnectorRuntimeContext = {
  supabase: SolpientDbClient;
  householdId: string;
};

export interface SolpientConnectorAdapter {
  manifest: ConnectorManifest;
  overview(context: ConnectorRuntimeContext): Promise<ConnectorOverview>;
  sync?(
    context: ConnectorRuntimeContext,
    instanceId?: string
  ): Promise<ConnectorSyncResult[]>;
  disconnect?(
    context: ConnectorRuntimeContext,
    instanceId: string
  ): Promise<ConnectorDisconnectResult>;
}

export function connectorHealthRank(health: ConnectorHealth) {
  const rank: Record<ConnectorHealth, number> = {
    attention: 6,
    setup_required: 5,
    stale: 4,
    healthy: 3,
    idle: 2,
    unavailable: 1,
  };
  return rank[health];
}

export function aggregateConnectorHealth(
  instances: ConnectorInstance[],
  fallback: ConnectorHealth
): ConnectorHealth {
  if (!instances.length) return fallback;
  return [...instances]
    .sort(
      (a, b) =>
        connectorHealthRank(b.health) -
        connectorHealthRank(a.health)
    )[0].health;
}

export function latestSync(
  instances: ConnectorInstance[]
): string | null {
  const timestamps = instances
    .map((instance) => instance.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a));
  return timestamps[0] ?? null;
}
