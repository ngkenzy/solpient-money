import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

type MockTokenPayload = {
  kind: "code" | "access" | "refresh";
  clientId: string;
  scope: string;
  exp: number;
  redirectUri?: string;
  codeChallenge?: string;
};

function secret() {
  const value =
    process.env.CONNECT_SECRET_ENCRYPTION_KEY?.trim();
  if (!value) {
    throw new Error(
      "CONNECT_SECRET_ENCRYPTION_KEY is required for the Solpient FDX Sandbox."
    );
  }
  return value;
}

function sign(data: string) {
  return createHmac("sha256", secret())
    .update(data)
    .digest("base64url");
}

export function createMockFdxToken(
  payload: MockTokenPayload
) {
  const body = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readMockFdxToken(
  token: string,
  expectedKind?: MockTokenPayload["kind"]
): MockTokenPayload {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    throw new Error("Malformed sandbox token.");
  }

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (
    a.length !== b.length ||
    !timingSafeEqual(a, b)
  ) {
    throw new Error(
      "Invalid sandbox token signature."
    );
  }

  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8")
  ) as MockTokenPayload;

  if (
    expectedKind &&
    payload.kind !== expectedKind
  ) {
    throw new Error(
      `Expected ${expectedKind} sandbox token.`
    );
  }
  if (
    !payload.exp ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Sandbox token expired.");
  }
  return payload;
}
