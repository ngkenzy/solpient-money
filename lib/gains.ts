import type { Holding } from "./demo-data";

export type HoldingGain = Holding & {
  gain: number;
  gainPct: number;
};

export type GainsSummary = {
  /** Holdings with a reported cost basis, ranked by gain descending. */
  ranked: HoldingGain[];
  totalCost: number;
  totalGain: number;
  totalGainPct: number;
  maxAbsGain: number;
  withCostBasis: number;
};

/**
 * Real performance from cost basis. File imports (Vanguard, Schwab,
 * Fidelity) carry cost basis per holding; anything without one (costBasis 0)
 * is excluded rather than guessed at.
 */
export function computeGains(holdings: Holding[]): GainsSummary {
  const ranked: HoldingGain[] = holdings
    .filter((holding) => holding.costBasis > 0)
    .map((holding) => {
      const gain = holding.value - holding.costBasis;
      return {
        ...holding,
        gain,
        gainPct: (gain / holding.costBasis) * 100,
      };
    })
    .sort((a, b) => b.gain - a.gain);

  const totalCost = ranked.reduce((sum, holding) => sum + holding.costBasis, 0);
  const totalGain = ranked.reduce((sum, holding) => sum + holding.gain, 0);

  return {
    ranked,
    totalCost,
    totalGain,
    totalGainPct: totalCost > 0 ? (totalGain / totalCost) * 100 : 0,
    maxAbsGain: ranked.reduce((max, holding) => Math.max(max, Math.abs(holding.gain)), 0),
    withCostBasis: ranked.length,
  };
}
