import type { SolpientDbClient } from "@/lib/local-db/client";
import { decryptSecret, encryptSecret } from "@/lib/plaid/crypto";
import { PlaidApiError, plaidPost } from "@/lib/plaid/client";

type PlaidAccount = {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
  balances: {
    available?: number | null;
    current?: number | null;
  };
};

type PlaidConnection = {
  id: string;
  household_id: string;
  item_id: string;
  institution_name: string;
  connection_mode: "banking" | "investments";
  transaction_cursor?: string | null;
};

type TokenRow = {
  token_ciphertext: string;
  token_iv: string;
  token_tag: string;
};

type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name?: string | null;
  pending?: boolean;
  personal_finance_category?: {
    primary?: string | null;
    detailed?: string | null;
  } | null;
};

type PlaidSecurity = {
  security_id: string;
  ticker_symbol?: string | null;
  name?: string | null;
  type?: string | null;
};

type PlaidHolding = {
  account_id: string;
  security_id: string;
  quantity: number;
  institution_price: number;
  institution_value: number;
  cost_basis?: number | null;
};

const cents = (value: number | null | undefined) =>
  Math.round(Number(value ?? 0) * 100);

function moneyAccountType(type: string) {
  if (type === "investment") return "investment";
  if (type === "credit" || type === "loan") return "debt";
  return "cash";
}

function holdingKind(type?: string | null): "stock" | "etf" | "bond" | "cash" {
  const normalized = (type ?? "").toLowerCase();
  if (normalized === "cash") return "cash";
  if (normalized.includes("fixed") || normalized.includes("bond")) return "bond";
  if (normalized === "equity") return "stock";
  return "etf";
}

function transactionType(transaction: PlaidTransaction) {
  const primary = transaction.personal_finance_category?.primary ?? "";
  if (primary.startsWith("TRANSFER_")) return "transfer";
  return transaction.amount < 0 ? "income" : "expense";
}

function signedTransactionAmount(transaction: PlaidTransaction) {
  // Plaid: positive usually means money leaving an account.
  // Money: positive means inflow, negative means outflow.
  return -transaction.amount;
}

export async function storeAccessToken(
  supabase: SolpientDbClient,
  connectionId: string,
  accessToken: string
) {
  const encrypted = encryptSecret(accessToken);
  const { error } = await supabase.rpc("store_plaid_access_token", {
    p_connection_id: connectionId,
    p_token_ciphertext: encrypted.ciphertext,
    p_token_iv: encrypted.iv,
    p_token_tag: encrypted.tag,
  });
  if (error) throw new Error(`Unable to store Plaid access token: ${error.message}`);
}

