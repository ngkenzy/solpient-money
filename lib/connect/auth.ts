import { createClient } from "@/lib/supabase/server";

export class ConnectAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "ConnectAuthError";
    this.status = status;
  }
}

export async function getConnectHouseholdContext() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;

  if (!userId) throw new ConnectAuthError("Authentication required.", 401);

  const [{ data: pref }, { data: membership }] = await Promise.all([
    supabase
      .from("user_preferences")
      .select("active_household_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const householdId =
    (pref?.active_household_id as string | null | undefined) ??
    (membership?.household_id as string | null | undefined) ??
    null;

  if (!householdId) {
    throw new ConnectAuthError("Create a Money household before importing files.", 409);
  }

  return { supabase, userId, householdId };
}
