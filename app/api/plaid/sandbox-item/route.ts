import { NextResponse } from "next/server";
import { getPlaidHouseholdContext, PlaidAuthError } from "@/lib/plaid/auth";
import { getPlaidStatus, type PlaidMode } from "@/lib/plaid/config";
import { PlaidApiError, plaidPost } from "@/lib/plaid/client";
import { exchangeAndPersistPlaidItem } from "@/lib/plaid/service";

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
    const body = (await request.json()) as { mode?: PlaidMode };
    const mode = body.mode === "investments" ? "investments" : "banking";
    const initialProducts = mode === "investments" ? ["investments"] : ["transactions"];

    const sandbox = await plaidPost<{ public_token: string }>(
      "/sandbox/public_token/create",
      {
        institution_id: "ins_109508",
        initial_products: initialProducts,
        options: {
          override_username: "user_good",
          override_password: "pass_good",
        },
      }
    );

    const result = await exchangeAndPersistPlaidItem({
      supabase,
      householdId,
      publicToken: sandbox.public_token,
      mode,
      institutionId: "ins_109508",
      institutionName: "First Platypus Bank",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const status =
      error instanceof PlaidAuthError
        ? error.status
        : error instanceof PlaidApiError
          ? error.status
          : 500;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sandbox Item creation failed." },
      { status }
    );
  }
}
