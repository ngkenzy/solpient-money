import { NextResponse } from "next/server";
import { getPlaidHouseholdContext, PlaidAuthError } from "@/lib/plaid/auth";
import { getPlaidStatus } from "@/lib/plaid/config";
import { PlaidApiError, plaidPost } from "@/lib/plaid/client";
import { loadAccessToken } from "@/lib/plaid/sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!getPlaidStatus().configured) {
      return NextResponse.json(
        { error: "Plaid Sandbox credentials are not configured." },
        { status: 503 }
      );
    }

    const { supabase, householdId } = await getPlaidHouseholdContext();
    const body = (await request.json()) as { connectionId?: string };

    if (!body.connectionId) {
      return NextResponse.json({ error: "Missing connection id." }, { status: 400 });
    }

    const { data: connection, error } = await supabase
      .from("plaid_connections")
      .select("*")
      .eq("id", body.connectionId)
      .eq("household_id", householdId)
      .single();

    if (error || !connection) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }

    const token = await loadAccessToken(supabase, String(connection.id));

    try {
      await plaidPost("/item/remove", { access_token: token });
    } catch (error) {
      if (!(error instanceof PlaidApiError && error.errorCode === "ITEM_NOT_FOUND")) {
        throw error;
      }
    }

    const { data: plaidAccounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("household_id", householdId)
      .eq("plaid_connection_id", connection.id);

    const accountIds = (plaidAccounts ?? []).map((account) => String(account.id));

    if (accountIds.length) {
      await supabase
        .from("transactions")
        .update({ account_id: null })
        .eq("household_id", householdId)
        .neq("source", "plaid")
        .in("account_id", accountIds);
    }

    await supabase
      .from("transactions")
      .delete()
      .eq("household_id", householdId)
      .eq("plaid_connection_id", connection.id);

    await supabase
      .from("holdings")
      .delete()
      .eq("household_id", householdId)
      .eq("plaid_connection_id", connection.id);

    await supabase
      .from("accounts")
      .delete()
      .eq("household_id", householdId)
      .eq("plaid_connection_id", connection.id);

    await supabase.rpc("delete_plaid_access_token", {
      p_connection_id: connection.id,
    });

    const { error: deleteError } = await supabase
      .from("plaid_connections")
      .delete()
      .eq("id", connection.id)
      .eq("household_id", householdId);

    if (deleteError) throw new Error(deleteError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status =
      error instanceof PlaidAuthError
        ? error.status
        : error instanceof PlaidApiError
          ? error.status
          : 500;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Plaid disconnect failed." },
      { status }
    );
  }
}
