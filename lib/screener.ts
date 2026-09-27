import { Pool } from 'pg';
import { fetchLatestMarketPrices } from './market-prices';

export type ScreenerResult = {
  ticker: string;
  price: number;
  eps: number;
  pe: number;
  epsPeriodEnd: string | null;
  priceAsOf: string | null;
};

let researchPool: Pool | null = null;

function getResearchPool(): Pool {
  if (!researchPool) {
    const url = process.env.RESEARCH_DB_URL;
    if (!url) throw new Error('RESEARCH_DB_URL is not set');
    researchPool = new Pool({ connectionString: url, max: 3 });
  }
  return researchPool;
}

/** Latest annual diluted EPS per ticker from the local Research DB (read-only). */
export async function getAnnualEps(
  tickers: string[]
): Promise<Map<string, { eps: number; periodEnd: string | null }>> {
  const pool = getResearchPool();
  const result = await pool.query(
    `
    SELECT DISTINCT ON (c.ticker)
      c.ticker,
      nf.value_numeric AS eps,
      nf.economic_period_end AS period_end
    FROM normalized_facts nf
    JOIN companies c ON c.id = nf.company_id
    WHERE c.ticker = ANY($1)
      AND nf.metric_key = 'eps_diluted'
      AND nf.value_numeric > 0
      AND nf.economic_period_type IN ('fiscal_year', 'fy')
    ORDER BY c.ticker, nf.economic_period_end DESC;
    `,
    [tickers]
  );
  const map = new Map<string, { eps: number; periodEnd: string | null }>();
  for (const row of result.rows) {
    map.set(row.ticker, {
      eps: parseFloat(row.eps),
      periodEnd: row.period_end ? new Date(row.period_end).toISOString().split('T')[0] : null,
    });
  }
  return map;
}

/** Rank tickers by ascending trailing P/E (price from Yahoo, EPS from Research DB). */
export async function runScreener(tickers: string[]): Promise<ScreenerResult[]> {
  const [epsMap, priceResult] = await Promise.all([
    getAnnualEps(tickers),
    fetchLatestMarketPrices(tickers),
  ]);

  const results: ScreenerResult[] = [];
  for (const ticker of tickers) {
    const epsData = epsMap.get(ticker);
    const quote = priceResult.quotes.get(ticker);
    if (!epsData || !quote) continue;
    if (epsData.eps <= 0 || quote.price <= 0) continue;
    results.push({
      ticker,
      price: quote.price,
      eps: epsData.eps,
      pe: quote.price / epsData.eps,
      epsPeriodEnd: epsData.periodEnd,
      priceAsOf: quote.asOf,
    });
  }

  results.sort((a, b) => a.pe - b.pe);
  return results;
}