export async function loadAccessToken(
  supabase: SolpientDbClient,
  connectionId: string
) {
  const { data, error } = await supabase.rpc("get_plaid_access_token", {
    p_connection_id: connectionId,
  });
  if (error) throw new Error(`Unable to read Plaid access token: ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as TokenRow | undefined;
  if (!row) throw new Error("Plaid access token not found.");

  return decryptSecret({
    ciphertext: row.token_ciphertext,
    iv: row.token_iv,
    tag: row.token_tag,
  });
}

export async function syncPlaidAccounts(
  supabase: SolpientDbClient,
  connection: PlaidConnection,
  accessToken: string
) {
  const response = await plaidPost<{ accounts: PlaidAccount[] }>("/accounts/get", {
    access_token: accessToken,
  });

  const rows = response.accounts.map((account, index) => {
    const type = moneyAccountType(account.type);
    const rawBalance = Number(account.balances.current ?? 0);
    const balance = type === "debt" ? -Math.abs(rawBalance) : Math.abs(rawBalance);

    return {
      household_id: connection.household_id,
      name: account.name,
      institution: connection.institution_name,
      account_type: type,
      balance_cents: cents(balance),
      change_ytd_pct: 0,
      owner_scope: "Household",
      last_four: account.mask ?? null,
      is_active: true,
      sort_order: 500 + index,
      source: "plaid",
      plaid_connection_id: connection.id,
      plaid_account_id: account.account_id,
      plaid_type: account.type,
      plaid_subtype: account.subtype ?? null,
      available_balance_cents:
        account.balances.available == null
          ? null
          : cents(account.balances.available),
      updated_at: new Date().toISOString(),
    };
  });

  const { data, error } = await supabase
    .from("accounts")
    .upsert(rows, { onConflict: "plaid_connection_id,plaid_account_id" })
    .select("id,plaid_account_id");

  if (error) throw new Error(`Plaid account sync failed: ${error.message}`);

  return new Map(
    (data ?? []).map((row) => [String(row.plaid_account_id), String(row.id)])
  );
}

export async function syncPlaidTransactions(
  supabase: SolpientDbClient,
  connection: PlaidConnection,
  accessToken: string,
  accountMap: Map<string, string>
) {
  let cursor = connection.transaction_cursor ?? null;
  let hasMore = true;
  let pages = 0;

  while (hasMore && pages < 30) {
    const body: Record<string, unknown> = {
      access_token: accessToken,
      count: 500,
      options: { personal_finance_category_version: "v2" },
    };
    if (cursor) body.cursor = cursor;

    const response = await plaidPost<{
      added: PlaidTransaction[];
      modified: PlaidTransaction[];
      removed: Array<{ transaction_id: string }>;
      next_cursor: string;
      has_more: boolean;
    }>("/transactions/sync", body);

    const upserts = [...response.added, ...response.modified].map((transaction) => ({
      household_id: connection.household_id,
      account_id: accountMap.get(transaction.account_id) ?? null,
      posted_at: transaction.date,
      merchant: transaction.merchant_name ?? transaction.name,
      category:
        transaction.personal_finance_category?.detailed ??
        transaction.personal_finance_category?.primary ??
        "Uncategorized",
      amount_cents: cents(signedTransactionAmount(transaction)),
      transaction_type: transactionType(transaction),
      source: "plaid",
      plaid_connection_id: connection.id,
      plaid_transaction_id: transaction.transaction_id,
      updated_at: new Date().toISOString(),
    }));

    if (upserts.length) {
      const { error } = await supabase.from("transactions").upsert(upserts, {
        onConflict: "plaid_connection_id,plaid_transaction_id",
      });
      if (error) throw new Error(`Plaid transaction upsert failed: ${error.message}`);
    }

    const removedIds = response.removed.map((item) => item.transaction_id);
    if (removedIds.length) {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("plaid_connection_id", connection.id)
        .in("plaid_transaction_id", removedIds);
      if (error) throw new Error(`Plaid transaction removal failed: ${error.message}`);
    }

    cursor = response.next_cursor;
    hasMore = response.has_more;
    pages += 1;
  }

  if (hasMore) {
    throw new Error("Plaid transaction sync exceeded the V0.6 pagination safety limit.");
  }

  const { error } = await supabase
    .from("plaid_connections")
    .update({
      transaction_cursor: cursor,
      last_synced_at: new Date().toISOString(),
      status: "active",
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .eq("household_id", connection.household_id);

  if (error) throw new Error(`Unable to save Plaid transaction cursor: ${error.message}`);
}

export async function syncPlaidInvestments(
  supabase: SolpientDbClient,
  connection: PlaidConnection,
  accessToken: string,
  accountMap: Map<string, string>
) {
  const response = await plaidPost<{
    accounts: PlaidAccount[];
    securities: PlaidSecurity[];
    holdings: PlaidHolding[];
  }>("/investments/holdings/get", { access_token: accessToken });

  const securities = new Map(
    response.securities.map((security) => [security.security_id, security])
  );

  const { error: deleteError } = await supabase
    .from("holdings")
    .delete()
    .eq("household_id", connection.household_id)
    .eq("plaid_connection_id", connection.id)
    .eq("source", "plaid");

  if (deleteError) {
    throw new Error(`Unable to replace Plaid holdings: ${deleteError.message}`);
  }

  const rows = response.holdings.flatMap((holding) => {
    const accountId = accountMap.get(holding.account_id);
    if (!accountId) return [];

    const security = securities.get(holding.security_id);
    const ticker =
      security?.ticker_symbol?.trim().toUpperCase() ||
      `PLAID-${holding.security_id.slice(0, 8).toUpperCase()}`;

    return [{
      household_id: connection.household_id,
      account_id: accountId,
      ticker,
      name: security?.name ?? ticker,
      holding_kind: holdingKind(security?.type),
      shares: holding.quantity,
      price: holding.institution_price,
      cost_basis_cents: cents(holding.cost_basis ?? 0),
      market_value_cents: cents(holding.institution_value),
      day_change_pct: 0,
      ytd_return_pct: 0,
      sector: security?.type ?? "Investments",
      source: "plaid",
      plaid_connection_id: connection.id,
      plaid_security_id: holding.security_id,
      plaid_account_id: holding.account_id,
      updated_at: new Date().toISOString(),
    }];
  });

  if (rows.length) {
    const { error } = await supabase.from("holdings").insert(rows);
    if (error) throw new Error(`Plaid holding sync failed: ${error.message}`);
  }

  const { error } = await supabase
    .from("plaid_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      status: "active",
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .eq("household_id", connection.household_id);

  if (error) throw new Error(`Unable to mark investment sync complete: ${error.message}`);
}

export async function syncPlaidLiabilitiesBestEffort(
  supabase: SolpientDbClient,
  connection: PlaidConnection,
  accessToken: string,
  accountMap: Map<string, string>
) {
  try {
    const response = await plaidPost<{
      liabilities?: {
        credit?: Array<{
          account_id: string;
          minimum_payment_amount?: number | null;
          aprs?: Array<{ apr_percentage?: number | null; apr_type?: string | null }>;
        }>;
        mortgage?: Array<{
          account_id: string;
          next_monthly_payment?: number | null;
          interest_rate?: { percentage?: number | null };
        }>;
        student?: Array<{
          account_id: string;
          minimum_payment_amount?: number | null;
          interest_rate_percentage?: number | null;
        }>;
      };
    }>("/liabilities/get", { access_token: accessToken });

    const updates = [
      ...(response.liabilities?.credit ?? []).map((item) => ({
        account_id: item.account_id,
        apr: item.aprs?.find((apr) => apr.apr_type === "purchase_apr")?.apr_percentage ??
          item.aprs?.[0]?.apr_percentage ?? null,
        payment: item.minimum_payment_amount ?? null,
      })),
      ...(response.liabilities?.mortgage ?? []).map((item) => ({
        account_id: item.account_id,
        apr: item.interest_rate?.percentage ?? null,
        payment: item.next_monthly_payment ?? null,
      })),
      ...(response.liabilities?.student ?? []).map((item) => ({
        account_id: item.account_id,
        apr: item.interest_rate_percentage ?? null,
        payment: item.minimum_payment_amount ?? null,
      })),
    ];

    for (const item of updates) {
      const moneyAccountId = accountMap.get(item.account_id);
      if (!moneyAccountId) continue;
      await supabase
        .from("accounts")
        .update({
          apr_pct: item.apr,
          minimum_payment_cents:
            item.payment == null ? null : cents(item.payment),
          updated_at: new Date().toISOString(),
        })
        .eq("id", moneyAccountId)
        .eq("household_id", connection.household_id);
    }
  } catch (error) {
    if (
      error instanceof PlaidApiError &&
      ["PRODUCTS_NOT_SUPPORTED", "PRODUCT_NOT_READY", "NO_LIABILITY_ACCOUNTS"].includes(
        error.errorCode ?? ""
      )
    ) {
      return;
    }
    throw error;
  }
}

export async function syncPlaidConnection(
  supabase: SolpientDbClient,
  connection: PlaidConnection,
  accessToken?: string
) {
  const token = accessToken ?? await loadAccessToken(supabase, connection.id);
  const accountMap = await syncPlaidAccounts(supabase, connection, token);

  if (connection.connection_mode === "investments") {
    await syncPlaidInvestments(supabase, connection, token, accountMap);
  } else {
    await syncPlaidTransactions(supabase, connection, token, accountMap);
    await syncPlaidLiabilitiesBestEffort(supabase, connection, token, accountMap);
  }

  return { accountCount: accountMap.size };
}
