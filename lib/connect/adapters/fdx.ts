import type {
  ConnectorHealth,
  ConnectorInstance,
  ConnectorOverview,
  ConnectorSyncResult,
  SolpientConnectorAdapter,
} from "@/lib/connect/sdk";
import {
  aggregateConnectorHealth,
  latestSync,
} from "@/lib/connect/sdk";
import {
  assertProviderCanAuthorize,
  getFdxProvider,
  getFdxProviders,
} from "@/lib/connect/fdx/providers";
import {
  deleteOAuthFdxTokens,
  loadOAuthFdxTokens,
  storeOAuthFdxTokens,
  type OAuthFdxTokenSet,
} from "@/lib/connect/fdx/tokens";
import { refreshOAuthTokens } from "@/lib/connect/fdx/oauth-client";
import { fdxGetJson } from "@/lib/connect/fdx/api-client";
import {
  extractFdxAccounts,
  extractFdxHoldings,
  extractFdxTransactions,
} from "@/lib/connect/fdx/normalizer";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

type ConnectionRow = {
  id: string;
  household_id: string;
  provider_id: string;
  institution_name: string;
  security_profile:
    | "oauth_pkce_sandbox"
    | "fdx_fapi";
  status:
    | "active"
    | "needs_update"
    | "error"
    | "disconnected";
  granted_scopes: string[];
  consent_expires_at?: string | null;
  last_synced_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
};

function cents(value: number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function healthFor(
  connection: ConnectionRow
): ConnectorHealth {
  if (
    connection.status === "needs_update" ||
    connection.status === "error"
  ) {
    return "attention";
  }
  if (connection.status === "disconnected") {
    return "unavailable";
  }
  if (!connection.last_synced_at) {
    return "stale";
  }
  const timestamp = new Date(
    connection.last_synced_at
  ).getTime();
  if (
    !Number.isFinite(timestamp) ||
    Date.now() - timestamp >= STALE_AFTER_MS
  ) {
    return "stale";
  }
  return "healthy";
}

function rawAccounts(payload: Record<string, unknown>) {
  const value =
    Array.isArray(payload.accounts)
      ? payload.accounts
      : Array.isArray(payload.items)
        ? payload.items
        : [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) &&
      typeof item === "object" &&
      !Array.isArray(item)
  );
}

function tokenNearExpiry(tokens: OAuthFdxTokenSet) {
  if (!tokens.expiresAt) return false;
  const expiry = new Date(tokens.expiresAt).getTime();
  return (
    Number.isFinite(expiry) &&
    expiry - Date.now() < 60_000
  );
}

async function usableToken(
  context: Parameters<
    NonNullable<SolpientConnectorAdapter["sync"]>
  >[0],
  connection: ConnectionRow
) {
  const provider = getFdxProvider(
    connection.provider_id
  );
  if (!provider) {
    throw new Error(
      `FDX provider ${connection.provider_id} is no longer registered.`
    );
  }

  assertProviderCanAuthorize(provider);

  let tokens = await loadOAuthFdxTokens(
    context.supabase,
    connection.id
  );

  if (
    tokenNearExpiry(tokens) &&
    tokens.refreshToken
  ) {
    tokens = await refreshOAuthTokens({
      provider,
      refreshToken: tokens.refreshToken,
    });
    await storeOAuthFdxTokens(
      context.supabase,
      connection.id,
      tokens
    );
  }

  return { provider, tokens };
}

