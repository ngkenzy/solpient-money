export type PlaidMode = "banking" | "investments";

export type PlaidServerConfig = {
  clientId: string;
  secret: string;
  encryptionKey: string;
  environment: "sandbox";
  baseUrl: string;
};

export function getPlaidServerConfig(): PlaidServerConfig {
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  const encryptionKey = process.env.PLAID_TOKEN_ENCRYPTION_KEY?.trim();
  const environment = (process.env.PLAID_ENV?.trim() || "sandbox") as "sandbox";

  if (environment !== "sandbox") {
    throw new Error("V0.6 only supports PLAID_ENV=sandbox.");
  }
  if (!clientId || !secret || !encryptionKey) {
    throw new Error(
      "Plaid Sandbox is not configured. Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_TOKEN_ENCRYPTION_KEY."
    );
  }

  return {
    clientId,
    secret,
    encryptionKey,
    environment: "sandbox",
    baseUrl: "https://sandbox.plaid.com",
  };
}

export function getPlaidStatus() {
  return {
    configured: Boolean(
      process.env.PLAID_CLIENT_ID?.trim() &&
      process.env.PLAID_SECRET?.trim() &&
      process.env.PLAID_TOKEN_ENCRYPTION_KEY?.trim()
    ),
    environment: "sandbox" as const,
  };
}

export function productsForMode(mode: PlaidMode) {
  if (mode === "investments") {
    return {
      products: ["investments"],
      optionalProducts: [] as string[],
    };
  }

  return {
    products: ["transactions"],
    optionalProducts: ["liabilities"],
  };
}
