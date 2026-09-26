import "server-only";

import { requireActiveHousehold } from "@/lib/money-auth";
import { getCashFlowIntelligence } from "@/lib/cash-flow-intelligence";
import { localCalendarDateKey } from "@/lib/local-calendar-date";

export type DriftTransaction = {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  type: "income" | "expense";
};

export type DriftMonthBar = {
  key: string;
  label: string;
  total: number;
};

export type DriftSignal = {
  id: string;
  kind: "creep" | "new";
  merchant: string;
  category: string;
  latest: number;
  baseline: number | null;
  changePct: number | null;
  level: "watch" | "high";
  detail: string;
  months: DriftMonthBar[];
};

const CREEP_MIN_BASELINE = 50;
const CREEP_MIN_DELTA = 75;
const CREEP_RATIO = 1.5;
const NEW_WINDOW_DAYS = 45;
const NEW_MIN_TRANSACTIONS = 2;
const NEW_MIN_TOTAL = 50;
const MAX_SIGNALS = 8;

function monthLabel(key: string): string {
  const date = new Date(`${key}-15T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

function fullMonthKeys(todayKey: string, count: number): string[] {
  const [y, m] = todayKey.split("-").map(Number);
  const keys: string[] = [];
  // Start from the latest *full* month (exclude the partial current month).
  let year = m === 1 ? y - 1 : y;
  let month = m === 1 ? 12 : m - 1;
  for (let i = 0; i < count; i += 1) {
    keys.unshift(
      `${year}-${String(month).padStart(2, "0")}`
    );
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  return keys;
}

/*
 * Two signals the existing alerts don't cover:
 *  - creep: a familiar merchant's latest full-month total is up sharply
 *    versus its own prior 3-month average (gradual increases, not one-offs).
 *  - new: a merchant that never appeared before is suddenly a regular
 *    (2+ charges totaling $50+ in the last 45 days).
 * Known recurring bills/subscriptions are excluded — their price changes
 * are already covered by Bills Radar.
 */
export function buildSpendingDrift(
  transactions: DriftTransaction[],
  recurringMerchants: Set<string>,
  todayKey: string
): DriftSignal[] {
  const expenses = transactions.filter(
    (t) =>
      t.type === "expense" &&
      /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
      t.amount > 0
  );

  const monthKeys = fullMonthKeys(todayKey, 4);
  const latestKey = monthKeys[monthKeys.length - 1];
  const priorKeys = monthKeys.slice(0, -1);

  const byMerchant = new Map<
    string,
    {
      name: string;
      category: string;
      latestDate: string;
      rows: DriftTransaction[];
    }
  >();
  for (const t of expenses) {
    const key = t.merchant.toLowerCase();
    const entry = byMerchant.get(key);
    if (entry) {
      entry.rows.push(t);
      // Prefer the most recent transaction's display name/casing.
      if (t.date >= entry.latestDate) {
        entry.name = t.merchant;
        entry.category = t.category;
        entry.latestDate = t.date;
      }
    } else {
      byMerchant.set(key, {
        name: t.merchant,
        category: t.category,
        latestDate: t.date,
        rows: [t],
      });
    }
  }

  const monthlyTotals = (
    rows: DriftTransaction[],
    keys: string[]
  ): DriftMonthBar[] =>
    keys.map((key) => ({
      key,
      label: monthLabel(key),
      total: rows
        .filter((r) => r.date.slice(0, 7) === key)
        .reduce((sum, r) => sum + r.amount, 0),
    }));

  const signals: DriftSignal[] = [];
  const todayMs = new Date(`${todayKey}T12:00:00Z`).getTime();
  const windowStartMs = todayMs - NEW_WINDOW_DAYS * 86_400_000;

  for (const [key, entry] of byMerchant) {
    if (recurringMerchants.has(key)) continue;

    const months = monthlyTotals(entry.rows, monthKeys);
    const priorTotals = months
      .slice(0, -1)
      .map((m) => m.total)
      .filter((total) => total > 10);

    // --- creep: latest full month vs prior-3-month average ---
    if (priorTotals.length >= 2) {
      const baseline =
        priorTotals.reduce((a, b) => a + b, 0) / priorTotals.length;
      const latest = months[months.length - 1].total;
      if (
        baseline >= CREEP_MIN_BASELINE &&
        latest >= baseline * CREEP_RATIO &&
        latest - baseline >= CREEP_MIN_DELTA
      ) {
        const changePct = ((latest - baseline) / baseline) * 100;
        signals.push({
          id: `creep:${key}`,
          kind: "creep",
          merchant: entry.name,
          category: entry.category,
          latest,
          baseline,
          changePct,
          level: latest >= baseline * 2 ? "high" : "watch",
          detail: `Up ${Math.round(changePct)}% vs its prior 3-month average — a gradual increase, not a one-off.`,
          months,
        });
        continue;
      }
    }

    // --- new: first seen inside the window, already a pattern ---
    const firstDate = entry.rows.reduce(
      (min, r) => (r.date < min ? r.date : min),
      entry.rows[0].date
    );
    const firstMs = new Date(`${firstDate}T12:00:00Z`).getTime();
    const recentRows = entry.rows.filter(
      (r) => new Date(`${r.date}T12:00:00Z`).getTime() >= windowStartMs
    );
    const recentTotal = recentRows.reduce((s, r) => s + r.amount, 0);
    if (
      firstMs >= windowStartMs &&
      recentRows.length >= NEW_MIN_TRANSACTIONS &&
      recentTotal >= NEW_MIN_TOTAL
    ) {
      signals.push({
        id: `new:${key}`,
        kind: "new",
        merchant: entry.name,
        category: entry.category,
        latest: recentTotal,
        baseline: null,
        changePct: null,
        level: recentTotal >= 200 ? "high" : "watch",
        detail: `First seen ${firstDate} — ${recentRows.length} charges totaling ${recentTotal.toFixed(0)} in the last ${NEW_WINDOW_DAYS} days.`,
        months: [],
      });
    }
  }

  return signals
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === "high" ? -1 : 1;
      return b.latest - (b.baseline ?? 0) - (a.latest - (a.baseline ?? 0));
    })
    .slice(0, MAX_SIGNALS);
}

export async function getSpendingDrift(
  now = new Date()
): Promise<DriftSignal[]> {
  const todayKey = localCalendarDateKey(now);
  const [{ supabase, householdId }, intelligence] = await Promise.all([
    requireActiveHousehold(),
    getCashFlowIntelligence(),
  ]);

  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id,posted_at,merchant,normalized_merchant,category,truth_category,amount_cents,transaction_type,detected_transfer,duplicate_of_transaction_id"
    )
    .eq("household_id", householdId)
    .order("posted_at", { ascending: true })
    .limit(5000);

  if (error) {
    throw new Error(`Spending drift query failed: ${error.message}`);
  }

  const transactions: DriftTransaction[] = (
    (data ?? []) as Record<string, unknown>[]
  )
    .filter(
      (row) =>
        !row.detected_transfer &&
        !row.duplicate_of_transaction_id
    )
    .map((row) => {
      const raw = String(row.posted_at ?? "");
      const date = /^\d{4}-\d{2}-\d{2}/.test(raw)
        ? raw.slice(0, 10)
        : "";
      const amount = Number(row.amount_cents ?? 0) / 100;
      return {
        id: String(row.id),
        date,
        merchant: String(
          row.normalized_merchant ?? row.merchant ?? "Unknown"
        ),
        category: String(
          row.truth_category ?? row.category ?? "Uncategorized"
        ),
        amount: Math.abs(Number.isFinite(amount) ? amount : 0),
        type: (row.detected_transfer
          ? "transfer"
          : row.transaction_type) as DriftTransaction["type"],
      };
    })
    .filter((t) => t.date && t.type === "expense");

  const recurringMerchants = new Set(
    intelligence.recurring
      .filter((item) => item.kind !== "income")
      .map((item) => item.merchant.toLowerCase())
  );

  return buildSpendingDrift(transactions, recurringMerchants, todayKey);
}
