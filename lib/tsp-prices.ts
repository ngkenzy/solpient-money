import "server-only";

import { requireActiveHousehold } from "@/lib/money-auth";
import { localCalendarDateKey } from "@/lib/local-calendar-date";

export const TSP_PRICE_SOURCE_URL =
  "https://www.tsp.gov/data/fund-price-history.csv";

export type TspDailyPrice = {
  date: string;
  fundCode: string;
  fundName: string;
  sharePrice: number;
  sourceKind: "official_tsp_csv";
  sourceUrl: string;
  fetchedAt: string;
};

export type TspEstimatedFundValue = {
  fundCode: string;
  fundName: string;
  shares: number | null;
  officialSnapshotBalance: number;
  snapshotSharePrice: number | null;
  snapshotPriceDate: string | null;
  latestSharePrice: number | null;
  latestPriceDate: string | null;
  estimatedCurrentValue: number | null;
  estimatedChangeSinceSnapshot: number | null;
  estimatedChangePct: number | null;
};

export type TspPriceSyncResult = {
  ok: boolean;
  fetchedRows: number;
  persistedRows: number;
  latestPriceDate: string | null;
  sourceUrl: string;
  warning: string | null;
};

type CsvRecord = {
  date: string;
  fundName: string;
  fundCode: string;
  sharePrice: number;
};

type Row = Record<string, unknown>;

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeFundCode(name: string) {
  const clean = name
    .replace(/^\uFEFF/, "")
    .trim();

  const individual = clean.match(
    /^([GFCSI])\s+Fund$/i
  );

  if (individual) {
    return individual[1].toUpperCase();
  }

  if (/^L\s+Income$/i.test(clean)) {
    return "LINCOME";
  }

  const lifecycle = clean.match(
    /^L\s+(\d{4})$/i
  );

  if (lifecycle) {
    return `L${lifecycle[1]}`;
  }

  return null;
}

export function parseOfficialTspPriceCsv(
  csv: string
): CsvRecord[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error(
      "Official TSP share-price feed returned no price rows."
    );
  }

  const header = parseCsvLine(lines[0]);
  const dateIndex = header.findIndex(
    (value) =>
      value
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase() === "date"
  );

  if (dateIndex < 0) {
    throw new Error(
      "Official TSP share-price feed is missing the Date column."
    );
  }

  const funds = header
    .map((fundName, index) => ({
      fundName: fundName.trim(),
      fundCode: normalizeFundCode(fundName),
      index,
    }))
    .filter(
      (
        value
      ): value is {
        fundName: string;
        fundCode: string;
        index: number;
      } => Boolean(value.fundCode)
    );

  if (!funds.length) {
    throw new Error(
      "Official TSP share-price feed contains no recognized TSP funds."
    );
  }

  const records: CsvRecord[] = [];

  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const date = String(
      fields[dateIndex] ?? ""
    ).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }

    for (const fund of funds) {
      const sharePrice = Number(
        fields[fund.index]
      );

      if (
        !Number.isFinite(sharePrice) ||
        sharePrice <= 0
      ) {
        continue;
      }

      records.push({
        date,
        fundName: fund.fundName,
        fundCode: fund.fundCode,
        sharePrice,
      });
    }
  }

  if (!records.length) {
    throw new Error(
      "Official TSP share-price feed did not contain usable prices."
    );
  }

  return records;
}

function dateOnly(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) {
    return value
      .toISOString()
      .slice(0, 10);
  }

  const raw = String(value);
  const parsed = new Date(raw);

  return Number.isNaN(
    parsed.getTime()
  )
    ? raw.slice(0, 10)
    : parsed
        .toISOString()
        .slice(0, 10);
}

function centsToDollars(
  value: unknown
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed / 100
    : 0;
}

function addDays(
  date: string,
  days: number
) {
  const parsed = new Date(
    `${date}T12:00:00Z`
  );
  parsed.setUTCDate(
    parsed.getUTCDate() + days
  );
  return parsed
    .toISOString()
    .slice(0, 10);
}

