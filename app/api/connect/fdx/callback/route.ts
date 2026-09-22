import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getConnectHouseholdContext } from "@/lib/connect/auth";
import {
  getFdxProvider,
  assertProviderCanAuthorize,
} from "@/lib/connect/fdx/providers";
import { safeEqualState } from "@/lib/connect/fdx/pkce";
import { exchangeAuthorizationCode } from "@/lib/connect/fdx/oauth-client";
import { storeOAuthFdxTokens } from "@/lib/connect/fdx/tokens";
import { runConnectorSync } from "@/lib/connect/registry";

export const dynamic = "force-dynamic";

function clearFlowCookies(response: NextResponse) {
  for (const name of [
    "solpient_fdx_state",
    "solpient_fdx_verifier",
    "solpient_fdx_provider",
  ]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/api/connect/fdx",
      maxAge: 0,
    });
  }
}

export async function GET(request: Request) {
  let createdConnectionId: string | null = null;

  try {
    const url = new URL(request.url);
    const errorCode = url.searchParams.get("error");
    if (errorCode) {
      throw new Error(
        url.searchParams.get("error_description") ??
          `Authorization failed: ${errorCode}`
      );
    }

    const code = url.searchParams.get("code");
    const returnedState =
      url.searchParams.get("state");
    if (!code) {
      throw new Error(
        "Authorization callback is missing a code."
      );
    }

    const cookieStore = await cookies();
    const expectedState = cookieStore.get(
      "solpient_fdx_state"
    )?.value;
    const verifier = cookieStore.get(
      "solpient_fdx_verifier"
    )?.value;
    const providerId = cookieStore.get(
      "solpient_fdx_provider"
    )?.value;

    if (!safeEqualState(expectedState, returnedState)) {
      throw new Error(
        "OAuth state validation failed."
      );
    }
    if (!verifier || !providerId) {
      throw new Error(
        "OAuth authorization session expired."
      );
    }

    const provider = getFdxProvider(providerId);
    if (!provider) {
      throw new Error("OAuth provider no longer exists.");
    }
    assertProviderCanAuthorize(provider);

    const { supabase, householdId } =
      await getConnectHouseholdContext();
    const redirectUri =
      `${url.origin}/api/connect/fdx/callback`;

    const tokens =
      await exchangeAuthorizationCode({
        provider,
        code,
        verifier,
        redirectUri,
      });

    const scopes = (
      tokens.scope ?? provider.scopes.join(" ")
    )
      .split(/\s+/)
      .filter(Boolean);

    const { data: connection, error } =
      await supabase
        .from("oauth_fdx_connections")
        .insert({
          household_id: householdId,
          provider_id: provider.id,
          institution_name: provider.name,
          security_profile:
            provider.securityProfile,
          status: "active",
          granted_scopes: scopes,
        })
        .select("id")
        .single();

    if (error || !connection) {
      throw new Error(
        `Unable to save OAuth/FDX connection: ${error?.message ?? "unknown error"}`
      );
    }

    createdConnectionId = String(connection.id);
    await storeOAuthFdxTokens(
      supabase,
      createdConnectionId,
      tokens
    );

    const sync = await runConnectorSync(
      "fdx",
      { supabase, householdId },
      createdConnectionId
    );

    const destination = new URL(
      "/connect/fdx",
      url.origin
    );
    destination.searchParams.set(
      "connected",
      provider.id
    );
    destination.searchParams.set(
      "sync",
      sync.every((result) => result.ok)
        ? "ok"
        : "attention"
    );

    const response =
      NextResponse.redirect(destination);
    clearFlowCookies(response);
    return response;
  } catch (error) {
    try {
      if (createdConnectionId) {
        const { supabase, householdId } =
          await getConnectHouseholdContext();
        await supabase
          .from("oauth_fdx_connections")
          .delete()
          .eq("id", createdConnectionId)
          .eq("household_id", householdId);
      }
    } catch {
      // Preserve the OAuth error.
    }

    const url = new URL(request.url);
    const destination = new URL(
      "/connect/fdx",
      url.origin
    );
    destination.searchParams.set(
      "error",
      error instanceof Error
        ? error.message
        : "OAuth/FDX authorization failed."
    );

    const response =
      NextResponse.redirect(destination);
    clearFlowCookies(response);
    return response;
  }
}
