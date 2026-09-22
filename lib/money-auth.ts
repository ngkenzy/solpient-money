import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMoneySupabaseConfigured } from "@/lib/supabase/config";

export async function requireAuthenticatedMoneyUser() {
  if (!isMoneySupabaseConfigured()) {
    throw new Error("Solpient Money Supabase is not configured.");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const email = typeof claims?.email === "string" ? claims.email : null;

  if (!userId) redirect("/login");

  return { supabase, userId, email };
}

export async function requireActiveHousehold() {
  const { supabase, userId, email } = await requireAuthenticatedMoneyUser();

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

  if (!householdId) redirect("/setup");

  return { supabase, userId, email, householdId };
}
