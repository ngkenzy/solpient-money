"use server";

import { revalidatePath } from "next/cache";
import {
  capturePortfolioHistory,
  createInvestmentDecision,
  type InvestmentDecisionType,
} from "@/lib/portfolio-history";
import { buildPortfolioIntelligence } from "@/lib/portfolio-intelligence";
import { requireMoneyDataset } from "@/lib/money-data";
import { loadResearchSnapshots } from "@/lib/research";

const allowed = new Set<InvestmentDecisionType>([
  "hold",
  "add_later",
  "reduce_later",
  "watch",
  "no_action",
]);

export async function recordInvestmentDecision(
  formData: FormData
) {
  const ticker = String(
    formData.get("ticker") ?? ""
  )
    .trim()
    .toUpperCase();
  const rawType = String(
    formData.get("decisionType") ?? ""
  ) as InvestmentDecisionType;
  const note = String(
    formData.get("note") ?? ""
  ).trim();
  const actionItemId = String(
    formData.get("actionItemId") ?? ""
  ).trim() || null;

  if (!ticker) {
    throw new Error(
      "Choose a holding before recording a decision."
    );
  }

  if (!allowed.has(rawType)) {
    throw new Error(
      "Choose a valid journal decision."
    );
  }

  const context =
    await requireMoneyDataset();
  const tickers =
    context.dataset.holdings
      .filter(
        (holding) =>
          holding.kind === "stock"
      )
      .map(
        (holding) =>
          holding.ticker
      );

  if (!tickers.includes(ticker)) {
    throw new Error(
      "The selected ticker is not an owned direct-stock holding."
    );
  }

  const research =
    await loadResearchSnapshots(
      tickers
    );
  const report =
    buildPortfolioIntelligence(
      context.dataset,
      research
    );

  await capturePortfolioHistory(
    report,
    context.dataset,
    new Date()
  );

  await createInvestmentDecision({
    ticker,
    decisionType: rawType,
    note,
    actionItemId,
  });

  revalidatePath(
    "/decision-journal"
  );
  revalidatePath(
    `/portfolio/${ticker.toLowerCase()}`
  );
  revalidatePath(
    "/portfolio-intelligence"
  );
}
