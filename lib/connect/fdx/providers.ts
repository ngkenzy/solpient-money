export type FdxSecurityProfile =
  | "oauth_pkce_sandbox"
  | "fdx_fapi";

export type FdxProviderStatus =
  | "sandbox_ready"
  | "setup_required"
  | "onboarding"
  | "partner_required";

export type FdxProviderProfile = {
  id: string;
  name: string;
  status: FdxProviderStatus;
  securityProfile: FdxSecurityProfile;
  summary: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  apiBaseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes: string[];
  requiresPar: boolean;
  requiresMtls: boolean;
  requiresClientRegistration: boolean;
  onboardingUrl?: string;
};

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

function envSandbox(): FdxProviderProfile {
  const authorizationUrl =
    process.env.FDX_SANDBOX_AUTHORIZATION_URL?.trim();
  const tokenUrl = process.env.FDX_SANDBOX_TOKEN_URL?.trim();
  const apiBaseUrl =
    process.env.FDX_SANDBOX_API_BASE_URL?.trim();
  const clientId = process.env.FDX_SANDBOX_CLIENT_ID?.trim();
  const clientSecret =
    process.env.FDX_SANDBOX_CLIENT_SECRET?.trim();

  const ready = Boolean(
    authorizationUrl &&
      tokenUrl &&
      apiBaseUrl &&
      clientId &&
      process.env.CONNECT_SECRET_ENCRYPTION_KEY?.trim()
  );

  return {
    id: "fdx-sandbox",
    name: "External FDX Sandbox",
    status: ready ? "sandbox_ready" : "setup_required",
    securityProfile: "oauth_pkce_sandbox",
    summary: ready
      ? "Configured external OAuth/FDX sandbox using PKCE."
      : "Configure an institution or provider sandbox with OAuth endpoints, an FDX API base URL, and a client ID.",
    authorizationUrl,
    tokenUrl,
    apiBaseUrl,
    clientId,
    clientSecret,
    scopes: (
      process.env.FDX_SANDBOX_SCOPES ??
      "openid profile ACCOUNT_BASIC TRANSACTIONS INVESTMENTS"
    )
      .split(/\s+/)
      .filter(Boolean),
    requiresPar: false,
    requiresMtls: false,
    requiresClientRegistration: true,
  };
}

export function getFdxProviders(): FdxProviderProfile[] {
  const base = siteUrl();

  return [
    {
      id: "solpient-fdx-sandbox",
      name: "Solpient FDX Sandbox",
      status: process.env.CONNECT_SECRET_ENCRYPTION_KEY?.trim()
        ? "sandbox_ready"
        : "setup_required",
      securityProfile: "oauth_pkce_sandbox",
      summary:
        "Local end-to-end OAuth/PKCE + FDX-aligned simulator for validating Solpient Connect without bank credentials or aggregator fees.",
      authorizationUrl: `${base}/api/connect/fdx/mock/authorize`,
      tokenUrl: `${base}/api/connect/fdx/mock/token`,
      apiBaseUrl: `${base}/api/connect/fdx/mock`,
      clientId: "solpient-money-local",
      scopes: [
        "openid",
        "profile",
        "ACCOUNT_BASIC",
        "TRANSACTIONS",
        "INVESTMENTS",
      ],
      requiresPar: false,
      requiresMtls: false,
      requiresClientRegistration: false,
    },
    envSandbox(),
    {
      id: "bank-of-america",
      name: "Bank of America / Merrill",
      status: "onboarding",
      securityProfile: "fdx_fapi",
      summary:
        "Bank of America advertises FDX-aligned Open Banking APIs and sandbox-to-production tooling, but Solpient needs institution onboarding and production client credentials before connecting.",
      scopes: [
        "ACCOUNT_BASIC",
        "TRANSACTIONS",
        "INVESTMENTS",
      ],
      requiresPar: true,
      requiresMtls: true,
      requiresClientRegistration: true,
      onboardingUrl:
        "https://dataservicesapi.bankofamerica.com/ds6/portal",
    },
    {
      id: "chase",
      name: "Chase",
      status: "partner_required",
      securityProfile: "fdx_fapi",
      summary:
        "Chase participates in the FDX ecosystem, but Solpient does not have a public self-service production client registration or bank-specific endpoints configured.",
      scopes: [
        "ACCOUNT_BASIC",
        "TRANSACTIONS",
        "INVESTMENTS",
      ],
      requiresPar: true,
      requiresMtls: true,
      requiresClientRegistration: true,
    },
  ];
}

export function getFdxProvider(id: string) {
  return getFdxProviders().find(
    (provider) => provider.id === id
  );
}

export function providerCanAuthorize(
  provider: FdxProviderProfile
) {
  return (
    provider.status === "sandbox_ready" &&
    provider.securityProfile === "oauth_pkce_sandbox" &&
    Boolean(
      provider.authorizationUrl &&
        provider.tokenUrl &&
        provider.apiBaseUrl &&
        provider.clientId
    )
  );
}

export function assertProviderCanAuthorize(
  provider: FdxProviderProfile
) {
  if (provider.securityProfile === "fdx_fapi") {
    throw new Error(
      `${provider.name} requires production FDX/FAPI onboarding, including registered client credentials and institution security requirements such as PAR/mTLS. V1.4 will not downgrade that flow to plain OAuth.`
    );
  }

  if (!providerCanAuthorize(provider)) {
    throw new Error(
      `${provider.name} OAuth/FDX sandbox is not configured.`
    );
  }
}
