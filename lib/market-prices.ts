/**
 * Free market-price quotes for stocks, ETFs, and mutual funds.
 *
 * Source: Yahoo Finance's public chart endpoint. No API key, no signup.
 * Prices are the latest regular-market quote (last close when the market
 * is shut). TSP funds are excluded here on purpose — they refresh through
 * the official tsp.gov CSV pull on the TSP page.
 */

export const MARKET_PRICE_SOURCE_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart";

export const MARKET_PRICE_SOURCE_LABEL = "Yahoo Finance";

export type MarketQuote = {
  ticker: string;
  price: number;
  changePct: number | null;
  asOf: string | null;
  source: "yahoo_chart";
};

export type MarketPriceFetchResult = {
  quotes: Map<string, MarketQuote>;
  fetchedAt: string;
  requested: number;
};

const YAHOO_HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

const TICKER_PATTERN = /^[A-Z0-9.\-^=]{1,12}$/;

/**
 * Normalize a raw holding ticker into a Yahoo-lookup symbol.
 * Returns null for anything that must never be quoted remotely:
 * empty values, TSP fund tickers (handled by the official TSP pull),
 * and values that are clearly not tickers (descriptions, CUSIPs).
 */
export function normalizeTicker(
  raw: unknown
): string | null {
  const ticker = String(raw ?? "")
    .trim()
    .toUpperCase();

  if (!ticker) return null;
  if (ticker.startsWith("TSP-")) return null;
  if (!TICKER_PATTERN.test(ticker)) return null;

  return ticker;
}

/**
 * Parse one Yahoo v8 chart response into a MarketQuote.
 * Returns null when the payload carries no usable quote.
 */
export function parseYahooChartQuote(
  ticker: string,
  payload: unknown
): MarketQuote | null {
  const record = payload as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: unknown;
          regularMarketChangePercent?: unknown;
          regularMarketTime?: unknown;
        };
      }>;
    };
  } | null;

  const meta =
    record?.chart?.result?.[0]?.meta ?? null;

  const price = Number(meta?.regularMarketPrice);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  const changePct = Number(
    meta?.regularMarketChangePercent
  );
  const marketTime = Number(
    meta?.regularMarketTime
  );

  return {
    ticker,
    price,
    changePct: Number.isFinite(changePct)
      ? changePct
      : null,
    asOf:
      Number.isFinite(marketTime) &&
      marketTime > 0
        ? new Date(
            marketTime * 1000
          ).toISOString()
        : null,
    source: "yahoo_chart",
  };
}

async function fetchOneQuote(
  ticker: string
): Promise<MarketQuote | null> {
  for (const host of YAHOO_HOSTS) {
    try {
      const response = await fetch(
        `${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
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
      const quote = parseYahooChartQuote(
        ticker,
        payload
      );

      if (quote) return quote;
    } catch {
      /* Fall through to the next host. */
    }
  }

  return null;
}

/**
 * Fetch the latest quote for each ticker. Tickers are deduplicated and
 * normalized first; anything that cannot be quoted is silently skipped.
 * Requests run in small batches so a large portfolio stays polite.
 */
export async function fetchLatestMarketPrices(
  tickers: string[]
): Promise<MarketPriceFetchResult> {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const raw of tickers) {
    const ticker = normalizeTicker(raw);

    if (ticker && !seen.has(ticker)) {
      seen.add(ticker);
      unique.push(ticker);
    }
  }

  const quotes = new Map<string, MarketQuote>();
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
    const results = await Promise.all(
      batch.map(fetchOneQuote)
    );

    results.forEach((quote, batchIndex) => {
      if (quote) {
        quotes.set(batch[batchIndex], quote);
      }
    });
  }

  return {
    quotes,
    fetchedAt: new Date().toISOString(),
    requested: unique.length,
  };
}
