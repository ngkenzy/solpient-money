import "server-only";

import { requireActiveHousehold } from "@/lib/money-auth";
import {
  TSP_OFFICIAL_CSV_VERSION,
  type TspOfficialCsvResult,
  type TspOfficialFundRow,
} from "@/lib/tsp-official-csv";

export type LiveTspFund = TspOfficialFundRow & {
  ticker: string;
  liveUnits: number;
  liveFundPrice: number;
  liveValue: number;
  liveMixPct: number;
  priceEdited: boolean;
};

export type LatestTspOfficialImport = {
  id: string;
  sourceFilename: string | null;
  importedAt: string | null;
  accountId: string | null;
  currentValue: number;
  statement: TspOfficialCsvResult;
  funds: LiveTspFund[];
};

function dollars(cents: unknown) {
  const value = Number(cents ?? 0);
  return Number.isFinite(value) ? value / 100 : 0;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isOfficialCandidate(
  value: unknown
): value is TspOfficialCsvResult {
  if (!value || typeof value !== "object") return false;

  const candidate =
    value as Partial<TspOfficialCsvResult>;

  return (
    candidate.parserVersion ===
      TSP_OFFICIAL_CSV_VERSION &&
    typeof candidate.plan === "string" &&
    typeof candidate.periodStart === "string" &&
    typeof candidate.periodEnd === "string" &&
    Array.isArray(candidate.funds) &&
    Boolean(candidate.totals)
  );
}

export async function getLatestTspOfficialImport(): Promise<
  LatestTspOfficialImport | null
> {
  const { database, householdId } =
    await requireActiveHousehold();

  const { data, error } = await database
    .from("tsp_statement_imports")
    .select(
      "id,source_filename,imported_at,parsed_candidate"
    )
    .eq("household_id", householdId)
    .eq(
      "parser_version",
      TSP_OFFICIAL_CSV_VERSION
    )
    .order("parsed_statement_date", {
      ascending: false,
      nullsFirst: false,
    })
    .order("imported_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load latest official TSP import: ${error.message}`
    );
  }

  if (!data) return null;

  const parsed = data.parsed_candidate;

  if (!isOfficialCandidate(parsed)) {
    throw new Error(
      "The latest TSP import has an unsupported stored format."
    );
  }

  let { data: account, error: accountError } =
    await database
      .from("accounts")
      .select(
        "id,balance_cents,name,institution,account_type,source"
      )
      .eq("household_id", householdId)
      .eq("name", parsed.plan)
      .eq("account_type", "retirement")
      .or("source.eq.manual,source.eq.file")
      .limit(1)
      .maybeSingle();

  if (accountError) {
    throw new Error(
      `Unable to load Thrift Saving Plan account: ${accountError.message}`
    );
  }

  if (!account) {
    const fallback = await database
      .from("accounts")
      .select(
        "id,balance_cents,name,institution,account_type,source"
      )
      .eq("household_id", householdId)
      .eq("institution", "Thrift Savings Plan")
      .eq("account_type", "retirement")
      .or("source.eq.manual,source.eq.file")
      .limit(1)
      .maybeSingle();

    if (fallback.error) {
      throw new Error(
        `Unable to load Thrift Saving Plan account: ${fallback.error.message}`
      );
    }

    account = fallback.data;
  }

  let holdings: Array<Record<string, unknown>> = [];

  if (account?.id) {
    const holdingResult = await database
      .from("holdings")
      .select(
        "ticker,name,shares,price,market_value_cents,updated_at"
      )
      .eq("household_id", householdId)
      .eq("account_id", account.id)
      .order("market_value_cents", {
        ascending: false,
      });

    if (holdingResult.error) {
      throw new Error(
        `Unable to load Thrift Saving Plan funds: ${holdingResult.error.message}`
      );
    }

    holdings = holdingResult.data ?? [];
  }

  const liveByTicker = new Map(
    holdings.map((holding) => [
      String(holding.ticker).toUpperCase(),
      holding,
    ])
  );

  const rawFunds = parsed.funds.map((fund) => {
    const ticker = `TSP-${fund.fundCode}`;
    const live = liveByTicker.get(ticker);
    const liveUnits = live
      ? numberValue(live.shares, fund.units)
      : fund.units;
    const liveFundPrice = live
      ? numberValue(live.price, fund.fundPrice)
      : fund.fundPrice;
    const liveValue = live
      ? dollars(live.market_value_cents)
      : liveUnits * liveFundPrice;

    return {
      ...fund,
      ticker,
      liveUnits,
      liveFundPrice,
      liveValue,
      priceEdited:
        Math.abs(liveFundPrice - fund.fundPrice) >
        0.0000005,
    };
  });

  const currentValue = rawFunds.reduce(
    (sum, fund) => sum + fund.liveValue,
    0
  );

  const funds: LiveTspFund[] = rawFunds.map(
    (fund) => ({
      ...fund,
      liveMixPct:
        currentValue > 0
          ? (fund.liveValue / currentValue) * 100
          : 0,
    })
  );

  return {
    id: String(data.id),
    sourceFilename:
      data.source_filename == null
        ? null
        : String(data.source_filename),
    importedAt:
      data.imported_at == null
        ? null
        : String(data.imported_at),
    accountId:
      account?.id == null
        ? null
        : String(account.id),
    currentValue,
    statement: parsed,
    funds,
  };
}
