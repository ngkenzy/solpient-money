"use server";

import { revalidatePath } from "next/cache";
import { saveCurrentMonthBaseline } from "@/lib/plan-monitor-engine";

function refreshPaths() {
  revalidatePath("/monitor");
  revalidatePath("/plan");
  revalidatePath("/copilot");
  revalidatePath("/health");
  revalidatePath("/", "layout");
}

export async function refreshPlanMonitoring() {
  refreshPaths();
}

export async function resetPlanMonitoringBaseline() {
  await saveCurrentMonthBaseline({ overwrite: true });
  refreshPaths();
}
