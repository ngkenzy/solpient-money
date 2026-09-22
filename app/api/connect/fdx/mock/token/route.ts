import { NextResponse } from "next/server";
import {
  createMockFdxToken,
  readMockFdxToken,
} from "@/lib/connect/fdx/mock-token";
import { pkceChallenge } from "@/lib/connect/fdx/pkce";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const grantType = String(
      form.get("grant_type") ?? ""
    );
    const clientId = String(
      form.get("client_id") ?? ""
    );

    if (clientId !== "solpient-money-local") {
      throw new Error("Unknown sandbox client.");
    }

    let scope =
      "openid profile ACCOUNT_BASIC TRANSACTIONS INVESTMENTS";

    if (
      grantType === "authorization_code"
    ) {
      const code = String(form.get("code") ?? "");
      const verifier = String(
        form.get("code_verifier") ?? ""
      );
      const redirectUri = String(
        form.get("redirect_uri") ?? ""
      );
      const payload = readMockFdxToken(
        code,
        "code"
      );

      if (
        payload.clientId !== clientId ||
        payload.redirectUri !== redirectUri ||
        !payload.codeChallenge ||
        pkceChallenge(verifier) !==
          payload.codeChallenge
      ) {
        throw new Error(
          "Sandbox PKCE validation failed."
        );
      }
      scope = payload.scope;
    } else if (
      grantType === "refresh_token"
    ) {
      const refreshToken = String(
        form.get("refresh_token") ?? ""
      );
      const payload = readMockFdxToken(
        refreshToken,
        "refresh"
      );
      if (payload.clientId !== clientId) {
        throw new Error(
          "Sandbox refresh token client mismatch."
        );
      }
      scope = payload.scope;
    } else {
      throw new Error(
        "Unsupported sandbox grant type."
      );
    }

    const now = Math.floor(Date.now() / 1000);
    return NextResponse.json(
      {
        access_token: createMockFdxToken({
          kind: "access",
          clientId,
          scope,
          exp: now + 3600,
        }),
        refresh_token: createMockFdxToken({
          kind: "refresh",
          clientId,
          scope,
          exp: now + 30 * 24 * 3600,
        }),
        token_type: "Bearer",
        expires_in: 3600,
        scope,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description:
          error instanceof Error
            ? error.message
            : "Sandbox token request failed.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