async function syncOne(
  context: Parameters<
    NonNullable<SolpientConnectorAdapter["sync"]>
  >[0],
  connection: ConnectionRow
): Promise<ConnectorSyncResult> {
  const { supabase, householdId } = context;

  try {
    const { provider, tokens } =
      await usableToken(context, connection);

    const accountsPayload = await fdxGetJson({
      provider,
      accessToken: tokens.accessToken,
      path: "/accounts",
    });
    const raw = rawAccounts(accountsPayload);
    const normalized = extractFdxAccounts(
      accountsPayload,
      "fdx",
      connection.id
    );
    const now = new Date().toISOString();

    let transactionCount = 0;
    let holdingCount = 0;

    for (const account of normalized) {
      const { data: saved, error: accountError } =
        await supabase
          .from("accounts")
          .upsert(
            {
              household_id: householdId,
              name: account.name,
              institution:
                connection.institution_name,
              account_type: account.accountType,
              balance_cents: cents(
                account.balance
              ),
              available_balance_cents:
                account.availableBalance == null
                  ? null
                  : cents(
                      account.availableBalance
                    ),
              change_ytd_pct: 0,
              owner_scope: "Household",
              last_four:
                account.lastFour?.slice(-8) ??
                null,
              is_active: true,
              sort_order: 540,
              source: "fdx",
              oauth_fdx_connection_id:
                connection.id,
              fdx_account_id:
                account.externalId,
              updated_at: now,
            },
            {
              onConflict:
                "oauth_fdx_connection_id,fdx_account_id",
            }
          )
          .select("id")
          .single();

      if (accountError || !saved) {
        throw new Error(
          `FDX account sync failed: ${accountError?.message ?? "unknown error"}`
        );
      }

      const moneyAccountId = String(saved.id);
      const transactionsPayload =
        await fdxGetJson({
          provider,
          accessToken: tokens.accessToken,
          path:
            `/accounts/${encodeURIComponent(
              account.externalId
            )}/transactions`,
        });
      const transactions =
        extractFdxTransactions(
          transactionsPayload,
          account.externalId,
          connection.id
        );

      if (transactions.length) {
        const rows = transactions.map(
          (transaction) => ({
            household_id: householdId,
            account_id: moneyAccountId,
            posted_at:
              transaction.postedAt,
            merchant:
              transaction.merchant.slice(
                0,
                240
              ),
            category:
              transaction.category.slice(
                0,
                160
              ),
            amount_cents: cents(
              transaction.amount
            ),
            transaction_type:
              transaction.type,
            note: "Synced via OAuth/FDX",
            source: "fdx",
            oauth_fdx_connection_id:
              connection.id,
            fdx_transaction_id:
              transaction.externalId,
            updated_at: now,
          })
        );

        const { error: txError } =
          await supabase
            .from("transactions")
            .upsert(rows, {
              onConflict:
                "oauth_fdx_connection_id,fdx_transaction_id",
            });
        if (txError) {
          throw new Error(
            `FDX transaction sync failed: ${txError.message}`
          );
        }
        transactionCount += rows.length;
      }

      const rawAccount = raw.find(
        (item) =>
          String(
            item.accountId ??
              item.account_id ??
              item.id ??
              ""
          ) === account.externalId
      );
      const holdings = rawAccount
        ? extractFdxHoldings(
            rawAccount,
            account.externalId,
            connection.id
          )
        : [];

      const { error: holdingDeleteError } =
        await supabase
          .from("holdings")
          .delete()
          .eq("household_id", householdId)
          .eq(
            "oauth_fdx_connection_id",
            connection.id
          )
          .eq(
            "fdx_account_id",
            account.externalId
          )
          .eq("source", "fdx");

      if (holdingDeleteError) {
        throw new Error(
          `Unable to replace FDX holdings: ${holdingDeleteError.message}`
        );
      }

      if (holdings.length) {
        const rows = holdings.map(
          (holding) => ({
            household_id: householdId,
            account_id: moneyAccountId,
            ticker:
              holding.ticker.toUpperCase(),
            name: holding.name,
            holding_kind: holding.kind,
            shares: holding.shares,
            price: holding.price,
            cost_basis_cents:
              holding.costBasis == null
                ? 0
                : cents(
                    holding.costBasis
                  ),
            market_value_cents: cents(
              holding.marketValue
            ),
            day_change_pct: 0,
            ytd_return_pct: 0,
            sector: "FDX investment",
            source: "fdx",
            oauth_fdx_connection_id:
              connection.id,
            fdx_account_id:
              account.externalId,
            fdx_security_id:
              holding.externalId,
            updated_at: now,
          })
        );

        const { error: holdingError } =
          await supabase
            .from("holdings")
            .insert(rows);
        if (holdingError) {
          throw new Error(
            `FDX holding sync failed: ${holdingError.message}`
          );
        }
        holdingCount += rows.length;
      }
    }

    const { error: connectionError } =
      await supabase
        .from("oauth_fdx_connections")
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
        `Unable to finalize FDX sync: ${connectionError.message}`
      );
    }

    return {
      connectorId: "fdx",
      instanceId: connection.id,
      ok: true,
      accountCount: normalized.length,
      transactionCount,
      holdingCount,
      liabilityCount: normalized.filter(
        (account) =>
          account.accountType === "debt"
      ).length,
      syncedAt: now,
      action: "none",
    };
  } catch (error) {
    const status =
      error &&
      typeof error === "object" &&
      "status" in error
        ? Number(
            (error as { status?: unknown })
              .status
          )
        : null;
    const needsUpdate =
      status === 401 || status === 403;
    const message =
      error instanceof Error
        ? error.message
        : "OAuth/FDX sync failed.";

    await supabase
      .from("oauth_fdx_connections")
      .update({
        status: needsUpdate
          ? "needs_update"
          : "error",
        last_error_code:
          status == null
            ? null
            : String(status),
        last_error_message: message,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("household_id", householdId);

    return {
      connectorId: "fdx",
      instanceId: connection.id,
      ok: false,
      errorCode:
        status == null
          ? null
          : String(status),
      error: message,
      action: needsUpdate
        ? "reconnect"
        : "none",
    };
  }
}

export const fdxConnector: SolpientConnectorAdapter = {
  manifest: {
    id: "fdx",
    name: "OAuth / FDX",
    shortName: "FDX",
    description:
      "OAuth consent and FDX-aligned REST ingestion. V1.4 supports PKCE sandboxes now and explicitly gates production FDX/FAPI onboarding.",
    kind: "direct-api",
    maturity: "sandbox",
    href: "/connect/fdx",
    capabilities: {
      accounts: true,
      transactions: true,
      holdings: true,
      liabilities: true,
      manualImport: false,
      automaticSync: true,
      reconciliation: true,
      repair: true,
      disconnect: true,
    },
  },

  async overview({
    supabase,
    householdId,
  }): Promise<ConnectorOverview> {
    const [{ data: connections, error }, { data: accounts }] =
      await Promise.all([
        supabase
          .from("oauth_fdx_connections")
          .select(
            "id,household_id,provider_id,institution_name,security_profile,status,granted_scopes,consent_expires_at,last_synced_at,last_error_code,last_error_message"
          )
          .eq("household_id", householdId)
          .neq("status", "disconnected")
          .order("created_at", {
            ascending: false,
          }),
        supabase
          .from("accounts")
          .select(
            "oauth_fdx_connection_id"
          )
          .eq("household_id", householdId)
          .eq("source", "fdx"),
      ]);

    if (error) {
      throw new Error(
        `Unable to load OAuth/FDX connections: ${error.message}`
      );
    }

    const counts = new Map<string, number>();
    for (const account of accounts ?? []) {
      const id = String(
        account.oauth_fdx_connection_id ??
          ""
      );
      if (!id) continue;
      counts.set(
        id,
        (counts.get(id) ?? 0) + 1
      );
    }

    const instances: ConnectorInstance[] = (
      connections ?? []
    ).map((row) => {
      const connection =
        row as ConnectionRow;
      const provider = getFdxProvider(
        connection.provider_id
      );
      return {
        id: connection.id,
        connectorId: "fdx",
        name: connection.institution_name,
        detail:
          `${provider?.securityProfile === "fdx_fapi" ? "FDX/FAPI" : "OAuth PKCE sandbox"} · ${counts.get(connection.id) ?? 0} account${counts.get(connection.id) === 1 ? "" : "s"}`,
        health: healthFor(connection),
        accountCount:
          counts.get(connection.id) ?? 0,
        lastSyncedAt:
          connection.last_synced_at ??
          null,
        errorCode:
          connection.last_error_code ??
          null,
        errorMessage:
          connection.last_error_message ??
          null,
        canSync:
          provider?.status ===
          "sandbox_ready",
        canRepair: true,
        canDisconnect: true,
      };
    });

    const sandboxAvailable =
      getFdxProviders().some(
        (provider) =>
          provider.status ===
          "sandbox_ready"
      );

    return {
      manifest: fdxConnector.manifest,
      health: aggregateConnectorHealth(
        instances,
        sandboxAvailable
          ? "idle"
          : "setup_required"
      ),
      instanceCount: instances.length,
      accountCount: instances.reduce(
        (sum, instance) =>
          sum + instance.accountCount,
        0
      ),
      staleCount: instances.filter(
        (instance) =>
          instance.health === "stale"
      ).length,
      attentionCount: instances.filter(
        (instance) =>
          instance.health ===
          "attention"
      ).length,
      lastSyncedAt:
        latestSync(instances),
      instances,
    };
  },

  async sync(context, instanceId) {
    let query = context.supabase
      .from("oauth_fdx_connections")
      .select("*")
      .eq(
        "household_id",
        context.householdId
      )
      .neq("status", "disconnected");

    if (instanceId) {
      query = query.eq("id", instanceId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const results: ConnectorSyncResult[] =
      [];
    for (const row of data ?? []) {
      results.push(
        await syncOne(
          context,
          row as ConnectionRow
        )
      );
    }
    return results;
  },

  async disconnect(
    { supabase, householdId },
    instanceId
  ) {
    const { data: connection, error } =
      await supabase
        .from("oauth_fdx_connections")
        .select("id")
        .eq("id", instanceId)
        .eq("household_id", householdId)
        .single();

    if (error || !connection) {
      return {
        connectorId: "fdx",
        instanceId,
        ok: false,
        error:
          "OAuth/FDX connection not found.",
      };
    }

    for (const table of [
      "transactions",
      "holdings",
      "accounts",
    ] as const) {
      const { error: deleteError } =
        await supabase
          .from(table)
          .delete()
          .eq(
            "household_id",
            householdId
          )
          .eq(
            "oauth_fdx_connection_id",
            instanceId
          );
      if (deleteError) {
        return {
          connectorId: "fdx",
          instanceId,
          ok: false,
          error:
            `Unable to remove FDX ${table}: ${deleteError.message}`,
        };
      }
    }

    await deleteOAuthFdxTokens(
      supabase,
      instanceId
    );

    const { error: connectionDeleteError } =
      await supabase
        .from("oauth_fdx_connections")
        .delete()
        .eq("id", instanceId)
        .eq("household_id", householdId);

    if (connectionDeleteError) {
      return {
        connectorId: "fdx",
        instanceId,
        ok: false,
        error:
          connectionDeleteError.message,
      };
    }

    return {
      connectorId: "fdx",
      instanceId,
      ok: true,
    };
  },
};
