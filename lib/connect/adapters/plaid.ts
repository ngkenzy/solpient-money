import {
  aggregateConnectorHealth,
  latestSync,
  type ConnectorHealth,
  type ConnectorInstance,
  type ConnectorOverview,
  type ConnectorSyncResult,
  type SolpientConnectorAdapter,
} from "@/lib/connect/sdk";
import { getPlaidStatus } from "@/lib/plaid/config";
import { PlaidApiError } from "@/lib/plaid/client";
import {
  loadAccessToken,
  syncPlaidConnection,
} from "@/lib/plaid/sync";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function connectionHealth(
  status: string,
  lastSyncedAt: string | null
): ConnectorHealth {
  if (status === "needs_update" || status === "error") {
    return "attention";
  }
  if (status === "disconnected") return "unavailable";
  if (!lastSyncedAt) return "stale";
  const timestamp = new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(timestamp)) return "stale";
  if (Date.now() - timestamp >= STALE_AFTER_MS) return "stale";
  return "healthy";
}

function errorAction(code: string | null) {
  if (
    ["ITEM_LOGIN_REQUIRED", "ITEM_LOCKED", "MFA_NOT_SUPPORTED"].includes(
      code ?? ""
    )
  ) {
    return "repair" as const;
  }
  if (
    ["INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND"].includes(code ?? "")
  ) {
    return "reconnect" as const;
  }
  return "none" as const;
}

function clearErrorMessage(
  code: string | null,
  error: unknown
) {
  const action = errorAction(code);
  if (action === "repair") {
    return "This Sandbox Item needs re-authentication. Use Repair to reopen Plaid Link in update mode.";
  }
  if (action === "reconnect") {
    return "This Sandbox Item token is no longer valid. Disconnect it and create a new test Item.";
  }
  return error instanceof Error ? error.message : "Plaid sync failed.";
}

export const plaidConnector: SolpientConnectorAdapter = {
  manifest: {
    id: "plaid",
    name: "Plaid Sandbox",
    shortName: "Plaid",
    description:
      "Sandbox banking and investment aggregation with encrypted access tokens and automatic refresh.",
    kind: "aggregator",
    maturity: "sandbox",
    href: "/connections",
    capabilities: {
      accounts: true,
      transactions: true,
      holdings: true,
      liabilities: true,
      manualImport: false,
      automaticSync: true,
      reconciliation: false,
      repair: true,
      disconnect: true,
    },
  },

  async overview({ supabase, householdId }): Promise<ConnectorOverview> {
    const status = getPlaidStatus();

    const [{ data: connections, error }, { data: accounts }] =
      await Promise.all([
        supabase
          .from("plaid_connections")
          .select(
            "id,institution_name,connection_mode,status,last_synced_at,last_error_code,last_error_message"
          )
          .eq("household_id", householdId)
          .neq("status", "disconnected")
          .order("created_at", { ascending: false }),
        supabase
          .from("accounts")
          .select("plaid_connection_id")
          .eq("household_id", householdId)
          .eq("source", "plaid"),
      ]);

    if (error) {
      throw new Error(
        `Unable to load Plaid connector: ${error.message}`
      );
    }

    const accountCounts = new Map<string, number>();
    for (const account of accounts ?? []) {
      const id = String(account.plaid_connection_id ?? "");
      if (!id) continue;
      accountCounts.set(id, (accountCounts.get(id) ?? 0) + 1);
    }

    const instances: ConnectorInstance[] = (connections ?? []).map(
      (connection) => {
        const lastSyncedAt = connection.last_synced_at
          ? String(connection.last_synced_at)
          : null;
        const health = status.configured
          ? connectionHealth(
              String(connection.status),
              lastSyncedAt
            )
          : ("setup_required" as const);
        return {
          id: String(connection.id),
          connectorId: "plaid",
          name: String(
            connection.institution_name ?? "Plaid Item"
          ),
          detail: `${connection.connection_mode} · ${accountCounts.get(
            String(connection.id)
          ) ?? 0} account${
            accountCounts.get(String(connection.id)) === 1 ? "" : "s"
          }`,
          health,
          accountCount:
            accountCounts.get(String(connection.id)) ?? 0,
          lastSyncedAt,
          errorCode: connection.last_error_code
            ? String(connection.last_error_code)
            : null,
          errorMessage: connection.last_error_message
            ? String(connection.last_error_message)
            : null,
          canSync: status.configured,
          canRepair:
            status.configured &&
            String(connection.status) === "needs_update",
          canDisconnect: status.configured,
        };
      }
    );

    const fallback: ConnectorHealth = status.configured
      ? "idle"
      : "setup_required";

    return {
      manifest: plaidConnector.manifest,
      health: aggregateConnectorHealth(instances, fallback),
      instanceCount: instances.length,
      accountCount: instances.reduce(
        (sum, instance) => sum + instance.accountCount,
        0
      ),
      staleCount: instances.filter(
        (instance) => instance.health === "stale"
      ).length,
      attentionCount: instances.filter(
        (instance) => instance.health === "attention"
      ).length,
      lastSyncedAt: latestSync(instances),
      instances,
    };
  },

  async sync(
    { supabase, householdId },
    instanceId
  ): Promise<ConnectorSyncResult[]> {
    if (!getPlaidStatus().configured) {
      throw new Error(
        "Plaid Sandbox credentials are not configured."
      );
    }

    let query = supabase
      .from("plaid_connections")
      .select("*")
      .eq("household_id", householdId)
      .neq("status", "disconnected");

    if (instanceId) query = query.eq("id", instanceId);

    const { data: connections, error } = await query;
    if (error) throw new Error(error.message);

    const results: ConnectorSyncResult[] = [];

    for (const connection of connections ?? []) {
      try {
        const token = await loadAccessToken(
          supabase,
          String(connection.id)
        );
        const result = await syncPlaidConnection(
          supabase,
          {
            id: String(connection.id),
            household_id: String(connection.household_id),
            item_id: String(connection.item_id),
            institution_name: String(
              connection.institution_name
            ),
            connection_mode:
              connection.connection_mode as
                | "banking"
                | "investments",
            transaction_cursor:
              connection.transaction_cursor as string | null,
          },
          token
        );

        results.push({
          connectorId: "plaid",
          instanceId: String(connection.id),
          ok: true,
          accountCount: result.accountCount,
          syncedAt: new Date().toISOString(),
          action: "none",
        });
      } catch (syncError) {
        const code =
          syncError instanceof PlaidApiError
            ? syncError.errorCode ?? null
            : null;
        const action = errorAction(code);
        const message = clearErrorMessage(code, syncError);

        await supabase
          .from("plaid_connections")
          .update({
            status: action === "repair" ? "needs_update" : "error",
            last_error_code: code,
            last_error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", connection.id)
          .eq("household_id", householdId);

        results.push({
          connectorId: "plaid",
          instanceId: String(connection.id),
          ok: false,
          errorCode: code,
          error:
            action === "repair"
              ? "Repair required."
              : action === "reconnect"
                ? "Reconnect required."
                : message,
          action,
        });
      }
    }

    return results;
  },
};
