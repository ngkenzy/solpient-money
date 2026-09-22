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

    const { supabase, householdId, userId } = await getPlaidHouseholdContext();
    const body = (await request.json()) as { connectionId?: string };

    if (!body.connectionId) {
      return NextResponse.json({ error: "Missing connection id." }, { status: 400 });
    }

    const { data: connection, error } = await supabase
      .from("plaid_connections")
      .select("id,household_id")
      .eq("id", body.connectionId)
      .eq("household_id", householdId)
      .single();

    if (error || !connection) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }

    const accessToken = await loadAccessToken(supabase, String(connection.id));

    const response = await plaidPost<{
      link_token: string;
      expiration: string;
    }>("/link/token/create", {
      user: { client_user_id: `${userId}:${householdId}` },
      client_name: "Solpient Money",
      country_codes: ["US"],
      language: "en",
      access_token: accessToken,
    });

    return NextResponse.json({
      link_token: response.link_token,
      expiration: response.expiration,
    });
  } catch (error) {
    const status =
      error instanceof PlaidAuthError
        ? error.status
        : error instanceof PlaidApiError
          ? error.status
          : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create Plaid update session.",
      },
      { status }
    );
  }
}
