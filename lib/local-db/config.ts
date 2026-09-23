export const LOCAL_USER_ID =
  "00000000-0000-0000-0000-000000000001";
export const LOCAL_USER_EMAIL =
  process.env.SOLPIENT_LOCAL_USER_EMAIL?.trim() ||
  "local@solpient.local";

export function getDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "DATABASE_URL is not configured. Run npm run local:repair."
    );
  }

  if (process.env.SOLPIENT_LOCAL_MODE?.trim() === "true") {
    try {
      const parsed = new URL(value);
      const port = parsed.port || "5432";
      const database = parsed.pathname.replace(/^\//, "");

      if (
        parsed.hostname !== "127.0.0.1" ||
        port !== "5432" ||
        database !== "solpient" ||
        decodeURIComponent(parsed.username) !== "solpient"
      ) {
        throw new Error(
          "Legacy or non-canonical local PostgreSQL configuration detected. Solpient Local now uses solpient-money-postgres at 127.0.0.1:5432. Run npm run local:repair, then npm run local:doctor."
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Legacy or non-canonical")
      ) {
        throw error;
      }

      throw new Error(
        "DATABASE_URL is invalid. Run npm run local:repair."
      );
    }
  }

  return value;
}

export function isLocalDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}
