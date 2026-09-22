import { NextResponse } from "next/server";
import {
  getPlaidHouseholdContext,
  PlaidAuthError,
} from "@/lib/plaid/auth";
import { runConnectorSync } from "@/lib/connect/registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { supabase, householdId } =
      await getPlaidHouseholdContext();
    const body = (await request.json().catch(() => ({}))) as {
      connectionId?: string;
    };

    const results = await runConnectorSync(
      "plaid",
      { supabase, householdId },
      body.connectionId
    );

    return NextResponse.json({
      ok: results.every((result) => result.ok),
      connectorId: "plaid",
      results,
    });
  } catch (error) {
    const status =
      error instanceof PlaidAuthError
        ? error.status
        : error instanceof Error &&
            /not configured/i.test(error.message)
          ? 503
          : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Plaid sync failed.",
      },
      { status }
    );
  }
}
