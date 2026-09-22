import type {
  FdxProviderProfile,
} from "@/lib/connect/fdx/providers";
import type { OAuthFdxTokenSet } from "@/lib/connect/fdx/tokens";

function requireHttpsOrLocal(urlValue: string) {
  const url = new URL(urlValue);
  const isLocal =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocal) {
    throw new Error(
      "OAuth/FDX provider endpoints must use HTTPS outside local development."
    );
  }
  return url;
}

export function buildAuthorizationUrl({
  provider,
  redirectUri,
  state,
  codeChallenge,
}: {
  provider: FdxProviderProfile;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  if (
    !provider.authorizationUrl ||
    !provider.clientId
  ) {
    throw new Error("OAuth provider is missing authorization configuration.");
  }

  const url = requireHttpsOrLocal(
    provider.authorizationUrl
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set(
    "scope",
    provider.scopes.join(" ")
  );
  url.searchParams.set("state", state);
  url.searchParams.set(
    "code_challenge",
    codeChallenge
  );
  url.searchParams.set(
    "code_challenge_method",
    "S256"
  );
  return url.toString();
}

export async function exchangeAuthorizationCode({
  provider,
  code,
  verifier,
  redirectUri,
}: {
  provider: FdxProviderProfile;
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<OAuthFdxTokenSet> {
  if (!provider.tokenUrl || !provider.clientId) {
    throw new Error("OAuth provider is missing token configuration.");
  }

  requireHttpsOrLocal(provider.tokenUrl);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: provider.clientId,
    code_verifier: verifier,
  });

  const headers = new Headers({
    "Content-Type":
      "application/x-www-form-urlencoded",
    Accept: "application/json",
  });

  if (provider.clientSecret) {
    headers.set(
      "Authorization",
      `Basic ${Buffer.from(
        `${provider.clientId}:${provider.clientSecret}`
      ).toString("base64")}`
    );
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers,
    body,
    redirect: "error",
    cache: "no-store",
  });

  const payload = (await response.json().catch(
    () => ({})
  )) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.error === "string"
          ? payload.error
          : `OAuth token exchange failed with HTTP ${response.status}.`
    );
  }

  const accessToken =
    typeof payload.access_token === "string"
      ? payload.access_token
      : "";

  if (!accessToken) {
    throw new Error(
      "OAuth token response did not include an access token."
    );
  }

  const expiresIn = Number(payload.expires_in ?? 0);
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(
          Date.now() + expiresIn * 1000
        ).toISOString()
      : null;

  return {
    accessToken,
    refreshToken:
      typeof payload.refresh_token === "string"
        ? payload.refresh_token
        : null,
    tokenType:
      typeof payload.token_type === "string"
        ? payload.token_type
        : "Bearer",
    expiresAt,
    scope:
      typeof payload.scope === "string"
        ? payload.scope
        : provider.scopes.join(" "),
  };
}

export async function refreshOAuthTokens({
  provider,
  refreshToken,
}: {
  provider: FdxProviderProfile;
  refreshToken: string;
}) {
  if (!provider.tokenUrl || !provider.clientId) {
    throw new Error("OAuth provider is missing token configuration.");
  }

  requireHttpsOrLocal(provider.tokenUrl);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: provider.clientId,
  });

  const headers = new Headers({
    "Content-Type":
      "application/x-www-form-urlencoded",
    Accept: "application/json",
  });

  if (provider.clientSecret) {
    headers.set(
      "Authorization",
      `Basic ${Buffer.from(
        `${provider.clientId}:${provider.clientSecret}`
      ).toString("base64")}`
    );
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers,
    body,
    redirect: "error",
    cache: "no-store",
  });
  const payload = (await response.json().catch(
    () => ({})
  )) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.error === "string"
          ? payload.error
          : "OAuth refresh failed."
    );
  }

  const expiresIn = Number(payload.expires_in ?? 0);
  return {
    accessToken: String(payload.access_token ?? ""),
    refreshToken:
      typeof payload.refresh_token === "string"
        ? payload.refresh_token
        : refreshToken,
    tokenType:
      typeof payload.token_type === "string"
        ? payload.token_type
        : "Bearer",
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(
            Date.now() + expiresIn * 1000
          ).toISOString()
        : null,
    scope:
      typeof payload.scope === "string"
        ? payload.scope
        : null,
  } satisfies OAuthFdxTokenSet;
}
