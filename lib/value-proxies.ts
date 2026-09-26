/**
 * Automatic value proxies — no manual entry, no API keys.
 *
 * True intrinsic value is the investor's own judgment and can't be
 * downloaded. What CAN be pulled for free is the context around price:
 * dividend yield (from the dividend engine), distance from the 52-week
 * high, and where the analyst consensus target sits relative to price.
 * Those three are honest, automatic "cheap or expensive?" proxies.
 *
 * Source: Nasdaq's public quote summary feed (no key). P/E and deeper
 * fundamentals need authenticated APIs, so they are deliberately out of
 * scope — the proxies below are labeled for what they are.
 */

import { normalizeTicker } from "./market-prices";
import { requireActiveHousehold } from "./money-auth";
import type { Holding } from "./demo-data";

export const VALUE_SOURCE_LABEL = "Nasdaq";

export type ValueSnapshot = {
  ticker: string;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  analystTarget: number | null;
  sector: string | null;
  industry: string | null;
};

export type ValueSignal =
  | "high-yield"
  | "deep-discount"
  | "off-high"
  | "analyst-upside"
  | "above-target";

export type ValueRow = {
  ticker: string;
  name: string;
  price: number;
  marketValue: number;
  yieldPct: number | null;
  belowHighPct: number | null;
  targetGapPct: number | null;
  sector: string | null;
  signals: ValueSignal[];
};

export type ValueCheck = {
  rows: ValueRow[];
  highYieldCount: number;
  discountCount: number;
  fetchedAt: string | null;
};

const NASDAQ_HOSTS = ["https://api.nasdaq.com"];

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

function parseMoney(value: unknown): number | null {
  const num = Number(
    String(value ?? "")
      .replace(/[$,]/g, "")
      .trim()
  );
  return Number.isFinite(num) && num > 0
    ? num
    : null;
}

function parseHighLow(
  value: unknown
): [number | null, number | null] {
  const parts = String(value ?? "").split("/");
  if (parts.length !== 2)
    return [null, null];
  return [
    parseMoney(parts[0]),
    parseMoney(parts[1]),
  ];
}

/**
 * Parse one Nasdaq quote-summary payload into a ValueSnapshot.
 * Returns null when the payload has no usable summary block.
 */
export function parseNasdaqSummary(
  ticker: string,
  payload: unknown
): ValueSnapshot | null {
  const summary = (
    payload as {
      data?: {
        summaryData?: Record<
          string,
          { value?: unknown }
        >;
      };
    } | null
  )?.data?.summaryData;

  if (!summary) return null;

  const [high, low] = parseHighLow(
    summary.FiftTwoWeekHighLow?.value
  );

  const targetRaw = String(
    summary.OneYrTarget?.value ?? ""
  ).trim();
  const sectorRaw = String(
    summary.Sector?.value ?? ""
  ).trim();
  const industryRaw = String(
    summary.Industry?.value ?? ""
  ).trim();

  return {
    ticker,
    fiftyTwoWeekHigh: high,
    fiftyTwoWeekLow: low,
    analystTarget:
      /^n\/a$/i.test(targetRaw) || !targetRaw
        ? null
        : parseMoney(targetRaw),
    sector:
      sectorRaw && !/^n\/a$/i.test(sectorRaw)
        ? sectorRaw
        : null,
    industry:
      industryRaw &&
      !/^n\/a$/i.test(industryRaw)
        ? industryRaw
        : null,
  };
}

