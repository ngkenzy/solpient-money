import {
  isLocalDatabaseConfigured,
  getDatabaseUrl,
} from "@/lib/local-db/config";

export function isMoneySupabaseConfigured() {
  return isLocalDatabaseConfigured();
}

export function getMoneySupabaseConfig() {
  if (!isLocalDatabaseConfigured()) return null;
  return {
    url: getDatabaseUrl(),
    publishableKey: "local-postgresql",
  };
}
