import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createOAuthState,
  createPkceVerifier,
  pkceChallenge,
  safeEqualState,
} from "../lib/connect/fdx/pkce.ts";
import {
  getFdxProviders,
  getFdxProvider,
  providerCanAuthorize,
  assertProviderCanAuthorize,
} from "../lib/connect/fdx/providers.ts";
import {
  createMockFdxToken,
  readMockFdxToken,
} from "../lib/connect/fdx/mock-token.ts";

process.env.CONNECT_SECRET_ENCRYPTION_KEY =
  Buffer.alloc(32, 9).toString("base64");
process.env.NEXT_PUBLIC_SITE_URL =
  "http://localhost:3000";

const state = createOAuthState();
const verifier = createPkceVerifier();
const challenge = pkceChallenge(verifier);

assert.ok(state.length >= 32);
assert.ok(verifier.length >= 43);
assert.equal(challenge.length, 43);
assert.equal(safeEqualState(state, state), true);
assert.equal(safeEqualState(state, state + "x"), false);
assert.equal(safeEqualState(undefined, state), false);

const providers = getFdxProviders();
const mock = getFdxProvider("solpient-fdx-sandbox");
const bofa = getFdxProvider("bank-of-america");
const chase = getFdxProvider("chase");

assert.ok(mock);
assert.equal(mock.status, "sandbox_ready");
assert.equal(mock.securityProfile, "oauth_pkce_sandbox");
assert.equal(providerCanAuthorize(mock), true);
assert.doesNotThrow(() => assertProviderCanAuthorize(mock));

assert.ok(bofa);
assert.equal(bofa.status, "onboarding");
assert.equal(bofa.securityProfile, "fdx_fapi");
assert.equal(bofa.requiresPar, true);
assert.equal(bofa.requiresMtls, true);
assert.equal(providerCanAuthorize(bofa), false);
assert.throws(
  () => assertProviderCanAuthorize(bofa),
  /production FDX\/FAPI onboarding/
);

assert.ok(chase);
assert.equal(chase.status, "partner_required");
assert.equal(chase.securityProfile, "fdx_fapi");
assert.equal(providerCanAuthorize(chase), false);
assert.ok(providers.length >= 4);

const now = Math.floor(Date.now() / 1000);
const token = createMockFdxToken({
  kind: "access",
  clientId: "solpient-money-local",
  scope: "ACCOUNT_BASIC TRANSACTIONS",
  exp: now + 600,
});
const decoded = readMockFdxToken(token, "access");
assert.equal(decoded.clientId, "solpient-money-local");
assert.equal(decoded.kind, "access");
assert.throws(
  () => readMockFdxToken(token, "refresh"),
  /Expected refresh/
);

const migration = await readFile(
  "supabase/migrations/20260922140000_connect_v14_oauth_fdx.sql",
  "utf8"
);
const startRoute = await readFile(
  "app/api/connect/fdx/start/route.ts",
  "utf8"
);
const callbackRoute = await readFile(
  "app/api/connect/fdx/callback/route.ts",
  "utf8"
);
const authorizeRoute = await readFile(
  "app/api/connect/fdx/mock/authorize/route.ts",
  "utf8"
);
const tokenRoute = await readFile(
  "app/api/connect/fdx/mock/token/route.ts",
  "utf8"
);
const accountsRoute = await readFile(
  "app/api/connect/fdx/mock/accounts/route.ts",
  "utf8"
);
const adapter = await readFile(
  "lib/connect/adapters/fdx.ts",
  "utf8"
);
const normalizer = await readFile(
  "lib/connect/fdx/normalizer.ts",
  "utf8"
);
const tokenVault = await readFile(
  "lib/connect/fdx/tokens.ts",
  "utf8"
);
const page = await readFile(
  "app/connect/fdx/page.tsx",
  "utf8"
);
const registry = await readFile(
  "lib/connect/registry.ts",
  "utf8"
);

assert.ok(
  migration.includes(
    "alter table public.oauth_fdx_connections enable row level security"
  )
);
assert.ok(
  migration.includes(
    "alter table private.oauth_fdx_tokens enable row level security"
  )
);
assert.ok(migration.includes("security invoker"));
assert.ok(migration.includes("'fdx'"));
assert.ok(
  migration.includes(
    "transactions_oauth_fdx_external_unique"
  )
);
assert.ok(
  migration.includes(
    "holdings_oauth_fdx_external_unique"
  )
);

assert.ok(startRoute.includes("createPkceVerifier"));
assert.ok(startRoute.includes("pkceChallenge"));
assert.ok(startRoute.includes("httpOnly: true"));
assert.ok(startRoute.includes('sameSite: "lax"'));
assert.ok(callbackRoute.includes("safeEqualState"));
assert.ok(callbackRoute.includes("exchangeAuthorizationCode"));
assert.ok(callbackRoute.includes("storeOAuthFdxTokens"));
assert.ok(callbackRoute.includes("runConnectorSync"));
assert.ok(callbackRoute.includes('"fdx"'));

assert.ok(authorizeRoute.includes("Authorize sandbox data"));
assert.ok(authorizeRoute.includes("code_challenge"));
assert.ok(tokenRoute.includes("authorization_code"));
assert.ok(tokenRoute.includes("refresh_token"));
assert.ok(tokenRoute.includes("pkceChallenge"));
assert.ok(accountsRoute.includes("requireMockFdxAccess"));

assert.ok(adapter.includes('id: "fdx"'));
assert.ok(adapter.includes('maturity: "sandbox"'));
assert.ok(adapter.includes('source: "fdx"'));
assert.ok(adapter.includes("refreshOAuthTokens"));
assert.ok(adapter.includes("extractFdxAccounts"));
assert.ok(adapter.includes("extractFdxTransactions"));
assert.ok(adapter.includes("extractFdxHoldings"));
assert.ok(normalizer.includes("NormalizedConnectorAccount"));
assert.ok(tokenVault.includes("encryptConnectorSecret"));
assert.ok(tokenVault.includes("decryptConnectorSecret"));

assert.ok(page.includes("Sandbox OAuth is not being mislabeled as production FDX."));
assert.ok(page.includes("Bank of America"));
assert.ok(page.includes("PAR"));
assert.ok(page.includes("mTLS"));
assert.ok(registry.includes('adapters/fdx'));

console.log("Solpient Connect V1.4 OAuth/FDX framework checks passed.");
