import { NextResponse } from "next/server";
import { getConnectHouseholdContext } from "@/lib/connect/auth";
import {
  assertProviderCanAuthorize,
  getFdxProvider,
} from "@/lib/connect/fdx/providers";
import {
  createOAuthState,
  createPkceVerifier,
  pkceChallenge,
} from "@/lib/connect/fdx/pkce";
import { buildAuthorizationUrl } from "@/lib/connect/fdx/oauth-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await getConnectHouseholdContext();

    const url = new URL(request.url);
    const providerId =
      url.searchParams.get("provider")?.trim() ?? "";
    const provider = getFdxProvider(providerId);

    if (!provider) {
      return NextResponse.json(
        { error: "Unknown OAuth/FDX provider." },
        { status: 404 }
      );
    }

    assertProviderCanAuthorize(provider);

    const state = createOAuthState();
    const verifier = createPkceVerifier();
    const redirectUri =
      `${url.origin}/api/connect/fdx/callback`;
    const authorizationUrl = buildAuthorizationUrl({
      provider,
      redirectUri,
      state,
      codeChallenge: pkceChallenge(verifier),
    });

    const response =
      NextResponse.redirect(authorizationUrl);
    const secure = url.protocol === "https:";
    const options = {
      httpOnly: true,
      secure,
      sameSite: "lax" as const,
      path: "/api/connect/fdx",
      maxAge: 600,
    };

    response.cookies.set(
      "solpient_fdx_state",
      state,
      options
    );
    response.cookies.set(
      "solpient_fdx_verifier",
      verifier,
      options
    );
    response.cookies.set(
      "solpient_fdx_provider",
      provider.id,
      options
    );

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start OAuth/FDX authorization.",
      },
      { status: 409 }
    );
  }
}
