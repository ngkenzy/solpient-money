import { createHash } from "node:crypto";
import type {
  ConnectorHealth,
  ConnectorInstance,
  ConnectorOverview,
  ConnectorSyncResult,
  SolpientConnectorAdapter,
} from "@/lib/connect/sdk";
import { aggregateConnectorHealth, latestSync } from "@/lib/connect/sdk";
import { getDirectOfxStatus } from "@/lib/connect/direct-ofx/config";
import { buildDirectOfxRequest } from "@/lib/connect/direct-ofx/request";
import { postDirectOfx } from "@/lib/connect/direct-ofx/client";
import { assertOfxSuccess } from "@/lib/connect/direct-ofx/status";
import {
  deleteDirectOfxSecret,
  loadDirectOfxSecret,
  storeDirectOfxSecret,
} from "@/lib/connect/direct-ofx/secrets";
import type {
  DirectOfxConnectionRow,
  DirectOfxSecretPayload,
} from "@/lib/connect/direct-ofx/types";
import { parseFinancialFile } from "@/lib/connect/file-parser";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function cents(value: number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function connectionHealth(
  status: string,
  lastSyncedAt: string | null,
  configured: boolean
): ConnectorHealth {
  if (!configured) return "setup_required";
  if (status === "needs_update" || status === "error") return "attention";
  if (status === "disconnected") return "unavailable";
  if (!lastSyncedAt) return "stale";
  const timestamp = new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(timestamp)) return "stale";
  return Date.now() - timestamp >= STALE_AFTER_MS ? "stale" : "healthy";
}

function fallbackFitId(
  connectionId: string,
  postedAt: string,
  amount: number,
  merchant: string
) {
  return createHash("sha256")
    .update(
      [connectionId, postedAt, cents(amount), merchant.trim().toLowerCase()].join("|")
    )
    .digest("hex");
}

function moneyAccountType(
  connection: DirectOfxConnectionRow,
  parsedType: string
) {
  if (connection.message_set === "investment") return "investment";
  if (connection.message_set === "credit_card") return "debt";
  return parsedType === "debt" ? "debt" : "cash";
}

function normalizedBalance(value: number, accountType: string) {
  return accountType === "debt" ? -Math.abs(value) : Math.abs(value);
}

