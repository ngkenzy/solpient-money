import { redirect } from "next/navigation";
import {
  createLocalDbClient,
  testLocalDatabase,
} from "@/lib/local-db/client";
import {
  isLocalDatabaseConfigured,
  LOCAL_USER_EMAIL,
  LOCAL_USER_ID,
} from "@/lib/local-db/config";

export async function requireAuthenticatedMoneyUser() {
  if (!isLocalDatabaseConfigured()) {
    throw new Error(
      "Solpient Local PostgreSQL is not configured. Run npm run local:setup."
    );
  }

  await testLocalDatabase();
  const database = await createLocalDbClient();

  return {
    database,
    // Compatibility alias while the connector/data layers are migrated.
    // This is a local PostgreSQL client, not Supabase.
    supabase: database,
    userId: LOCAL_USER_ID,
    email: LOCAL_USER_EMAIL,
  };
}

export async function requireActiveHousehold() {
  const {
    database,
    supabase,
    userId,
    email,
  } = await requireAuthenticatedMoneyUser();

  const [{ data: pref }, { data: membership }] =
    await Promise.all([
      database
        .from("user_preferences")
        .select("active_household_id")
        .eq("user_id", userId)
        .maybeSingle(),
      database
        .from("household_members")
        .select("household_id")
        .eq("user_id", userId)
        .order("created_at", {
          ascending: true,
        })
        .limit(1)
        .maybeSingle(),
    ]);

  const householdId =
    (pref?.active_household_id as
      | string
      | null
      | undefined) ??
    (membership?.household_id as
      | string
      | null
      | undefined) ??
    null;

  if (!householdId) {
    redirect("/setup");
  }

  return {
    database,
    supabase,
    userId,
    email,
    householdId,
  };
}
