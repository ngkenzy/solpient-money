import type {
  ConnectorInstance,
  ConnectorOverview,
  SolpientConnectorAdapter,
} from "@/lib/connect/sdk";
import {
  aggregateConnectorHealth,
  latestSync,
} from "@/lib/connect/sdk";

const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

function fileHealth(lastSyncedAt: string | null) {
  if (!lastSyncedAt) return "stale" as const;
  const timestamp = new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(timestamp)) return "stale" as const;
  return Date.now() - timestamp >= STALE_AFTER_MS
    ? ("stale" as const)
    : ("healthy" as const);
}

export const fileConnector: SolpientConnectorAdapter = {
  manifest: {
    id: "files",
    name: "Native File Import",
    shortName: "Files",
    description:
      "CSV, QFX, and OFX imports with format memory, reconciliation, duplicate protection, and rollback.",
    kind: "native",
    maturity: "live",
    href: "/connect#file-import",
    capabilities: {
      accounts: true,
      transactions: true,
      holdings: true,
      liabilities: false,
      manualImport: true,
      automaticSync: false,
      reconciliation: true,
      repair: false,
      disconnect: false,
    },
  },

  async overview({ supabase, householdId }): Promise<ConnectorOverview> {
    const { data, error } = await supabase
      .from("accounts")
      .select(
        "id,name,institution,account_type,last_four,last_file_import_at,source"
      )
      .eq("household_id", householdId)
      .eq("is_active", true)
      .or("source.eq.file,last_file_import_at.not.is.null")
      .order("last_file_import_at", {
        ascending: false,
        nullsFirst: false,
      });

    if (error) {
      throw new Error(
        `Unable to load file connector accounts: ${error.message}`
      );
    }

    const instances: ConnectorInstance[] = (data ?? []).map(
      (account) => {
        const lastSyncedAt = account.last_file_import_at
          ? String(account.last_file_import_at)
          : null;
        const health = fileHealth(lastSyncedAt);
        return {
          id: String(account.id),
          connectorId: "files",
          name: String(account.name),
          detail: `${account.institution ?? "File import"} · ${account.account_type}${
            account.last_four ? ` · •••• ${account.last_four}` : ""
          }`,
          health,
          accountCount: 1,
          lastSyncedAt,
          canSync: false,
          canRepair: false,
          canDisconnect: false,
        };
      }
    );

    return {
      manifest: fileConnector.manifest,
      health: aggregateConnectorHealth(instances, "idle"),
      instanceCount: instances.length,
      accountCount: instances.length,
      staleCount: instances.filter(
        (instance) => instance.health === "stale"
      ).length,
      attentionCount: 0,
      lastSyncedAt: latestSync(instances),
      instances,
    };
  },
};
