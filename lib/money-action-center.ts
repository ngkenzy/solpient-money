import "server-only";

import { requireActiveHousehold } from "@/lib/money-auth";
import type {
  AutopilotAlert,
  AutopilotLevel,
} from "@/lib/money-autopilot";

export type ActionStatus =
  | "new"
  | "reviewed"
  | "snoozed"
  | "resolved";

export type MoneyActionItem = {
  id: string;
  sourceKey: string;
  category: string;
  severity: Extract<AutopilotLevel, "critical" | "watch">;
  status: ActionStatus;
  title: string;
  detail: string;
  href: string;
  firstSeenAt: string;
  lastSeenAt: string;
  reviewedAt: string | null;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
};

type ActionRow = {
  id: unknown;
  source_key: unknown;
  category: unknown;
  severity: unknown;
  status: unknown;
  title: unknown;
  detail: unknown;
  href: unknown;
  first_seen_at: unknown;
  last_seen_at: unknown;
  reviewed_at: unknown;
  snoozed_until: unknown;
  resolved_at: unknown;
  resolution_reason: unknown;
};

function text(value: unknown) {
  return String(value ?? "");
}

function isoOrNull(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function rowToItem(row: ActionRow): MoneyActionItem {
  return {
    id: text(row.id),
    sourceKey: text(row.source_key),
    category: text(row.category),
    severity:
      row.severity === "critical" ? "critical" : "watch",
    status:
      row.status === "reviewed" ||
      row.status === "snoozed" ||
      row.status === "resolved"
        ? row.status
        : "new",
    title: text(row.title),
    detail: text(row.detail),
    href: text(row.href) || "/autopilot",
    firstSeenAt: isoOrNull(row.first_seen_at) ?? "",
    lastSeenAt: isoOrNull(row.last_seen_at) ?? "",
    reviewedAt: isoOrNull(row.reviewed_at),
    snoozedUntil: isoOrNull(row.snoozed_until),
    resolvedAt: isoOrNull(row.resolved_at),
    resolutionReason:
      row.resolution_reason == null
        ? null
        : text(row.resolution_reason),
  };
}

function activeMaterialAlerts(alerts: AutopilotAlert[]) {
  return alerts.filter(
    (
      alert
    ): alert is AutopilotAlert & {
      level: "critical" | "watch";
    } =>
      alert.level === "critical" ||
      alert.level === "watch"
  );
}

export async function syncActionCenterFromAlerts(
  alerts: AutopilotAlert[],
  observedAt = new Date().toISOString()
) {
  const { supabase, householdId } =
    await requireActiveHousehold();
  const material = activeMaterialAlerts(alerts);
  const activeKeys = new Set(
    material.map((alert) => alert.id)
  );

  const { data: existingRows, error: existingError } =
    await supabase
      .from("money_action_items")
      .select("*")
      .eq("household_id", householdId);

  if (existingError) {
    throw new Error(
      `Unable to read Action Center: ${existingError.message}`
    );
  }

  const existingByKey = new Map(
    ((existingRows ?? []) as ActionRow[]).map(
      (row) => [text(row.source_key), row]
    )
  );

  for (const alert of material) {
    const existing = existingByKey.get(alert.id);
    const snoozedUntil = existing
      ? isoOrNull(existing.snoozed_until)
      : null;
    const snoozeActive =
      existing?.status === "snoozed" &&
      snoozedUntil != null &&
      new Date(snoozedUntil).getTime() >
        new Date(observedAt).getTime();

    let status: ActionStatus = "new";

    if (snoozeActive) {
      status = "snoozed";
    } else if (existing?.status === "reviewed") {
      status = "reviewed";
    } else if (existing?.status === "new") {
      status = "new";
    } else if (existing?.status === "resolved") {
      status = "new";
    }

    const payload = {
      household_id: householdId,
      source_key: alert.id,
      source_type: "autopilot",
      category: alert.category,
      severity: alert.level,
      status,
      title: alert.title,
      detail: alert.detail,
      href: alert.href,
      first_seen_at:
        existing?.first_seen_at ?? observedAt,
      last_seen_at: observedAt,
      reviewed_at:
        status === "reviewed"
          ? existing?.reviewed_at ?? observedAt
          : null,
      snoozed_until:
        status === "snoozed"
          ? snoozedUntil
          : null,
      resolved_at: null,
      resolution_reason: null,
      source_payload: alert,
      updated_at: observedAt,
    };

    const { error } = await supabase
      .from("money_action_items")
      .upsert(payload, {
        onConflict: "household_id,source_key",
      });

    if (error) {
      throw new Error(
        `Unable to sync Action Center item ${alert.id}: ${error.message}`
      );
    }
  }

  for (const row of (existingRows ?? []) as ActionRow[]) {
    const sourceKey = text(row.source_key);
    const status = text(row.status);

    if (
      status !== "resolved" &&
      !activeKeys.has(sourceKey)
    ) {
      const { error } = await supabase
        .from("money_action_items")
        .update({
          status: "resolved",
          resolved_at: observedAt,
          resolution_reason: "condition_cleared",
          snoozed_until: null,
          updated_at: observedAt,
        })
        .eq("id", text(row.id))
        .eq("household_id", householdId);

      if (error) {
        throw new Error(
          `Unable to auto-resolve Action Center item ${sourceKey}: ${error.message}`
        );
      }
    }
  }

  return {
    materialCount: material.length,
    criticalCount: material.filter(
      (alert) => alert.level === "critical"
    ).length,
    watchCount: material.filter(
      (alert) => alert.level === "watch"
    ).length,
  };
}

export async function getMoneyActionCenter() {
  const { supabase, householdId } =
    await requireActiveHousehold();
  const { data, error } = await supabase
    .from("money_action_items")
    .select("*")
    .eq("household_id", householdId)
    .order("last_seen_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(
      `Unable to load Action Center: ${error.message}`
    );
  }

  const now = Date.now();
  const items = ((data ?? []) as ActionRow[])
    .map(rowToItem)
    .map((item) => {
      if (
        item.status === "snoozed" &&
        item.snoozedUntil &&
        new Date(item.snoozedUntil).getTime() <= now
      ) {
        return {
          ...item,
          status: "new" as const,
          snoozedUntil: null,
        };
      }
      return item;
    });

  const rank = {
    critical: 2,
    watch: 1,
  };

  items.sort((a, b) => {
    const aOpen = a.status === "resolved" ? 0 : 1;
    const bOpen = b.status === "resolved" ? 0 : 1;
    if (aOpen !== bOpen) return bOpen - aOpen;
    if (rank[a.severity] !== rank[b.severity]) {
      return rank[b.severity] - rank[a.severity];
    }
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });

  const open = items.filter(
    (item) => item.status !== "resolved"
  );
  const visible = open.filter((item) => {
    if (item.status !== "snoozed") return true;
    if (!item.snoozedUntil) return true;
    return new Date(item.snoozedUntil).getTime() <= now;
  });

  return {
    items,
    open,
    visible,
    counts: {
      totalOpen: open.length,
      new: open.filter(
        (item) => item.status === "new"
      ).length,
      reviewed: open.filter(
        (item) => item.status === "reviewed"
      ).length,
      snoozed: open.filter(
        (item) => item.status === "snoozed"
      ).length,
      critical: open.filter(
        (item) => item.severity === "critical"
      ).length,
      watch: open.filter(
        (item) => item.severity === "watch"
      ).length,
      resolved: items.filter(
        (item) => item.status === "resolved"
      ).length,
    },
  };
}

