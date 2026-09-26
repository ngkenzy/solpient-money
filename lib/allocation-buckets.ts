import type { Holding } from "./demo-data";

export type AllocationBucketDef = {
  label: string;
  tone: string;
  matches: (holding: Holding) => boolean;
};

export const LARGE_CAP_LABEL = "U.S. Large Cap";
export const MID_CAP_LABEL = "U.S. Mid Cap";
export const SMALL_CAP_LABEL = "U.S. Small Cap";
export const TOTAL_MARKET_LABEL = "U.S. Total Market";
export const INTERNATIONAL_LABEL = "International";
export const BONDS_LABEL = "Bonds";
export const MONEY_MARKET_LABEL = "Money Market";
export const CASH_LABEL = "Cash";
export const OTHER_BUCKET_LABEL = "Other";
export const OTHER_BUCKET_TONE = "stone";

// Curated ticker maps (uppercase). Funds first — a Vanguard-only portfolio
// classifies almost entirely by fund name/ticker. Individual stocks fall back
// to the STOCK_TIERS map; anything unrecognized stays in "Other" (honest)
// rather than being guessed into a cap tier.
const LARGE_CAP_TICKERS = new Set([
  // S&P 500 / large-cap index funds
  "VOO", "VFIAX", "IVV", "SPLG", "SCHX", "VV", "MGC", "MGK", "VUG", "SCHG",
  // Nasdaq-100 / Dow
  "QQQ", "QQQM", "DIA",
  // mega-cap stocks
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "TSLA", "AVGO",
  "BRK.B", "BRK-B", "VIGAX", "VVIAX", "VTV", "VYM", "JPM", "XOM", "UNH", "V", "MA", "WMT", "ORCL", "HD",
  "PG", "JNJ", "BAC", "NFLX", "COST", "LLY", "ABBV", "KO", "MRK", "CVX",
  "CRM", "AMD", "TMO", "LIN", "DIS", "PEP", "ADBE", "ACN", "CSCO", "QCOM",
  "TXN", "INTU", "AMGN", "HON", "IBM", "PFE", "WFC", "MS", "GS", "RTX",
  "SPGI", "BLK", "AXP", "CAT", "LOW", "GE", "MCD", "ABT", "DHR", "VZ",
  "CMCSA", "NEE", "PM", "UNP", "AMAT",
]);

const MID_CAP_TICKERS = new Set([
  // mid-cap index funds (VXF extended-market ≈ mid/small blend, grouped here)
  "VO", "VIMAX", "VOE", "VOT", "SCHM", "IJH", "VXF", "VIMSX",
  // mid-cap stocks
  "DECK",
]);

const SMALL_CAP_TICKERS = new Set([
  "VB", "VSMAX", "VBK", "VBR", "SCHA", "IJR", "IWM", "VIOO", "VTWO", "SLY",
  "VSMSX",
]);

const TOTAL_MARKET_TICKERS = new Set(["VTI", "VTSAX", "ITOT", "SCHB", "SPTM"]);

const INTERNATIONAL_TICKERS = new Set([
  "VXUS", "VGTSX", "IXUS", "VEA", "VWO", "IEMG", "EFA", "EEM", "SCHF", "VEU",
  "ACWX",
]);

const BOND_TICKERS = new Set([
  "BND", "VBTLX", "AGG", "SCHZ", "VGSH", "VGIT", "VGLT", "BNDX", "VTIP",
  "TLT", "IEF", "SHY", "LQD",
]);

const MONEY_MARKET_TICKERS = new Set([
  "VMFXX", "VUSXX", "VCTXX", "VMMXX", "SPAXX", "FZFXX", "SWVXX",
]);

const SMALL_CAP_NAME = /small[\s-]?cap/i;
const MID_CAP_NAME = /mid[\s-]?cap/i;
const LARGE_CAP_NAME = /large[\s-]?cap|blue[\s-]?chip/i;
const SP500_NAME = /s&p\s*500|500\s*index/i;
const TOTAL_MARKET_NAME = /total[\s-]?(stock|market)/i;
const INTERNATIONAL_NAME = /international|emerging|developed|ex[\s-]?us|foreign/i;
const BOND_NAME = /\bbond\b|treasury|fixed[\s-]?income|\bTIPS?\b/i;
const MONEY_MARKET_NAME = /money\s*market|settlement/i;

/**
 * Classify a holding into a fine-grained allocation bucket.
 * Returns null when nothing matches (caller maps that to "Other").
 *
 * Precedence: cash/money-market → bonds → TSP funds → international →
 * U.S. cap tiers (fund name patterns, then curated ticker map).
 */
