import "server-only";

import {
  getCashFlowIntelligence,
  type RecurringCashFlow,
} from "@/lib/cash-flow-intelligence";
import { localCalendarDateKey } from "@/lib/local-calendar-date";

export type RadarBill = {
  key: string;
  merchant: string;
  category: string;
  kind: "bill" | "subscription";
  cadence: RecurringCashFlow["cadence"];
  expectedAmount: number;
  expectedDate: string;
  daysUntil: number;
  lastDate: string;
  priceJumpPct: number | null;
  priorAmount: number | null;
};

export type BillsRadar = {
  dueSoon: RadarBill[];
  priceJumps: RadarBill[];
  dueSoonTotal: number;
  asOf: string;
};

const DUE_WINDOW_DAYS = 14;
const NOT_SEEN_GRACE_DAYS = 7;
const PRICE_JUMP_THRESHOLD = 1.15;

function parseDateKey(value: string): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return null;

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    )
  );

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(
  dateKey: string,
  days: number
): string | null {
  const date = parseDateKey(dateKey);

  if (!date) return null;

  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function diffDays(
  fromKey: string,
  toKey: string
): number | null {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);

  if (!from || !to) return null;

  return Math.round(
    (to.getTime() - from.getTime()) /
      86_400_000
  );
}

function todayKey(now = new Date()): string {
  return localCalendarDateKey(now);
}

/*
 * Turns detected recurring bills/subscriptions into a forward-looking radar:
 * what's due in the next 14 days (including charges expected up to a week ago
 * that haven't appeared yet) and which bills recently jumped in price.
 */
export function buildBillsRadar(
  recurring: RecurringCashFlow[],
  today: string
): BillsRadar {
  const dueSoon: RadarBill[] = [];
  const priceJumps: RadarBill[] = [];

  for (const item of recurring) {
    if (
      item.kind !== "bill" &&
      item.kind !== "subscription"
    ) {
      continue;
    }

    const gapDays = Math.max(
      1,
      Math.round(item.medianGapDays)
    );

    const expectedDate = addDays(
      item.lastDate,
      gapDays
    );

    if (!expectedDate) continue;

    const daysUntil = diffDays(
      today,
      expectedDate
    );

    if (daysUntil === null) continue;

    let priceJumpPct: number | null =
      null;

    if (
      item.priorAverageAmount !== null &&
      item.priorAverageAmount > 0 &&
      item.occurrences >= 3 &&
      item.lastAmount >
        item.priorAverageAmount *
          PRICE_JUMP_THRESHOLD
    ) {
      priceJumpPct =
        ((item.lastAmount -
          item.priorAverageAmount) /
          item.priorAverageAmount) *
        100;
    }

    const bill: RadarBill = {
      key: item.key,
      merchant: item.merchant,
      category: item.category,
      kind: item.kind,
      cadence: item.cadence,
      expectedAmount: item.averageAmount,
      expectedDate,
      daysUntil,
      lastDate: item.lastDate,
      priceJumpPct,
      priorAmount:
        priceJumpPct !== null
          ? item.priorAverageAmount
          : null,
    };

    if (
      daysUntil <= DUE_WINDOW_DAYS &&
      daysUntil >= -NOT_SEEN_GRACE_DAYS
    ) {
      dueSoon.push(bill);
    }

    if (priceJumpPct !== null) {
      priceJumps.push(bill);
    }
  }

  dueSoon.sort(
    (a, b) =>
      a.daysUntil - b.daysUntil ||
      b.expectedAmount - a.expectedAmount
  );

  priceJumps.sort(
    (a, b) =>
      (b.priceJumpPct ?? 0) -
      (a.priceJumpPct ?? 0)
  );

  return {
    dueSoon,
    priceJumps,
    dueSoonTotal: dueSoon.reduce(
      (sum, bill) => sum + bill.expectedAmount,
      0
    ),
    asOf: today,
  };
}

export async function getBillsRadar(
  now = new Date()
): Promise<BillsRadar> {
  const intelligence =
    await getCashFlowIntelligence();

  return buildBillsRadar(
    intelligence.recurring,
    todayKey(now)
  );
}
