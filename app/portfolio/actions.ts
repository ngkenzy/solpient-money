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

export type RefreshIncomeAndValueState = {
  ok: boolean;
  message: string;
};

function frequencyAnnualMultiplier(
  frequency: string
): number {
  if (frequency === "monthly") return 12;
  if (frequency === "quarterly") return 4;
  if (frequency === "semiannual") return 2;
  if (frequency === "annual") return 1;
  return 0;
}

/**
 * One-click refresh of dividend histories and value-proxy snapshots for
 * every non-TSP holding. Dividend events come from the free Yahoo Finance
 * chart feed; 52-week ranges and analyst targets come from Nasdaq's public
 * quote summary. Results land in household-scoped caches that the
 * portfolio and portfolio-intelligence pages render from.
 */
export async function refreshIncomeAndValue(): Promise<RefreshIncomeAndValueState> {
  const {
    DIVIDEND_SOURCE_LABEL,
    fetchDividendHistories,
    projectDividendPayments,
  } = await import("@/lib/dividends");
  const {
    VALUE_SOURCE_LABEL,
    fetchValueSnapshots,
  } = await import("@/lib/value-proxies");

  try {
    const { database, householdId } =
      await requireActiveHousehold();

    const holdingsResult = await database
      .from("holdings")
      .select("ticker,shares,holding_kind")
      .eq("household_id", householdId)
      .gt("shares", 0)
      .neq("holding_kind", "cash");

    if (holdingsResult.error) {
      throw new Error(
        `Unable to read holdings before refresh: ${holdingsResult.error.message}`
      );
    }

    const tickers = (
      holdingsResult.data ?? []
    )
      .map((holding) =>
        String(holding.ticker ?? "")
      )
      .filter(
        (ticker) =>
          ticker &&
          !ticker.toUpperCase().startsWith("TSP-")
      );

    if (!tickers.length) {
      return {
        ok: false,
        message:
          "No holdings found. Import a brokerage CSV first.",
      };
    }

    const [histories, snapshots] =
      await Promise.all([
        fetchDividendHistories(tickers),
        fetchValueSnapshots(tickers),
      ]);

    const now = new Date().toISOString();
    const todayKey = now.slice(0, 10);
    let dividendPayers = 0;

    for (const history of histories) {
      const past = history.events.filter(
        (event) =>
          event.exDate <=
          Math.floor(Date.now() / 1000)
      );
      const lastAmount = past.length
        ? past[past.length - 1].amount
        : null;
      const multiplier = frequencyAnnualMultiplier(
        history.frequency
      );
      const payments = projectDividendPayments(
        history.events,
        history.frequency
      );
      const next = payments.find(
        (payment) => payment.exDate >= todayKey
      ) ?? null;

      if (history.events.length) {
        dividendPayers += 1;
      }

      const upsert = await database
        .from("dividend_cache")
        .upsert(
          {
            household_id: householdId,
            ticker: history.ticker,
            dividend_events: history.events,
            frequency: history.frequency,
            last_amount: lastAmount,
            annualized_amount:
              lastAmount != null && multiplier > 0
                ? lastAmount * multiplier
                : null,
            next_ex_date: next?.exDate ?? null,
            next_pay_date: next?.payDate ?? null,
            fetched_at: now,
          },
          {
            onConflict:
              "household_id,ticker",
          }
        );

      if (upsert.error) {
        throw new Error(
          `Unable to cache dividends for ${history.ticker}: ${upsert.error.message}`
        );
      }
    }

    for (const snapshot of snapshots) {
      const upsert = await database
        .from("value_snapshot_cache")
        .upsert(
          {
            household_id: householdId,
            ticker: snapshot.ticker,
            fifty_two_week_high:
              snapshot.fiftyTwoWeekHigh,
            fifty_two_week_low:
              snapshot.fiftyTwoWeekLow,
            analyst_target:
              snapshot.analystTarget,
            sector: snapshot.sector,
            industry: snapshot.industry,
            fetched_at: now,
          },
          {
            onConflict:
              "household_id,ticker",
          }
        );

      if (upsert.error) {
        throw new Error(
          `Unable to cache value data for ${snapshot.ticker}: ${upsert.error.message}`
        );
      }
    }

    for (const path of [
      "/portfolio",
      "/portfolio-intelligence",
    ]) {
      revalidatePath(path);
    }

    return {
      ok: true,
      message:
        `Refreshed ${DIVIDEND_SOURCE_LABEL} dividends ` +
        `(${dividendPayers} payers) and ${VALUE_SOURCE_LABEL} value data ` +
        `for ${snapshots.length} holdings.`,
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;

    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to refresh dividend and value data.",
    };
  }
}
