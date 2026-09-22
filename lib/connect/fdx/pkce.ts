import { createHash, randomBytes } from "node:crypto";

function base64url(value: Buffer) {
  return value
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function createOAuthState() {
  return base64url(randomBytes(32));
}

export function createPkceVerifier() {
  return base64url(randomBytes(48));
}

export function pkceChallenge(verifier: string) {
  return base64url(
    createHash("sha256").update(verifier).digest()
  );
}

export function safeEqualState(
  expected: string | undefined,
  actual: string | null
) {
  return Boolean(
    expected &&
      actual &&
      expected.length === actual.length &&
      expected === actual
  );
}
