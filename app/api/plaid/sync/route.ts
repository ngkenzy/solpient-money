import { NextResponse } from "next/server";
import { getPlaidHouseholdContext, PlaidAuthError } from "@/lib/plaid/auth";
import { getPlaidStatus } from "@/lib/plaid/config";
import { PlaidApiError } from "@/lib/plaid/client";
import { loadAccessToken, syncPlaidConnection } from "@/lib/plaid/sync";

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
    const body = (await request.json().catch(() => ({}))) as {
      connectionId?: string;
    };

    let query = supabase
      .from("plaid_connections")
      .select("*")
      .eq("household_id", householdId)
      .neq("status", "disconnected");

    if (body.connectionId) {
      query = query.eq("id", body.connectionId);
    }

    const { data: connections, error } = await query;
    if (error) throw new Error(error.message);

    const results: Array<Record<string, unknown>> = [];

    for (const connection of connections ?? []) {
      try {
        const token = await loadAccessToken(supabase, String(connection.id));
        const result = await syncPlaidConnection(
          supabase,
          {
            id: String(connection.id),
            household_id: String(connection.household_id),
            item_id: String(connection.item_id),
            institution_name: String(connection.institution_name),
            connection_mode: connection.connection_mode as "banking" | "investments",
            transaction_cursor: connection.transaction_cursor as string | null,
          },
          token
        );
        results.push({ connectionId: connection.id, ok: true, ...result });
      } catch (syncError) {
        const code =
          syncError instanceof PlaidApiError ? syncError.errorCode ?? null : null;
        await supabase
          .from("plaid_connections")
          .update({
            status: code === "ITEM_LOGIN_REQUIRED" ? "needs_update" : "error",
            last_error_code: code,
            last_error_message:
              syncError instanceof Error ? syncError.message : "Plaid sync failed.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", connection.id)
          .eq("household_id", householdId);

        results.push({
          connectionId: connection.id,
          ok: false,
          error: syncError instanceof Error ? syncError.message : "Plaid sync failed.",
        });
      }
    }

    return NextResponse.json({
      ok: results.every((result) => result.ok === true),
      results,
    });
  } catch (error) {
    const status =
      error instanceof PlaidAuthError
        ? error.status
        : error instanceof PlaidApiError
          ? error.status
          : 500;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Plaid sync failed." },
      { status }
    );
  }
}
