import type { SolpientDbClient } from "@/lib/local-db/client";
import type { PlaidMode } from "@/lib/plaid/config";
import { plaidPost } from "@/lib/plaid/client";
import { storeAccessToken, syncPlaidConnection } from "@/lib/plaid/sync";

export async function exchangeAndPersistPlaidItem(args: {
  supabase: SolpientDbClient;
  householdId: string;
  publicToken: string;
  mode: PlaidMode;
  institutionId?: string | null;
  institutionName?: string | null;
}) {
  const exchange = await plaidPost<{
    access_token: string;
    item_id: string;
  }>("/item/public_token/exchange", {
    public_token: args.publicToken,
  });

  const products =
    args.mode === "investments"
      ? ["investments"]
      : ["transactions", "liabilities"];

  const { data: connection, error } = await args.supabase
    .from("plaid_connections")
    .insert({
      household_id: args.householdId,
      item_id: exchange.item_id,
      institution_id: args.institutionId ?? null,
      institution_name: args.institutionName ?? "Plaid Sandbox Institution",
      environment: "sandbox",
      connection_mode: args.mode,
      products,
      status: "active",
    })
    .select("*")
    .single();

  if (error || !connection) {
    throw new Error(error?.message ?? "Unable to persist Plaid connection.");
  }

  try {
    await storeAccessToken(args.supabase, String(connection.id), exchange.access_token);
    await syncPlaidConnection(
      args.supabase,
      {
        id: String(connection.id),
        household_id: String(connection.household_id),
        item_id: String(connection.item_id),
        institution_name: String(connection.institution_name),
        connection_mode: connection.connection_mode as PlaidMode,
        transaction_cursor: connection.transaction_cursor as string | null,
      },
      exchange.access_token
    );
  } catch (syncError) {
    await args.supabase
      .from("plaid_connections")
      .update({
        status: "error",
        last_error_message:
          syncError instanceof Error ? syncError.message : "Initial Plaid sync failed.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("household_id", args.householdId);

    throw syncError;
  }

  return {
    connectionId: String(connection.id),
    itemId: exchange.item_id,
  };
}