async function syncOne(
  context: Parameters<NonNullable<SolpientConnectorAdapter["sync"]>>[0],
  connection: DirectOfxConnectionRow
): Promise<ConnectorSyncResult> {
  const { supabase, householdId } = context;

  try {
    const secret = await loadDirectOfxSecret(supabase, connection.id);
    const request = buildDirectOfxRequest({ connection, secret });
    const response = await postDirectOfx(connection.endpoint_url, request);
    assertOfxSuccess(response);

    const parsed = parseFinancialFile("direct-response.ofx", response);
    const accountType = moneyAccountType(connection, parsed.accountType);
    const rawBalance =
      parsed.closingBalance ??
      parsed.holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
    const balance = normalizedBalance(rawBalance, accountType);
    const now = new Date().toISOString();

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .upsert(
        {
          household_id: householdId,
          name:
            connection.message_set === "investment"
              ? `${connection.institution_name} Investments`
              : connection.message_set === "credit_card"
                ? `${connection.institution_name} Credit`
                : `${connection.institution_name} Bank`,
          institution: connection.institution_name,
          account_type: accountType,
          balance_cents: cents(balance),
          change_ytd_pct: 0,
          owner_scope: "Household",
          last_four: connection.account_mask ?? null,
          is_active: true,
          sort_order: 520,
          source: "ofx_direct",
          direct_ofx_connection_id: connection.id,
          updated_at: now,
        },
        { onConflict: "direct_ofx_connection_id" }
      )
      .select("id")
      .single();

    if (accountError || !account) {
      throw new Error(
        `Direct OFX account sync failed: ${accountError?.message ?? "unknown error"}`
      );
    }

    const accountId = String(account.id);
    let transactionCount = 0;
    let holdingCount = 0;

    if (parsed.kind === "transactions") {
      const rows = parsed.transactions.map((transaction) => ({
        household_id: householdId,
        account_id: accountId,
        posted_at: transaction.postedAt,
        merchant: transaction.merchant.slice(0, 240),
        category: (transaction.category || "Uncategorized").slice(0, 160),
        amount_cents: cents(transaction.amount),
        transaction_type: transaction.type,
        note: "Synced via Direct OFX",
        source: "ofx_direct",
        direct_ofx_connection_id: connection.id,
        ofx_fitid:
          transaction.externalId ??
          fallbackFitId(
            connection.id,
            transaction.postedAt,
            transaction.amount,
            transaction.merchant
          ),
        updated_at: now,
      }));

      if (rows.length) {
        const { error } = await supabase.from("transactions").upsert(rows, {
          onConflict: "direct_ofx_connection_id,ofx_fitid",
        });
        if (error) {
          throw new Error(
            `Direct OFX transaction sync failed: ${error.message}`
          );
        }
        transactionCount = rows.length;
      }
    } else {
      const { error: deleteError } = await supabase
        .from("holdings")
        .delete()
        .eq("household_id", householdId)
        .eq("direct_ofx_connection_id", connection.id)
        .eq("source", "ofx_direct");

      if (deleteError) {
        throw new Error(
          `Unable to replace Direct OFX holdings: ${deleteError.message}`
        );
      }

      const rows = parsed.holdings.map((holding) => ({
        household_id: householdId,
        account_id: accountId,
        ticker: holding.ticker.toUpperCase(),
        name: holding.name,
        holding_kind: holding.kind,
        shares: holding.shares,
        price: holding.price,
        cost_basis_cents: cents(holding.costBasis),
        market_value_cents: cents(holding.marketValue),
        day_change_pct: 0,
        ytd_return_pct: 0,
        sector: holding.sector || "Investments",
        source: "ofx_direct",
        direct_ofx_connection_id: connection.id,
        ofx_security_id: holding.externalId ?? null,
        updated_at: now,
      }));

      if (rows.length) {
        const { error } = await supabase.from("holdings").insert(rows);
        if (error) {
          throw new Error(
            `Direct OFX holding sync failed: ${error.message}`
          );
        }
        holdingCount = rows.length;
      }
    }

    const { error: connectionError } = await supabase
      .from("direct_ofx_connections")
      .update({
        status: "active",
        last_synced_at: now,
        last_error_code: null,
        last_error_message: null,
        updated_at: now,
      })
      .eq("id", connection.id)
      .eq("household_id", householdId);

    if (connectionError) {
      throw new Error(
        `Unable to mark Direct OFX sync complete: ${connectionError.message}`
      );
    }

    if (secret.authToken) {
      const cleaned: DirectOfxSecretPayload = {
        ...secret,
        authToken: undefined,
      };
      await storeDirectOfxSecret(supabase, connection.id, cleaned);
    }

    return {
      connectorId: "ofx-direct",
      instanceId: connection.id,
      ok: true,
      accountCount: 1,
      transactionCount,
      holdingCount,
      liabilityCount: 0,
      syncedAt: now,
      action: "none",
    };
  } catch (error) {
    const ofxCode =
      error && typeof error === "object" && "ofxCode" in error
        ? String((error as { ofxCode?: unknown }).ofxCode ?? "")
        : null;
    const needsUpdate = ofxCode === "15512";
    const message =
      error instanceof Error ? error.message : "Direct OFX sync failed.";

    await context.supabase
      .from("direct_ofx_connections")
      .update({
        status: needsUpdate ? "needs_update" : "error",
        last_error_code: ofxCode,
        last_error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("household_id", context.householdId);

    return {
      connectorId: "ofx-direct",
      instanceId: connection.id,
      ok: false,
      errorCode: ofxCode,
      error: message,
      action: needsUpdate ? "repair" : "none",
    };
  }
}

export const directOfxConnector: SolpientConnectorAdapter = {
  manifest: {
    id: "ofx-direct",
    name: "Direct OFX",
    shortName: "OFX",
    description:
      "Direct HTTPS OFX sync for institutions that provide connection details and an institution-issued Direct Connect credential.",
    kind: "direct-legacy",
    maturity: "live",
    href: "/connect/ofx",
    capabilities: {
      accounts: true,
      transactions: true,
      holdings: true,
      liabilities: false,
      manualImport: false,
      automaticSync: true,
      reconciliation: true,
      repair: true,
      disconnect: true,
    },
  },

  async overview({ supabase, householdId }): Promise<ConnectorOverview> {
    const configured = getDirectOfxStatus().configured;
    const [{ data: connections, error }, { data: accounts }] =
      await Promise.all([
        supabase
          .from("direct_ofx_connections")
          .select(
            "id,institution_name,message_set,status,last_synced_at,last_error_code,last_error_message,account_mask"
          )
          .eq("household_id", householdId)
          .neq("status", "disconnected")
          .order("created_at", { ascending: false }),
        supabase
          .from("accounts")
          .select("direct_ofx_connection_id")
          .eq("household_id", householdId)
          .eq("source", "ofx_direct"),
      ]);

    if (error) {
      throw new Error(
        `Unable to load Direct OFX connections: ${error.message}`
      );
    }

    const accountCounts = new Map<string, number>();
    for (const account of accounts ?? []) {
      const id = String(account.direct_ofx_connection_id ?? "");
      if (!id) continue;
      accountCounts.set(id, (accountCounts.get(id) ?? 0) + 1);
    }

    const instances: ConnectorInstance[] = (connections ?? []).map(
      (connection) => {
        const lastSyncedAt = connection.last_synced_at
          ? String(connection.last_synced_at)
          : null;
        const health = connectionHealth(
          String(connection.status),
          lastSyncedAt,
          configured
        );
        return {
          id: String(connection.id),
          connectorId: "ofx-direct",
          name: String(connection.institution_name),
          detail: `${String(connection.message_set).replace("_", " ")}${
            connection.account_mask ? ` · •••• ${connection.account_mask}` : ""
          }`,
          health,
          accountCount: accountCounts.get(String(connection.id)) ?? 0,
          lastSyncedAt,
          errorCode: connection.last_error_code
            ? String(connection.last_error_code)
            : null,
          errorMessage: connection.last_error_message
            ? String(connection.last_error_message)
            : null,
          canSync: configured,
          canRepair:
            configured && String(connection.status) === "needs_update",
          canDisconnect: configured,
        };
      }
    );

    return {
      manifest: directOfxConnector.manifest,
      health: aggregateConnectorHealth(
        instances,
        configured ? "idle" : "setup_required"
      ),
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

  async sync(context, instanceId) {
    if (!getDirectOfxStatus().configured) {
      throw new Error(
        "Direct OFX is not configured. Set CONNECT_SECRET_ENCRYPTION_KEY."
      );
    }

    let query = context.supabase
      .from("direct_ofx_connections")
      .select("*")
      .eq("household_id", context.householdId)
      .neq("status", "disconnected");

    if (instanceId) query = query.eq("id", instanceId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const results: ConnectorSyncResult[] = [];
    for (const row of data ?? []) {
      results.push(
        await syncOne(context, row as DirectOfxConnectionRow)
      );
    }
    return results;
  },

  async disconnect({ supabase, householdId }, instanceId) {
    const { data: connection, error } = await supabase
      .from("direct_ofx_connections")
      .select("id")
      .eq("id", instanceId)
      .eq("household_id", householdId)
      .single();

    if (error || !connection) {
      return {
        connectorId: "ofx-direct",
        instanceId,
        ok: false,
        error: "Direct OFX connection not found.",
      };
    }

    for (const table of ["transactions", "holdings", "accounts"] as const) {
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq("household_id", householdId)
        .eq("direct_ofx_connection_id", instanceId);
      if (deleteError) {
        return {
          connectorId: "ofx-direct",
          instanceId,
          ok: false,
          error: `Unable to remove Direct OFX ${table}: ${deleteError.message}`,
        };
      }
    }

    await deleteDirectOfxSecret(supabase, instanceId);

    const { error: connectionDeleteError } = await supabase
      .from("direct_ofx_connections")
      .delete()
      .eq("id", instanceId)
      .eq("household_id", householdId);

    if (connectionDeleteError) {
      return {
        connectorId: "ofx-direct",
        instanceId,
        ok: false,
        error: connectionDeleteError.message,
      };
    }

    return {
      connectorId: "ofx-direct",
      instanceId,
      ok: true,
    };
  },
};
