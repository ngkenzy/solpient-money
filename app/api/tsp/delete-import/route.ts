import { NextResponse } from "next/server";
import { requireActiveHousehold } from "@/lib/money-auth";
import { TSP_OFFICIAL_CSV_VERSION } from "@/lib/tsp-official-csv";

export const dynamic = "force-dynamic";

type OfficialFund = {
  fundCode: string;
  fundName: string;
  assetClass: string;
  units: number;
  fundPrice: number;
  fundReturnPct: number;
  periodStart: string;
  periodEnd: string;
};

type OfficialCandidate = {
  parserVersion: string;
  plan: string;
  periodStart: string;
  periodEnd: string;
  funds: OfficialFund[];
};

function candidate(value: unknown): OfficialCandidate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<OfficialCandidate>;

  if (
    row.parserVersion !== TSP_OFFICIAL_CSV_VERSION ||
    typeof row.plan !== "string" ||
    typeof row.periodStart !== "string" ||
    typeof row.periodEnd !== "string" ||
    !Array.isArray(row.funds)
  ) {
    return null;
  }

  return row as OfficialCandidate;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function holdingKind(fund: OfficialFund) {
  const asset = String(fund.assetClass ?? "").toLowerCase();

  if (fund.fundCode === "G" || asset.includes("cash")) {
    return "cash";
  }
  if (
    fund.fundCode === "F" ||
    asset.includes("bond") ||
    asset.includes("fixed")
  ) {
    return "bond";
  }

  return "etf";
}

function sector(fund: OfficialFund) {
  if (fund.fundCode === "I") return "International";
  if (fund.fundCode === "G") return "Cash";
  if (fund.fundCode === "F") return "Bonds";
  if (fund.fundCode === "C" || fund.fundCode === "S") {
    return "U.S. Equities";
  }
  return "Mixed";
}

async function findTspAccount(
  database: Awaited<ReturnType<typeof requireActiveHousehold>>["database"],
  householdId: string,
  planName: string
) {
  const byName = await database
    .from("accounts")
    .select("id,name,institution,account_type,source")
    .eq("household_id", householdId)
    .eq("name", planName)
    .eq("account_type", "retirement")
    .or("source.eq.manual,source.eq.file")
    .limit(1)
    .maybeSingle();

  if (byName.error) {
    throw new Error(
      `Unable to find TSP account: ${byName.error.message}`
    );
  }
  if (byName.data) return byName.data;

  const fallback = await database
    .from("accounts")
    .select("id,name,institution,account_type,source")
    .eq("household_id", householdId)
    .eq("institution", "Thrift Savings Plan")
    .eq("account_type", "retirement")
    .or("source.eq.manual,source.eq.file")
    .limit(1)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(
      `Unable to find TSP account: ${fallback.error.message}`
    );
  }

  return fallback.data;
}

