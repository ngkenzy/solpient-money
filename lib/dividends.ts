/**
 * Automatic dividend intelligence — no manual entry.
 *
 * Declared dividend history is pulled from the same free Yahoo Finance
 * chart feed the app already uses for prices (`events=div`). From that
 * history the engine detects each payer's frequency, projects the next
 * 12 months of payments (declared announcements vs. projected pattern),
 * and rolls everything into household dividend income.
 *
 * Everything here is read-only market data. Nothing trades, nothing moves.
 */

import { normalizeTicker } from "./market-prices";
import { requireActiveHousehold } from "./money-auth";
import type { Holding } from "./demo-data";

export const DIVIDEND_SOURCE_LABEL = "Yahoo Finance";

export type DividendFrequency =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "irregular"
  | "unknown";

export type DividendEvent = {
  /** Ex-dividend date as a unix timestamp (seconds). */
  exDate: number;
  /** Amount per share in the listing currency. */
  amount: number;
  /** Payment date as a unix timestamp (seconds), when Yahoo reports it. */
  payDate: number | null;
};

export type ProjectedDividend = {
  exDate: string;
  payDate: string;
  amountPerShare: number;
  /** True when the payment was announced in the feed; false when projected from the pattern. */
  declared: boolean;
};

export type DividendPayer = {
  ticker: string;
  name: string;
  shares: number;
  price: number;
  marketValue: number;
  frequency: DividendFrequency;
  annualPerShare: number;
  annualIncome: number;
  yieldPct: number | null;
  nextExDate: string | null;
  nextPayDate: string | null;
  payments: ProjectedDividend[];
};

export type DividendMonthBucket = {
  monthKey: string;
  label: string;
  declared: number;
  projected: number;
};

export type DividendIntelligence = {
  payers: DividendPayer[];
  payerCount: number;
  annualIncome: number;
  monthlyAverage: number;
  portfolioYieldPct: number | null;
  months: DividendMonthBucket[];
  upcoming: Array<{
    ticker: string;
    exDate: string;
    payDate: string;
    amount: number;
    declared: boolean;
  }>;
  fetchedAt: string | null;
};

const YAHOO_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

const DAY_SECONDS = 86400;

export function frequencyLabel(
  frequency: DividendFrequency
): string {
  if (frequency === "monthly") return "Monthly";
  if (frequency === "quarterly") return "Quarterly";
  if (frequency === "semiannual") return "Semi-annual";
  if (frequency === "annual") return "Annual";
  if (frequency === "irregular") return "Irregular";
  return "Unknown";
}

/**
 * Parse the `events.dividends` block of a Yahoo v8 chart response.
 * Map keys are ex-dividend timestamps; each value carries the amount
 * and (usually) the payment date.
 */
export function parseDividendEvents(
  payload: unknown
): DividendEvent[] {
  const record = payload as {
    chart?: {
      result?: Array<{
        events?: {
          dividends?: Record<
            string,
            {
              amount?: unknown;
              date?: unknown;
            }
          >;
        };
      }>;
    };
  } | null;

  const dividends =
    record?.chart?.result?.[0]?.events
      ?.dividends ?? {};

  const events: DividendEvent[] = [];

  for (const [key, value] of Object.entries(
    dividends
  )) {
    const exDate = Number(key);
    const amount = Number(value?.amount);
    const payDate = Number(value?.date);

    if (
      !Number.isFinite(exDate) ||
      exDate <= 0 ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      continue;
    }

    events.push({
      exDate,
      amount,
      payDate:
        Number.isFinite(payDate) && payDate > 0
          ? payDate
          : null,
    });
  }

  events.sort((a, b) => a.exDate - b.exDate);

  return events;
}

/**
 * Detect payout frequency from the median gap between past ex-dates.
 * Needs at least two past events; anything ambiguous is "irregular".
 */
export function detectDividendFrequency(
  events: DividendEvent[],
  nowSeconds = Math.floor(Date.now() / 1000)
): DividendFrequency {
  const past = events.filter(
    (event) => event.exDate <= nowSeconds
  );

  if (past.length < 2) return "unknown";

  const gaps: number[] = [];

  for (let i = 1; i < past.length; i++) {
    gaps.push(
      (past[i].exDate - past[i - 1].exDate) /
        DAY_SECONDS
    );
  }

  gaps.sort((a, b) => a - b);
  const median =
    gaps[Math.floor(gaps.length / 2)];

  if (median <= 45) return "monthly";
  if (median <= 120) return "quarterly";
  if (median <= 215) return "semiannual";
  if (median <= 400) return "annual";
  return "irregular";
}

function frequencyIntervalDays(
  frequency: DividendFrequency
): number | null {
  if (frequency === "monthly") return 30.4;
  if (frequency === "quarterly") return 91.3;
  if (frequency === "semiannual") return 182.6;
  if (frequency === "annual") return 365.25;
  return null;
}

