"use server";

import { revalidatePath } from "next/cache";
import { requireActiveHousehold } from "@/lib/money-auth";

const MAX_NOTE_LENGTH = 2000;

/**
 * Save a per-ticker note. Notes are stored as intent-only investment_decisions
 * rows (decision_type "no_action") and never execute trades.
 */
export async function saveTickerNote(tickerSlug: string, formData: FormData) {
  const note = String(formData.get("note") ?? "").trim().slice(0, MAX_NOTE_LENGTH);
  const { supabase, householdId } = await requireActiveHousehold();
  const ticker = tickerSlug.toUpperCase();

  if (note) {
    const { error } = await supabase.from("investment_decisions").insert({
      household_id: householdId,
      ticker,
      decision_type: "no_action",
      note,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/portfolio/${tickerSlug.toLowerCase()}`);
}