async function restorePreviousTspImport({
  database,
  householdId,
  previous,
  targetCandidate,
}: {
  database: Awaited<ReturnType<typeof requireActiveHousehold>>["database"];
  householdId: string;
  previous: Record<string, unknown> | null;
  targetCandidate: OfficialCandidate;
}) {
  const previousCandidate = previous
    ? candidate(previous.parsed_candidate)
    : null;

  let account = await findTspAccount(
    database,
    householdId,
    targetCandidate.plan
  );

  if (previousCandidate) {
    const rows = previousCandidate.funds.map((fund) => ({
      ticker: `TSP-${fund.fundCode}`,
      name: fund.fundName,
      fund,
      marketValueCents: cents(
        Number(fund.units) * Number(fund.fundPrice)
      ),
    }));
    const totalCents = rows.reduce(
      (sum, row) => sum + row.marketValueCents,
      0
    );

    if (!account) {
      const created = await database
        .from("accounts")
        .insert({
          household_id: householdId,
          name: previousCandidate.plan,
          institution: "Thrift Savings Plan",
          account_type: "retirement",
          balance_cents: totalCents,
          owner_scope: "Household",
          last_four: null,
          source: "file",
          sort_order: 300,
          last_file_import_at:
            previous?.imported_at ?? null,
        })
        .select("id,name,institution,account_type,source")
        .single();

      if (created.error || !created.data) {
        throw new Error(
          `Unable to restore prior TSP account: ${created.error?.message ?? "No account returned."}`
        );
      }

      account = created.data;
    }

    const accountId = String(account.id);

    const priorBatch = await database
      .from("file_import_batches")
      .select("id")
      .eq("household_id", householdId)
      .eq(
        "file_digest",
        String(previous?.source_content_sha256 ?? "")
      )
      .eq("status", "imported")
      .limit(1)
      .maybeSingle();

    if (priorBatch.error) {
      throw new Error(
        `Unable to inspect prior TSP Connect batch: ${priorBatch.error.message}`
      );
    }

    const holdingRows = rows.map(({ ticker, name, fund, marketValueCents }) => ({
      household_id: householdId,
      account_id: accountId,
      ticker,
      name,
      holding_kind: holdingKind(fund),
      shares: Number(fund.units),
      price: Number(fund.fundPrice),
      cost_basis_cents: 0,
      market_value_cents: marketValueCents,
      day_change_pct: 0,
      ytd_return_pct:
        fund.periodStart ===
        `${fund.periodEnd.slice(0, 4)}-01-01`
          ? Number(fund.fundReturnPct ?? 0)
          : 0,
      sector: sector(fund),
      source: "file",
      import_batch_id: priorBatch.data?.id ?? null,
      import_fingerprint: null,
    }));

    const upsert = await database
      .from("holdings")
      .upsert(holdingRows, {
        onConflict: "household_id,account_id,ticker",
      });

    if (upsert.error) {
      throw new Error(
        `Unable to restore prior TSP holdings: ${upsert.error.message}`
      );
    }

    const current = await database
      .from("holdings")
      .select("ticker")
      .eq("household_id", householdId)
      .eq("account_id", accountId);

    if (current.error) {
      throw new Error(
        `Unable to inspect TSP holdings: ${current.error.message}`
      );
    }

    const wanted = new Set(
      holdingRows.map((row) => row.ticker)
    );
    const stale = (current.data ?? [])
      .map((row) => String(row.ticker))
      .filter(
        (ticker) =>
          ticker.startsWith("TSP-") &&
          !wanted.has(ticker)
      );

    if (stale.length) {
      const removed = await database
        .from("holdings")
        .delete()
        .eq("household_id", householdId)
        .eq("account_id", accountId)
        .in("ticker", stale);

      if (removed.error) {
        throw new Error(
          `Unable to remove stale TSP holdings: ${removed.error.message}`
        );
      }
    }

    const accountUpdate = await database
      .from("accounts")
      .update({
        name: previousCandidate.plan,
        institution: "Thrift Savings Plan",
        account_type: "retirement",
        balance_cents: totalCents,
        source: "file",
        last_file_import_at:
          previous?.imported_at ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId)
      .eq("household_id", householdId);

    if (accountUpdate.error) {
      throw new Error(
        `Unable to restore prior TSP account value: ${accountUpdate.error.message}`
      );
    }

    return;
  }

  if (!account) return;

  const accountId = String(account.id);
  const current = await database
    .from("holdings")
    .select("ticker")
    .eq("household_id", householdId)
    .eq("account_id", accountId);

  if (current.error) {
    throw new Error(
      `Unable to inspect TSP holdings: ${current.error.message}`
    );
  }

  const tspTickers = (current.data ?? [])
    .map((row) => String(row.ticker))
    .filter((ticker) => ticker.startsWith("TSP-"));

  if (tspTickers.length) {
    const removed = await database
      .from("holdings")
      .delete()
      .eq("household_id", householdId)
      .eq("account_id", accountId)
      .in("ticker", tspTickers);

    if (removed.error) {
      throw new Error(
        `Unable to remove TSP holdings: ${removed.error.message}`
      );
    }
  }

  const [
    remainingHoldings,
    transactionCount,
  ] = await Promise.all([
    database
      .from("holdings")
      .select("market_value_cents")
      .eq("household_id", householdId)
      .eq("account_id", accountId),
    database
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("account_id", accountId),
  ]);

  if (remainingHoldings.error) {
    throw new Error(
      `Unable to recalculate TSP account: ${remainingHoldings.error.message}`
    );
  }
  if (transactionCount.error) {
    throw new Error(
      `Unable to inspect TSP transactions: ${transactionCount.error.message}`
    );
  }

  const remaining = remainingHoldings.data ?? [];
  const remainingValue = remaining.reduce(
    (sum, row) =>
      sum + Number(row.market_value_cents ?? 0),
    0
  );

  if (
    String(account.source) === "file" &&
    remaining.length === 0 &&
    (transactionCount.count ?? 0) === 0
  ) {
    const deleted = await database
      .from("accounts")
      .delete()
      .eq("id", accountId)
      .eq("household_id", householdId);

    if (deleted.error) {
      throw new Error(
        `Unable to remove empty TSP account: ${deleted.error.message}`
      );
    }
  } else {
    const updated = await database
      .from("accounts")
      .update({
        balance_cents: remainingValue,
        last_file_import_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId)
      .eq("household_id", householdId);

    if (updated.error) {
      throw new Error(
        `Unable to reset TSP account: ${updated.error.message}`
      );
    }
  }
}

async function deleteConfirmedSnapshot({
  database,
  householdId,
  snapshotId,
}: {
  database: Awaited<ReturnType<typeof requireActiveHousehold>>["database"];
  householdId: string;
  snapshotId: string | null;
}) {
  if (!snapshotId) return;
  const snapshotDelete = await database
    .from("tsp_snapshots")
    .delete()
    .eq("id", snapshotId)
    .eq("household_id", householdId);

  if (snapshotDelete.error) {
    throw new Error(
      `Unable to remove linked TSP snapshot: ${snapshotDelete.error.message}`
    );
  }
}

async function deleteImportRecord({
  database,
  householdId,
  importId,
}: {
  database: Awaited<ReturnType<typeof requireActiveHousehold>>["database"];
  householdId: string;
  importId: string;
}) {
  const deleteAudit = await database
    .from("tsp_statement_imports")
    .delete()
    .eq("id", importId)
    .eq("household_id", householdId);

  if (deleteAudit.error) {
    throw new Error(
      `Unable to delete TSP import history: ${deleteAudit.error.message}`
    );
  }
}

export async function POST(request: Request) {
  try {
    const { database, householdId } =
      await requireActiveHousehold();
    const body = (await request.json()) as {
      importId?: string;
    };

    if (!body.importId) {
      return NextResponse.json(
        { error: "Missing TSP import id." },
        { status: 400 }
      );
    }

    const targetResult = await database
      .from("tsp_statement_imports")
      .select(
        "id,source_filename,source_content_sha256,parser_version,parsed_candidate,parsed_statement_date,imported_at,confirmed_snapshot_id"
      )
      .eq("id", body.importId)
      .eq("household_id", householdId)
      .single();

    if (targetResult.error || !targetResult.data) {
      return NextResponse.json(
        { error: "TSP import not found." },
        { status: 404 }
      );
    }

    const target = targetResult.data;

    // v1.8 statement imports only ever create an immutable snapshot
    // revision on confirm — the statement flow never touches live
    // holdings or accounts. Undo is therefore just snapshot + import
    // record removal; there is no previous-import holdings restore.
    if (
      String(target.parser_version ?? "") !==
      TSP_OFFICIAL_CSV_VERSION
    ) {
      await deleteConfirmedSnapshot({
        database,
        householdId,
        snapshotId:
          target.confirmed_snapshot_id == null
            ? null
            : String(target.confirmed_snapshot_id),
      });
      await deleteImportRecord({
        database,
        householdId,
        importId: String(target.id),
      });

      return NextResponse.json({
        ok: true,
        restoredPrevious: false,
        liveDataChanged: false,
      });
    }

    const parsed = candidate(target.parsed_candidate);

    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "This TSP import uses an older format that cannot be safely restored automatically.",
        },
        { status: 409 }
      );
    }

    const matchingBatch = await database
      .from("file_import_batches")
      .select("id,status")
      .eq("household_id", householdId)
      .eq(
        "file_digest",
        String(target.source_content_sha256)
      )
      .limit(1)
      .maybeSingle();

    if (matchingBatch.error) {
      throw new Error(
        `Unable to inspect matching Connect history: ${matchingBatch.error.message}`
      );
    }

    if (matchingBatch.data) {
      return NextResponse.json(
        {
          error:
            "This TSP CSV is managed by Connect Import History. Delete it there so the account rollback remains consistent.",
        },
        { status: 409 }
      );
    }

    const historyResult = await database
      .from("tsp_statement_imports")
      .select(
        "id,source_filename,source_content_sha256,parser_version,parsed_candidate,parsed_statement_date,imported_at"
      )
      .eq("household_id", householdId)
      .eq("parser_version", TSP_OFFICIAL_CSV_VERSION)
      .order("parsed_statement_date", {
        ascending: false,
        nullsFirst: false,
      })
      .order("imported_at", {
        ascending: false,
        nullsFirst: false,
      });

    if (historyResult.error) {
      throw new Error(
        `Unable to load TSP import history: ${historyResult.error.message}`
      );
    }

    const history = historyResult.data ?? [];
    const isLatest =
      String(history[0]?.id ?? "") ===
      String(target.id);

    if (isLatest) {
      const previous =
        history.find(
          (row) =>
            String(row.id) !== String(target.id)
        ) ?? null;

      await restorePreviousTspImport({
        database,
        householdId,
        previous,
        targetCandidate: parsed,
      });
    }

    const confirmedSnapshotId =
      target.confirmed_snapshot_id == null
        ? null
        : String(target.confirmed_snapshot_id);

    await deleteConfirmedSnapshot({
      database,
      householdId,
      snapshotId: confirmedSnapshotId,
    });
    await deleteImportRecord({
      database,
      householdId,
      importId: String(body.importId),
    });

    return NextResponse.json({
      ok: true,
      restoredPrevious: isLatest && history.length > 1,
      liveDataChanged: isLatest,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to delete TSP import.",
      },
      { status: 500 }
    );
  }
}