async function fetchValueSnapshotForTicker(
  ticker: string
): Promise<ValueSnapshot | null> {
  for (const host of NASDAQ_HOSTS) {
    try {
      const response = await fetch(
        `${host}/api/quote/${encodeURIComponent(ticker)}/summary?assetclass=stocks`,
        {
          headers: {
            "User-Agent": BROWSER_USER_AGENT,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!response.ok) continue;

      const payload: unknown =
        await response.json();
      const snapshot = parseNasdaqSummary(
        ticker,
        payload
      );

      if (snapshot) return snapshot;
    } catch {
      /* Fall through to the next host. */
    }
  }

  return null;
}

export async function fetchValueSnapshots(
  tickers: string[]
): Promise<ValueSnapshot[]> {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const raw of tickers) {
    const ticker = normalizeTicker(raw);
    if (ticker && !seen.has(ticker)) {
      seen.add(ticker);
      unique.push(ticker);
    }
  }

  const snapshots: ValueSnapshot[] = [];
  const CONCURRENCY = 4;

  for (
    let index = 0;
    index < unique.length;
    index += CONCURRENCY
  ) {
    const batch = unique.slice(
      index,
      index + CONCURRENCY
    );
    const settled = await Promise.all(
      batch.map(fetchValueSnapshotForTicker)
    );

    for (const snapshot of settled) {
      if (snapshot) snapshots.push(snapshot);
    }
  }

  return snapshots;
}

export function signalLabel(
  signal: ValueSignal
): string {
  if (signal === "high-yield")
    return "High yield";
  if (signal === "deep-discount")
    return "20%+ off high";
  if (signal === "off-high") return "Off high";
  if (signal === "analyst-upside")
    return "Analyst upside";
  return "Above target";
}

/**
 * Pure builder: holdings + dividend yields + value snapshots →
 * per-holding value proxies, sorted by distance from the 52-week high
 * (the value investor's lens: farthest from highs first).
 */
export function buildValueCheck(
  holdings: Holding[],
  yieldByTicker: Map<string, number | null>,
  snapshots: ValueSnapshot[]
): ValueCheck {
  const snapshotByTicker = new Map(
    snapshots.map((s) => [s.ticker, s])
  );

  const rows: ValueRow[] = [];

  for (const holding of holdings) {
    if (holding.kind === "cash") continue;

    const ticker = String(
      holding.ticker ?? ""
    )
      .trim()
      .toUpperCase();
    const snapshot =
      snapshotByTicker.get(ticker);
    if (!snapshot) continue;

    const price = Number(holding.price ?? 0);
    if (!Number.isFinite(price) || price <= 0)
      continue;

    const marketValue = Number(
      holding.value ?? 0
    );
    const yieldPct =
      yieldByTicker.get(ticker) ?? null;

    const belowHighPct =
      snapshot.fiftyTwoWeekHigh != null &&
      snapshot.fiftyTwoWeekHigh > 0
        ? ((snapshot.fiftyTwoWeekHigh - price) /
            snapshot.fiftyTwoWeekHigh) *
          100
        : null;

    const targetGapPct =
      snapshot.analystTarget != null &&
      snapshot.analystTarget > 0
        ? ((snapshot.analystTarget - price) /
            price) *
          100
        : null;

    const signals: ValueSignal[] = [];
    if (yieldPct != null && yieldPct >= 4) {
      signals.push("high-yield");
    }
    if (
      belowHighPct != null &&
      belowHighPct >= 20
    ) {
      signals.push("deep-discount");
    } else if (
      belowHighPct != null &&
      belowHighPct >= 10
    ) {
      signals.push("off-high");
    }
    if (
      targetGapPct != null &&
      targetGapPct >= 15
    ) {
      signals.push("analyst-upside");
    } else if (
      targetGapPct != null &&
      targetGapPct <= -10
    ) {
      signals.push("above-target");
    }

    rows.push({
      ticker,
      name: String(holding.name ?? ticker),
      price,
      marketValue,
      yieldPct,
      belowHighPct,
      targetGapPct,
      sector: snapshot.sector,
      signals,
    });
  }

  rows.sort(
    (a, b) =>
      (b.belowHighPct ?? -Infinity) -
      (a.belowHighPct ?? -Infinity)
  );

  return {
    rows,
    highYieldCount: rows.filter((r) =>
      r.signals.includes("high-yield")
    ).length,
    discountCount: rows.filter(
      (r) =>
        r.signals.includes("deep-discount") ||
        r.signals.includes("off-high")
    ).length,
    fetchedAt: null,
  };
}

export async function getValueCheck(
  holdings: Holding[],
  yieldByTicker: Map<string, number | null>
): Promise<ValueCheck> {
  try {
    const { database, householdId } =
      await requireActiveHousehold();

    const cached = await database
      .from("value_snapshot_cache")
      .select(
        "ticker,fifty_two_week_high,fifty_two_week_low,analyst_target,sector,industry,fetched_at"
      )
      .eq("household_id", householdId);

    if (cached.error || !cached.data?.length) {
      return buildValueCheck(
        holdings,
        yieldByTicker,
        []
      );
    }

    let fetchedAt: string | null = null;

    const snapshots: ValueSnapshot[] = (
      cached.data as Array<{
        ticker: string;
        fifty_two_week_high: number | null;
        fifty_two_week_low: number | null;
        analyst_target: number | null;
        sector: string | null;
        industry: string | null;
        fetched_at: string | null;
      }>
    ).map((row) => {
      if (
        !fetchedAt ||
        (row.fetched_at != null &&
          row.fetched_at > fetchedAt)
      ) {
        fetchedAt = row.fetched_at;
      }

      return {
        ticker: String(
          row.ticker ?? ""
        ).toUpperCase(),
        fiftyTwoWeekHigh:
          row.fifty_two_week_high != null
            ? Number(row.fifty_two_week_high)
            : null,
        fiftyTwoWeekLow:
          row.fifty_two_week_low != null
            ? Number(row.fifty_two_week_low)
            : null,
        analystTarget:
          row.analyst_target != null
            ? Number(row.analyst_target)
            : null,
        sector: row.sector,
        industry: row.industry,
      };
    });

    const check = buildValueCheck(
      holdings,
      yieldByTicker,
      snapshots
    );
    check.fetchedAt = fetchedAt;

    return check;
  } catch {
    return buildValueCheck(
      holdings,
      yieldByTicker,
      []
    );
  }
}