function latestOnOrBefore(
  prices: CsvRecord[],
  fundCode: string,
  date: string
) {
  return prices
    .filter(
      (price) =>
        price.fundCode ===
          fundCode &&
        price.date <= date
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date)
    )[0] ?? null;
}

function latestForFund(
  prices: CsvRecord[],
  fundCode: string
) {
  return prices
    .filter(
      (price) =>
        price.fundCode ===
        fundCode
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date)
    )[0] ?? null;
}

async function fetchOfficialTspCsv({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const url = new URL(
    TSP_PRICE_SOURCE_URL
  );

  url.searchParams.set(
    "startdate",
    startDate
  );
  url.searchParams.set(
    "enddate",
    endDate
  );
  url.searchParams.set("Lfunds", "1");
  url.searchParams.set(
    "InvFunds",
    "1"
  );
  url.searchParams.set(
    "download",
    "1"
  );

  const headers = {
    accept:
      "text/csv,text/plain,*/*;q=0.8",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/152 Safari/537.36 SolpientMoney/1.7.1",
    referer:
      "https://www.tsp.gov/share-price-history/",
    "x-requested-with":
      "XMLHttpRequest",
  };

  const candidates = [
    url.toString(),
    TSP_PRICE_SOURCE_URL,
  ];

  let lastStatus: number | null = null;

  for (const candidate of candidates) {
    const response = await fetch(
      candidate,
      {
        cache: "no-store",
        headers,
        signal:
          AbortSignal.timeout(
            25_000
          ),
      }
    );

    lastStatus = response.status;

    if (!response.ok) {
      continue;
    }

    const csv =
      await response.text();

    return {
      url: candidate,
      records:
        parseOfficialTspPriceCsv(
          csv
        ),
    };
  }

  throw new Error(
    `Official TSP share-price feed returned HTTP ${lastStatus ?? "unknown"} after both official request forms.`
  );
}

export async function syncTspSharePrices(
  now = new Date()
): Promise<TspPriceSyncResult> {
  const { supabase, householdId } =
    await requireActiveHousehold();

  const [profileResult, snapshotResult] =
    await Promise.all([
      supabase
        .from("tsp_profiles")
        .select("household_id")
        .eq("household_id", householdId)
        .maybeSingle(),
      supabase
        .from("tsp_snapshots")
        .select("*")
        .eq("household_id", householdId)
        .order("snapshot_date", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),
    ]);

  if (profileResult.error) {
    throw new Error(
      `Unable to read TSP profile before price sync: ${profileResult.error.message}`
    );
  }

  if (snapshotResult.error) {
    throw new Error(
      `Unable to read TSP snapshot before price sync: ${snapshotResult.error.message}`
    );
  }

  const snapshot = snapshotResult.data;

  if (!profileResult.data || !snapshot?.id) {
    return {
      ok: true,
      fetchedRows: 0,
      persistedRows: 0,
      latestPriceDate: null,
      sourceUrl: TSP_PRICE_SOURCE_URL,
      warning: null,
    };
  }

  /*
   * Participant setup is required before Solpient downloads prices.
   * This keeps non-TSP households from generating unnecessary network traffic.
   */
  const today = localCalendarDateKey(now);

  const snapshotDate =
    dateOnly(
      snapshot?.snapshot_date
    );

  const startCandidate =
    snapshotDate
      ? addDays(snapshotDate, -10)
      : addDays(today, -45);

  const recentStart =
    addDays(today, -45);

  const startDate =
    startCandidate < recentStart
      ? startCandidate
      : recentStart;

  let fetched:
    | {
        url: string;
        records: CsvRecord[];
      }
    | null = null;

  try {
    fetched =
      await fetchOfficialTspCsv({
        startDate,
        endDate: today,
      });
  } catch (error) {
    const {
      data: cachedLatest,
      error: cachedLatestError,
    } = await supabase
      .from("tsp_fund_prices")
      .select("price_date")
      .order("price_date", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    return {
      ok: false,
      fetchedRows: 0,
      persistedRows: 0,
      latestPriceDate:
        cachedLatestError
          ? null
          : dateOnly(
              cachedLatest?.price_date
            ),
      sourceUrl:
        TSP_PRICE_SOURCE_URL,
      warning:
        error instanceof Error
          ? error.message
          : "Unable to fetch official TSP share prices.",
    };
  }

  const fetchedAt =
    new Date().toISOString();

  const rows =
    fetched.records.map(
      (record) => ({
        price_date:
          record.date,
        fund_code:
          record.fundCode,
        fund_name:
          record.fundName,
        share_price:
          record.sharePrice,
        source_kind:
          "official_tsp_csv",
        source_url:
          fetched!.url,
        fetched_at:
          fetchedAt,
      })
    );

  let persistedRows = 0;

  for (
    let index = 0;
    index < rows.length;
    index += 250
  ) {
    const chunk = rows.slice(
      index,
      index + 250
    );

    const { error } =
      await supabase
        .from(
          "tsp_fund_prices"
        )
        .upsert(chunk, {
          onConflict:
            "price_date,fund_code",
        });

    if (error) {
      throw new Error(
        `Unable to cache official TSP prices: ${error.message}`
      );
    }

    persistedRows +=
      chunk.length;
  }

  if (
    snapshot?.id &&
    snapshotDate
  ) {
    const {
      data: positions,
      error: positionError,
    } = await supabase
      .from(
        "tsp_fund_positions"
      )
      .select("*")
      .eq(
        "household_id",
        householdId
      )
      .eq(
        "snapshot_id",
        snapshot.id
      );

    if (positionError) {
      throw new Error(
        `Unable to read TSP fund positions for price sync: ${positionError.message}`
      );
    }

    for (const row of
      (positions ?? []) as Row[]) {
      const fundCode = String(
        row.fund_code ?? ""
      ).toUpperCase();

      const anchor =
        latestOnOrBefore(
          fetched.records,
          fundCode,
          snapshotDate
        );

      if (!anchor) continue;

      const balance =
        centsToDollars(
          row.balance_cents
        );

      const shares =
        anchor.sharePrice > 0
          ? balance /
            anchor.sharePrice
          : null;

      const { error } =
        await supabase
          .from(
            "tsp_fund_positions"
          )
          .update({
            shares,
            snapshot_share_price:
              anchor.sharePrice,
            snapshot_price_date:
              anchor.date,
          })
          .eq(
            "household_id",
            householdId
          )
          .eq(
            "id",
            row.id
          );

      if (error) {
        throw new Error(
          `Unable to infer TSP shares for ${fundCode}: ${error.message}`
        );
      }
    }
  }

  const latestPriceDate =
    fetched.records
      .map(
        (record) => record.date
      )
      .sort()
      .at(-1) ?? null;

  return {
    ok: true,
    fetchedRows:
      fetched.records.length,
    persistedRows,
    latestPriceDate,
    sourceUrl:
      fetched.url,
    warning: null,
  };
}

export async function getTspEstimatedCurrentValue() {
  const { supabase, householdId } =
    await requireActiveHousehold();

  const {
    data: snapshot,
    error: snapshotError,
  } = await supabase
    .from("tsp_snapshots")
    .select("*")
    .eq(
      "household_id",
      householdId
    )
    .order("snapshot_date", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (snapshotError) {
    throw new Error(
      `Unable to read TSP snapshot for estimate: ${snapshotError.message}`
    );
  }

  if (!snapshot?.id) {
    return {
      priceDate: null,
      officialSnapshotDate:
        null,
      officialSnapshotBalance: 0,
      estimatedCurrentValue:
        null,
      estimatedChange:
        null,
      estimatedChangePct:
        null,
      mixedPriceDates: false,
      newestPriceDate: null,
      oldestPriceDate: null,
      positions:
        [] as TspEstimatedFundValue[],
    };
  }

  const [
    positionsResult,
    pricesResult,
  ] = await Promise.all([
    supabase
      .from(
        "tsp_fund_positions"
      )
      .select("*")
      .eq(
        "household_id",
        householdId
      )
      .eq(
        "snapshot_id",
        snapshot.id
      ),
    supabase
      .from(
        "tsp_fund_prices"
      )
      .select("*")
      .order("price_date", {
        ascending: false,
      })
      .limit(500),
  ]);

  if (positionsResult.error) {
    throw new Error(
      `Unable to read TSP positions for estimate: ${positionsResult.error.message}`
    );
  }

  if (pricesResult.error) {
    throw new Error(
      `Unable to read cached TSP prices: ${pricesResult.error.message}`
    );
  }

  const prices =
    (pricesResult.data ??
      []) as Row[];

  const normalizedPrices: CsvRecord[] =
    prices.map((row) => ({
      date:
        dateOnly(
          row.price_date
        ) ?? "",
      fundCode: String(
        row.fund_code ?? ""
      ).toUpperCase(),
      fundName: String(
        row.fund_name ?? ""
      ),
      sharePrice:
        Number(
          row.share_price
        ),
    }));

  const values: TspEstimatedFundValue[] =
    (
      (positionsResult.data ??
        []) as Row[]
    ).map((row) => {
      const fundCode =
        String(
          row.fund_code ?? ""
        ).toUpperCase();
      const latest =
        latestForFund(
          normalizedPrices,
          fundCode
        );
      const sharesRaw =
        Number(row.shares);
      const shares =
        Number.isFinite(
          sharesRaw
        ) &&
        sharesRaw > 0
          ? sharesRaw
          : null;
      const official =
        centsToDollars(
          row.balance_cents
        );
      const estimated =
        shares != null &&
        latest
          ? shares *
            latest.sharePrice
          : null;

      return {
        fundCode,
        fundName: String(
          row.fund_name ?? ""
        ),
        shares,
        officialSnapshotBalance:
          official,
        snapshotSharePrice:
          row.snapshot_share_price ==
          null
            ? null
            : Number(
                row.snapshot_share_price
              ),
        snapshotPriceDate:
          dateOnly(
            row.snapshot_price_date
          ),
        latestSharePrice:
          latest?.sharePrice ??
          null,
        latestPriceDate:
          latest?.date ?? null,
        estimatedCurrentValue:
          estimated,
        estimatedChangeSinceSnapshot:
          estimated == null
            ? null
            : estimated -
              official,
        estimatedChangePct:
          estimated == null ||
          official === 0
            ? null
            : ((estimated -
                official) /
                official) *
              100,
      };
    });

  const officialSnapshotBalance =
    centsToDollars(
      snapshot.traditional_balance_cents
    ) +
    centsToDollars(
      snapshot.roth_balance_cents
    );

  const priceDates = Array.from(
    new Set(
      values
        .map(
          (position) =>
            position.latestPriceDate
        )
        .filter(
          (
            value
          ): value is string =>
            Boolean(value)
        )
    )
  ).sort();

  const mixedPriceDates =
    priceDates.length > 1;
  const oldestPriceDate =
    priceDates.at(0) ?? null;
  const newestPriceDate =
    priceDates.at(-1) ?? null;

  const complete =
    values.length > 0 &&
    values.every(
      (position) =>
        position.estimatedCurrentValue !=
        null
    );

  const estimatedCurrentValue =
    complete && !mixedPriceDates
      ? values.reduce(
          (sum, position) =>
            sum +
            (position.estimatedCurrentValue ??
              0),
          0
        )
      : null;

  const estimatedChange =
    estimatedCurrentValue ==
    null
      ? null
      : estimatedCurrentValue -
        officialSnapshotBalance;

  const estimatedChangePct =
    estimatedCurrentValue ==
      null ||
    officialSnapshotBalance ===
      0
      ? null
      : (estimatedChange! /
          officialSnapshotBalance) *
        100;

  const priceDate =
    mixedPriceDates
      ? null
      : newestPriceDate;

  return {
    priceDate,
    officialSnapshotDate:
      dateOnly(
        snapshot.snapshot_date
      ),
    officialSnapshotBalance,
    estimatedCurrentValue,
    estimatedChange,
    estimatedChangePct,
    mixedPriceDates,
    newestPriceDate,
    oldestPriceDate,
    positions: values,
  };
}