function toISODate(seconds: number): string {
  return new Date(seconds * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Project the next 12 months of payments for one ticker.
 *
 * Declared announcements found in the feed are used verbatim and marked
 * declared. Everything else is projected from the last amount and the
 * detected frequency, marked projected. Payment dates for projected
 * entries reuse the median ex-to-pay lag seen in history.
 */
export function projectDividendPayments(
  events: DividendEvent[],
  frequency: DividendFrequency,
  nowSeconds = Math.floor(Date.now() / 1000)
): ProjectedDividend[] {
  const intervalDays =
    frequencyIntervalDays(frequency);
  const past = events.filter(
    (event) => event.exDate <= nowSeconds
  );
  const declared = events.filter(
    (event) => event.exDate > nowSeconds
  );

  if (!past.length) return [];

  const lastAmount =
    past[past.length - 1].amount;

  const lags = past
    .filter(
      (event) =>
        event.payDate != null &&
        event.payDate >= event.exDate
    )
    .map(
      (event) =>
        ((event.payDate as number) -
          event.exDate) /
        DAY_SECONDS
    );
  lags.sort((a, b) => a - b);
  const medianLag = lags.length
    ? lags[Math.floor(lags.length / 2)]
    : 14;

  const horizon = nowSeconds + 365 * DAY_SECONDS;

  const projected: ProjectedDividend[] = declared
    .filter(
      (event) => event.exDate <= horizon
    )
    .map((event) => ({
      exDate: toISODate(event.exDate),
      payDate: toISODate(
        event.payDate ?? event.exDate
      ),
      amountPerShare: event.amount,
      declared: true,
    }));

  if (intervalDays == null) {
    projected.sort((a, b) =>
      a.exDate < b.exDate ? -1 : 1
    );
    return projected;
  }

  let cursor =
    past[past.length - 1].exDate +
    intervalDays * DAY_SECONDS;

  while (cursor <= horizon) {
    const nearDeclared = projected.some(
      (item) =>
        Math.abs(
          Date.parse(item.exDate) / 1000 -
            cursor
        ) <=
        20 * DAY_SECONDS
    );

    if (!nearDeclared) {
      projected.push({
        exDate: toISODate(cursor),
        payDate: toISODate(
          cursor + medianLag * DAY_SECONDS
        ),
        amountPerShare: lastAmount,
        declared: false,
      });
    }

    cursor += intervalDays * DAY_SECONDS;
  }

  projected.sort((a, b) =>
    a.exDate < b.exDate ? -1 : 1
  );

  return projected;
}

async function fetchDividendEventsForTicker(
  ticker: string
): Promise<DividendEvent[]> {
  for (const host of YAHOO_HOSTS) {
    try {
      const response = await fetch(
        `${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=2y&events=div`,
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
      return parseDividendEvents(payload);
    } catch {
      /* Fall through to the next host. */
    }
  }

  return [];
}

export type DividendFetchResult = {
  ticker: string;
  events: DividendEvent[];
  frequency: DividendFrequency;
};

export async function fetchDividendHistories(
  tickers: string[]
): Promise<DividendFetchResult[]> {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const raw of tickers) {
    const ticker = normalizeTicker(raw);
    if (ticker && !seen.has(ticker)) {
      seen.add(ticker);
      unique.push(ticker);
    }
  }

  const results: DividendFetchResult[] = [];
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
      batch.map(async (ticker) => ({
        ticker,
        events:
          await fetchDividendEventsForTicker(
            ticker
          ),
      }))
    );

    for (const item of settled) {
      results.push({
        ticker: item.ticker,
        events: item.events,
        frequency: detectDividendFrequency(
          item.events
        ),
      });
    }
  }

  return results;
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey
    .split("-")
    .map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
  }).format(new Date(year, month - 1, 1));
}

/**
 * Pure builder: holdings + fetched dividend histories → intelligence.
 * `asOf` anchors the 12-month window (defaults to today) for testability.
 */
