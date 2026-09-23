export const LOCAL_USER_ID =
  "00000000-0000-0000-0000-000000000001";
export const LOCAL_USER_EMAIL =
  process.env.SOLPIENT_LOCAL_USER_EMAIL?.trim() ||
  "local@solpient.local";

function parsePort(value: string | undefined) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 1024 && parsed < 65536
    ? parsed
    : null;
}

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
      const port = parsePort(parsed.port || "5432");
      const expectedPort = parsePort(
        process.env.SOLPIENT_DB_PORT
      );
      const database = parsed.pathname.replace(/^\//, "");

      if (
        parsed.hostname !== "127.0.0.1" ||
        !expectedPort ||
        port !== expectedPort ||
        database !== "solpient" ||
        decodeURIComponent(parsed.username) !== "solpient"
      ) {
        throw new Error(
          "Legacy or non-canonical local PostgreSQL configuration detected. Run npm run local:repair, then npm run local:doctor."
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
