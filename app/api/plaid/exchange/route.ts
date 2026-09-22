import { NextResponse } from "next/server";
import { getPlaidHouseholdContext, PlaidAuthError } from "@/lib/plaid/auth";
import { getPlaidStatus, type PlaidMode } from "@/lib/plaid/config";
import { PlaidApiError } from "@/lib/plaid/client";
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
    const body = (await request.json()) as {
      publicToken?: string | null;
      mode?: PlaidMode;
      institution?: { institution_id?: string | null; name?: string | null } | null;
    };

    if (!body.publicToken) {
      return NextResponse.json({ error: "Missing Plaid public token." }, { status: 400 });
    }

    const mode = body.mode === "investments" ? "investments" : "banking";
    const result = await exchangeAndPersistPlaidItem({
      supabase,
      householdId,
      publicToken: body.publicToken,
      mode,
      institutionId: body.institution?.institution_id ?? null,
      institutionName: body.institution?.name ?? null,
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
      { error: error instanceof Error ? error.message : "Plaid connection failed." },
      { status }
    );
  }
}
