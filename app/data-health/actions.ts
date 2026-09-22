"use server";

import { revalidatePath } from "next/cache";
import { runTruthEngineForHousehold } from "@/lib/truth-engine";

export async function runTruthEngine() {
  await runTruthEngineForHousehold();
  revalidatePath("/data-health");
  revalidatePath("/", "layout");
}
