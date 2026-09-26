"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-status-code";
import { requireActiveHousehold } from "@/lib/money-auth";
import {
  MARKET_PRICE_SOURCE_LABEL,
  fetchLatestMarketPrices,
} from "@/lib/market-prices";

export type RefreshMarketPricesState = {
  ok: boolean;
  message: string;
};

function cents(value: number) {
  return Math.round(value * 100);
}

function quoteDateLabel(fetchedAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(fetchedAt));
}

/**
 * One-click refresh of every non-TSP holding's market price from the
 * free Yahoo Finance quote feed. Updates holding prices and market
 * values, recalculates the touched account balances, and revalidates
 * the portfolio-facing pages.
 */
export async function refreshMarketPrices(): Promise<RefreshMarketPricesState> {
  try {
    const { database, householdId } =
      await requireActiveHousehold();

    const holdingsResult = await database
      .from("holdings")
      .select(
        "id,account_id,ticker,shares,holding_kind"
      )
      .eq("household_id", householdId)
      .gt("shares", 0)
      .neq("holding_kind", "cash");

    if (holdingsResult.error) {
      throw new Error(
        `Unable to read holdings before price refresh: ${holdingsResult.error.message}`
      );
    }

    const holdings = (
      holdingsResult.data ?? []
    ).filter(
      (holding) =>
        !String(
          holding.ticker ?? ""
        ).toUpperCase().startsWith("TSP-")
    );

    if (!holdings.length) {
      return {
        ok: false,
        message:
          "No priced holdings found. Import a brokerage CSV first.",
      };
    }

    const { quotes, fetchedAt } =
      await fetchLatestMarketPrices(
        holdings.map((holding) =>
          String(holding.ticker ?? "")
        )
      );

    if (!quotes.size) {
      return {
        ok: false,
        message: `No quotes came back from ${MARKET_PRICE_SOURCE_LABEL}. Check your connection and try again.`,
      };
    }

    const now = new Date().toISOString();
    const touchedAccounts = new Set<string>();
    const missing: string[] = [];
    let applied = 0;

    for (const holding of holdings) {
      const ticker = String(
        holding.ticker ?? ""
      ).trim().toUpperCase();
      const quote = quotes.get(ticker);

      if (!quote) {
        missing.push(ticker);
        continue;
      }

      const shares = Number(
        holding.shares ?? 0
      );

      if (
        !Number.isFinite(shares) ||
        shares <= 0
      ) {
        continue;
      }

      const holdingUpdate = await database
        .from("holdings")
        .update({
          price: quote.price,
          market_value_cents: cents(
            shares * quote.price
          ),
          day_change_pct: quote.changePct,
          updated_at: now,
        })
        .eq("id", holding.id)
        .eq("household_id", householdId);

      if (holdingUpdate.error) {
        throw new Error(
          `Unable to update ${ticker}: ${holdingUpdate.error.message}`
        );
      }

      applied += 1;

      if (holding.account_id) {
        touchedAccounts.add(
          String(holding.account_id)
        );
      }
    }

    for (const accountId of touchedAccounts) {
      const portfolioResult =
        await database
          .from("holdings")
          .select("market_value_cents")
          .eq("household_id", householdId)
          .eq("account_id", accountId);

      if (portfolioResult.error) {
        throw new Error(
          `Unable to recalculate account value: ${portfolioResult.error.message}`
        );
      }

      const totalCents = (
        portfolioResult.data ?? []
      ).reduce(
        (sum, row) =>
          sum +
          Number(
            row.market_value_cents ?? 0
          ),
        0
      );

      const accountUpdate = await database
        .from("accounts")
        .update({
          balance_cents: Math.round(totalCents),
          updated_at: now,
        })
        .eq("id", accountId)
        .eq("household_id", householdId);

      if (accountUpdate.error) {
        throw new Error(
          `Unable to update account value: ${accountUpdate.error.message}`
        );
      }
    }

    for (const path of [
      "/",
      "/accounts",
      "/portfolio",
    ]) {
      revalidatePath(path);
    }

    if (!applied) {
      return {
        ok: false,
        message: `No quotes matched your holdings (${missing.join(", ")}).`,
      };
    }

    const missingNote = missing.length
      ? ` No quote for: ${missing.join(", ")}.`
      : "";

    return {
      ok: true,
      message:
        `Refreshed ${applied} holding${applied === 1 ? "" : "s"} ` +
        `with ${MARKET_PRICE_SOURCE_LABEL} prices for ${quoteDateLabel(fetchedAt)}.${missingNote}`,
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;

    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to refresh market prices.",
    };
  }
}