export async function setMoneyActionStatus({
  id,
  status,
  snoozeDays = 1,
}: {
  id: string;
  status: "new" | "reviewed" | "snoozed" | "resolved";
  snoozeDays?: number;
}) {
  const { supabase, householdId } =
    await requireActiveHousehold();
  const now = new Date();
  const payload: Record<string, unknown> = {
    status,
    updated_at: now.toISOString(),
  };

  if (status === "reviewed") {
    payload.reviewed_at = now.toISOString();
    payload.snoozed_until = null;
    payload.resolved_at = null;
    payload.resolution_reason = null;
  } else if (status === "snoozed") {
    const safeDays = Math.max(
      1,
      Math.min(30, Math.round(snoozeDays))
    );
    payload.snoozed_until = new Date(
      now.getTime() + safeDays * 86_400_000
    ).toISOString();
    payload.resolved_at = null;
    payload.resolution_reason = null;
  } else if (status === "resolved") {
    payload.resolved_at = now.toISOString();
    payload.resolution_reason = "user_resolved";
    payload.snoozed_until = null;
  } else {
    payload.reviewed_at = null;
    payload.snoozed_until = null;
    payload.resolved_at = null;
    payload.resolution_reason = null;
  }

  const { error } = await supabase
    .from("money_action_items")
    .update(payload)
    .eq("id", id)
    .eq("household_id", householdId);

  if (error) {
    throw new Error(
      `Unable to update Action Center item: ${error.message}`
    );
  }
}
