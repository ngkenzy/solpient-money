export const LOCAL_USER_ID =
  "00000000-0000-0000-0000-000000000001";
export const LOCAL_USER_EMAIL =
  process.env.SOLPIENT_LOCAL_USER_EMAIL?.trim() ||
  "local@solpient.local";

export function getDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "DATABASE_URL is not configured. Run npm run local:setup."
    );
  }
  return value;
}

export function isLocalDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}