export function buildDividendIntelligence(
  holdings: Holding[],
  histories: DividendFetchResult[],
  asOf = new Date()
): DividendIntelligence {
  const nowSeconds = Math.floor(
    asOf.getTime() / 1000
  );
  const historyByTicker = new Map(
    histories.map((h) => [h.ticker, h])
  );

  const monthKeys: string[] = [];
  const cursor = new Date(
    asOf.getFullYear(),
    asOf.getMonth(),
    1
  );
  for (let i = 0; i < 12; i++) {
    const key =
      `${cursor.getFullYear()}-` +
      String(cursor.getMonth() + 1).padStart(
        2,
        "0"
      );
    monthKeys.push(key);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const monthTotals = new Map<
    string,
    { declared: number; projected: number }
  >(monthKeys.map((key) => [key, { declared: 0, projected: 0 }]));

  const payers: DividendPayer[] = [];
  const upcoming: DividendIntelligence["upcoming"] =
    [];

  for (const holding of holdings) {
    const ticker = String(
      holding.ticker ?? ""
    )
      .trim()
      .toUpperCase();
    const history = historyByTicker.get(ticker);

    if (
      !history ||
      !history.events.length ||
      holding.kind === "cash"
    ) {
      continue;
    }

    const payments = projectDividendPayments(
      history.events,
      history.frequency,
      nowSeconds
    );

    if (!payments.length) continue;

    const shares = Number(holding.shares ?? 0);
    const price = Number(holding.price ?? 0);
    const marketValue = Number(
      holding.value ?? shares * price
    );

    const annualPerShare = payments.reduce(
      (sum, payment) =>
        sum + payment.amountPerShare,
      0
    );
    const annualIncome = annualPerShare * shares;

    for (const payment of payments) {
      const monthKey = payment.payDate.slice(
        0,
        7
      );
      const bucket = monthTotals.get(monthKey);
      if (!bucket) continue;

      const income =
        payment.amountPerShare * shares;
      if (payment.declared) {
        bucket.declared += income;
      } else {
        bucket.projected += income;
      }
    }

    const future = payments.filter(
      (payment) =>
        Date.parse(payment.payDate) / 1000 >=
        nowSeconds - DAY_SECONDS
    );
    const next = future[0] ?? null;

    for (const payment of future.slice(0, 3)) {
      upcoming.push({
        ticker,
        exDate: payment.exDate,
        payDate: payment.payDate,
        amount: payment.amountPerShare * shares,
        declared: payment.declared,
      });
    }

    payers.push({
      ticker,
      name: String(holding.name ?? ticker),
      shares,
      price,
      marketValue,
      frequency: history.frequency,
      annualPerShare,
      annualIncome,
      yieldPct:
        marketValue > 0
          ? (annualIncome / marketValue) * 100
          : null,
      nextExDate: next?.exDate ?? null,
      nextPayDate: next?.payDate ?? null,
      payments,
    });
  }

  payers.sort(
    (a, b) => b.annualIncome - a.annualIncome
  );
  upcoming.sort((a, b) =>
    a.payDate < b.payDate ? -1 : 1
  );

  const annualIncome = payers.reduce(
    (sum, payer) => sum + payer.annualIncome,
    0
  );
  const investedValue = holdings.reduce(
    (sum, holding) =>
      holding.kind === "cash"
        ? sum
        : sum +
          Number(
            holding.value ??
              Number(holding.shares ?? 0) *
                Number(holding.price ?? 0)
          ),
    0
  );

  return {
    payers,
    payerCount: payers.length,
    annualIncome,
    monthlyAverage: annualIncome / 12,
    portfolioYieldPct:
      investedValue > 0
        ? (annualIncome / investedValue) * 100
        : null,
    months: monthKeys.map((key) => ({
      monthKey: key,
      label: monthLabel(key),
      declared: monthTotals.get(key)?.declared ?? 0,
      projected:
        monthTotals.get(key)?.projected ?? 0,
    })),
    upcoming: upcoming.slice(0, 8),
    fetchedAt: null,
  };
}

export type DividendCacheRow = {
  ticker: string;
  events: DividendEvent[];
  frequency: DividendFrequency;
  fetched_at: string | null;
};

/**
 * Server: read the dividend cache and build intelligence for the
 * household's current holdings. Never fetches remotely — the refresh
 * action owns that.
 */
export async function getDividendIntelligence(
  holdings: Holding[]
): Promise<DividendIntelligence> {
  try {
    const { database, householdId } =
      await requireActiveHousehold();

    const cached = await database
      .from("dividend_cache")
      .select(
        "ticker,dividend_events,frequency,fetched_at"
      )
      .eq("household_id", householdId);

    if (cached.error || !cached.data?.length) {
      return buildDividendIntelligence(
        holdings,
        []
      );
    }

    let fetchedAt: string | null = null;

    const histories: DividendFetchResult[] = (
      cached.data as Array<{
        ticker: string;
        dividend_events: DividendEvent[];
        frequency: DividendFrequency;
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
        events: Array.isArray(
          row.dividend_events
        )
          ? row.dividend_events
          : [],
        frequency: row.frequency ?? "unknown",
      };
    });

    const intelligence =
      buildDividendIntelligence(
        holdings,
        histories
      );
    intelligence.fetchedAt = fetchedAt;

    return intelligence;
  } catch {
    return buildDividendIntelligence(
      holdings,
      []
    );
  }
}