export function classifyHolding(holding: Holding): string | null {
  const ticker = (holding.ticker ?? "").toUpperCase();
  const name = holding.name ?? "";
  const kind = holding.kind;

  // Cash and cash-equivalents: split money-market/sweep funds out of cash.
  // (TSP G Fund is short-term Treasuries — a money-market equivalent.)
  if (kind === "cash") {
    if (
      ticker === "TSP-G" ||
      MONEY_MARKET_TICKERS.has(ticker) ||
      MONEY_MARKET_NAME.test(name)
    ) {
      return MONEY_MARKET_LABEL;
    }
    return CASH_LABEL;
  }

  // Bonds: explicit kind, or a bond fund/ETF held as kind "etf"
  // (e.g. BND/VBTLX — previously misclassified as U.S. equities).
  if (
    kind === "bond" ||
    BOND_TICKERS.has(ticker) ||
    BOND_NAME.test(name)
  ) {
    return BONDS_LABEL;
  }

  // TSP funds track well-known indexes: C ≈ S&P 500, S ≈ small/mid-cap.
  if (ticker.startsWith("TSP-")) {
    const code = ticker.slice(4);
    if (code === "C") return LARGE_CAP_LABEL;
    if (code === "S") return SMALL_CAP_LABEL;
    if (code === "I") return INTERNATIONAL_LABEL;
    if (code === "F") return BONDS_LABEL;
    if (code === "G") return CASH_LABEL;
    return null;
  }

  // International stocks and funds.
  if (
    holding.sector === "International" ||
    INTERNATIONAL_TICKERS.has(ticker) ||
    INTERNATIONAL_NAME.test(name)
  ) {
    return INTERNATIONAL_LABEL;
  }

  // U.S. equities: only stock/etf kinds reach here.
  if (kind === "stock" || kind === "etf") {
    if (SMALL_CAP_NAME.test(name)) return SMALL_CAP_LABEL;
    if (MID_CAP_NAME.test(name)) return MID_CAP_LABEL;
    if (LARGE_CAP_NAME.test(name)) return LARGE_CAP_LABEL;
    if (SP500_NAME.test(name)) return LARGE_CAP_LABEL;
    if (TOTAL_MARKET_NAME.test(name)) return TOTAL_MARKET_LABEL;
    if (LARGE_CAP_TICKERS.has(ticker)) return LARGE_CAP_LABEL;
    if (MID_CAP_TICKERS.has(ticker)) return MID_CAP_LABEL;
    if (SMALL_CAP_TICKERS.has(ticker)) return SMALL_CAP_LABEL;
    if (TOTAL_MARKET_TICKERS.has(ticker)) return TOTAL_MARKET_LABEL;
    // sector as a last resort (some parsers set "Large Cap" / "Small Cap" sectors)
    const sector = holding.sector ?? "";
    if (SMALL_CAP_NAME.test(sector)) return SMALL_CAP_LABEL;
    if (MID_CAP_NAME.test(sector)) return MID_CAP_LABEL;
    if (LARGE_CAP_NAME.test(sector)) return LARGE_CAP_LABEL;
  }

  return null;
}

// Single source of truth for allocation buckets. Used by buildAllocation
// (lib/money-data.ts) and by the AllocationExplorer filter.
export const ALLOCATION_BUCKETS: AllocationBucketDef[] = [
  {
    label: LARGE_CAP_LABEL,
    tone: "navy",
    matches: (holding) => classifyHolding(holding) === LARGE_CAP_LABEL,
  },
  {
    label: MID_CAP_LABEL,
    tone: "blue",
    matches: (holding) => classifyHolding(holding) === MID_CAP_LABEL,
  },
  {
    label: SMALL_CAP_LABEL,
    tone: "sky",
    matches: (holding) => classifyHolding(holding) === SMALL_CAP_LABEL,
  },
  {
    label: TOTAL_MARKET_LABEL,
    tone: "teal",
    matches: (holding) => classifyHolding(holding) === TOTAL_MARKET_LABEL,
  },
  {
    label: INTERNATIONAL_LABEL,
    tone: "purple",
    matches: (holding) => classifyHolding(holding) === INTERNATIONAL_LABEL,
  },
  {
    label: BONDS_LABEL,
    tone: "amber",
    matches: (holding) => classifyHolding(holding) === BONDS_LABEL,
  },
  {
    label: MONEY_MARKET_LABEL,
    tone: "green",
    matches: (holding) => classifyHolding(holding) === MONEY_MARKET_LABEL,
  },
  {
    label: CASH_LABEL,
    tone: "slate",
    matches: (holding) => classifyHolding(holding) === CASH_LABEL,
  },
];

export function allocationBucketFor(holding: Holding): string {
  return classifyHolding(holding) ?? OTHER_BUCKET_LABEL;
}
