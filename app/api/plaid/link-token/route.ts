import { NextResponse } from "next/server";
import { getPlaidHouseholdContext, PlaidAuthError } from "@/lib/plaid/auth";
import { getPlaidStatus, productsForMode, type PlaidMode } from "@/lib/plaid/config";
import { PlaidApiError, plaidPost } from "@/lib/plaid/client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const status = getPlaidStatus();
    if (!status.configured) {
      return NextResponse.json(
        { error: "Plaid Sandbox credentials are not configured." },
        { status: 503 }
      );
    }

    const { userId, householdId } = await getPlaidHouseholdContext();
    const body = (await request.json()) as { mode?: PlaidMode };
    const mode = body.mode === "investments" ? "investments" : "banking";
    const config = productsForMode(mode);

    const requestBody: Record<string, unknown> = {
      user: { client_user_id: `${userId}:${householdId}` },
      client_name: "Solpient Money",
      products: config.products,
      country_codes: ["US"],
      language: "en",
    };

    if (config.optionalProducts.length) {
      requestBody.optional_products = config.optionalProducts;
    }
    if (mode === "banking") {
      requestBody.transactions = { days_requested: 180 };
    }

    const response = await plaidPost<{
      link_token: string;
      expiration: string;
      request_id: string;
    }>("/link/token/create", requestBody);

    return NextResponse.json({
      link_token: response.link_token,
      expiration: response.expiration,
      mode,
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
        error: error instanceof Error ? error.message : "Unable to create Plaid Link token.",
      },
      { status }
    );
  }
}
