"use server";

import { revalidatePath } from "next/cache";
import { setMoneyActionStatus } from "@/lib/money-action-center";

function idFrom(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    throw new Error("Action item id is required.");
  }
  return id;
}

function refresh() {
  revalidatePath("/action-center");
  revalidatePath("/autopilot");
}

export async function reviewAction(formData: FormData) {
  await setMoneyActionStatus({
    id: idFrom(formData),
    status: "reviewed",
  });
  refresh();
}

export async function snoozeAction(formData: FormData) {
  const days = Number(formData.get("days") ?? 1);
  await setMoneyActionStatus({
    id: idFrom(formData),
    status: "snoozed",
    snoozeDays:
      Number.isFinite(days) ? days : 1,
  });
  refresh();
}

export async function resolveAction(formData: FormData) {
  await setMoneyActionStatus({
    id: idFrom(formData),
    status: "resolved",
  });
  refresh();
}

export async function reopenAction(formData: FormData) {
  await setMoneyActionStatus({
    id: idFrom(formData),
    status: "new",
  });
  refresh();
}
