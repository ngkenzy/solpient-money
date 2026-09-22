import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ConnectAuthError, getConnectHouseholdContext } from "@/lib/connect/auth";
import type {
  ParsedFinancialFile,
  ParsedHolding,
  ParsedTransaction,
} from "@/lib/connect/file-parser";

export const dynamic = "force-dynamic";

type ImportRequest = {
  action?: "preview" | "import";
  fileName?: string;
  fileDigest?: string;
  targetAccountId?: string | null;
  newAccount?: {
    name?: string;
    institution?: string;
    accountType?: "cash" | "investment" | "retirement" | "debt";
    lastFour?: string;
  };
  parsed?: ParsedFinancialFile;
};

function cents(value: number | undefined) {
  const amount = Number(value ?? 0);
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

function normalizedText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function transactionFingerprint(transaction: ParsedTransaction) {
  if (transaction.externalId) {
    return digest(`external:${normalizedText(transaction.externalId)}`);
  }
  return digest(
    [
      transaction.postedAt,
      cents(transaction.amount),
      normalizedText(transaction.merchant),
    ].join("|")
  );
}

function holdingFingerprint(holding: ParsedHolding) {
  return digest(
    [
      holding.ticker.trim().toUpperCase(),
      holding.shares,
      cents(holding.marketValue),
    ].join("|")
  );
}

function validateParsed(parsed: ParsedFinancialFile | undefined) {
  if (!parsed) throw new ConnectAuthError("Missing parsed import payload.", 400);
  const total =
    parsed.kind === "transactions" ? parsed.transactions.length : parsed.holdings.length;
  if (total < 1) throw new ConnectAuthError("The import contains no usable records.", 400);
  if (total > 5000) {
    throw new ConnectAuthError("Connect V1 accepts up to 5,000 records per file.", 413);
  }
  return total;
}

async function getTargetAccount(
  supabase: Awaited<ReturnType<typeof getConnectHouseholdContext>>["supabase"],
  householdId: string,
  accountId: string
) {
  const { data: account, error } = await supabase
    .from("accounts")
    .select("id,name,institution,account_type,source")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .single();

  if (error || !account) throw new ConnectAuthError("Target account not found.", 404);
  if (!["manual", "file"].includes(String(account.source))) {
    throw new ConnectAuthError(
      "File imports must use a manual/file account so Plaid Sandbox data stays isolated.",
      409
    );
  }
  return account;
}

async function existingTransactionFingerprints(
  supabase: Awaited<ReturnType<typeof getConnectHouseholdContext>>["supabase"],
  householdId: string,
  accountId: string,
  fingerprints: string[]
) {
  const existing = new Set<string>();
  for (let index = 0; index < fingerprints.length; index += 200) {
    const chunk = fingerprints.slice(index, index + 200);
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from("transactions")
      .select("import_fingerprint")
      .eq("household_id", householdId)
      .eq("account_id", accountId)
      .eq("source", "file")
      .in("import_fingerprint", chunk);

    if (error) throw new Error(`Duplicate lookup failed: ${error.message}`);
    for (const row of data ?? []) {
      if (row.import_fingerprint) existing.add(String(row.import_fingerprint));
    }
  }
  return existing;
}

async function preview(
  body: ImportRequest,
  parsed: ParsedFinancialFile,
  total: number
) {
  const { supabase, householdId } = await getConnectHouseholdContext();

  const fingerprints =
    parsed.kind === "transactions"
      ? parsed.transactions.map(transactionFingerprint)
      : parsed.holdings.map(holdingFingerprint);

  const unique = new Set(fingerprints);
  const withinFileDuplicates = fingerprints.length - unique.size;
  let existingDuplicates = 0;

  if (body.targetAccountId) {
    const account = await getTargetAccount(supabase, householdId, body.targetAccountId);

    if (parsed.kind === "transactions") {
      const existing = await existingTransactionFingerprints(
        supabase,
        householdId,
        String(account.id),
        Array.from(unique)
      );
      existingDuplicates = existing.size;
    } else {
      const tickers = Array.from(
        new Set(parsed.holdings.map((holding) => holding.ticker.toUpperCase()))
      );
      for (let index = 0; index < tickers.length; index += 200) {
        const { data, error } = await supabase
          .from("holdings")
          .select("ticker")
          .eq("household_id", householdId)
          .eq("account_id", account.id)
          .in("ticker", tickers.slice(index, index + 200));
        if (error) throw new Error(`Holding duplicate lookup failed: ${error.message}`);
        existingDuplicates += data?.length ?? 0;
      }
    }
  }

  const { data: prior } = await supabase
    .from("file_import_batches")
    .select("id,created_at,imported_records,duplicate_records")
    .eq("household_id", householdId)
    .eq("file_digest", body.fileDigest ?? "")
    .eq("record_type", parsed.kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    preview: {
      total,
      withinFileDuplicates,
      existingDuplicates,
      estimatedNew: Math.max(0, total - withinFileDuplicates - existingDuplicates),
      priorFileImport: prior ?? null,
    },
  });
}

export async function POST(request: Request) {
  let batchId: string | null = null;

  try {
    const body = (await request.json()) as ImportRequest;
    const parsed = body.parsed;
    const total = validateParsed(parsed);

    if (!body.fileName || !body.fileDigest) {
      throw new ConnectAuthError("Missing file identity.", 400);
    }

    if (body.action === "preview") {
      return preview(body, parsed!, total);
    }

    const { supabase, householdId } = await getConnectHouseholdContext();

    let accountId = body.targetAccountId ?? null;
    let account: Record<string, unknown> | null = null;

    if (accountId) {
      account = await getTargetAccount(supabase, householdId, accountId);
    } else {
      const newName = body.newAccount?.name?.trim() || parsed!.accountName || "Imported account";
      const institution =
        body.newAccount?.institution?.trim() ||
        parsed!.institutionGuess ||
        "File import";
      const accountType =
        body.newAccount?.accountType ??
        parsed!.accountType ??
        (parsed!.kind === "holdings" ? "investment" : "cash");

      const initialBalance =
        parsed!.closingBalance ??
        (parsed!.kind === "holdings"
          ? parsed!.holdings.reduce((sum, holding) => sum + holding.marketValue, 0)
          : 0);
      const normalizedBalance =
        accountType === "debt" ? -Math.abs(initialBalance) : initialBalance;

      const { data: created, error } = await supabase
        .from("accounts")
        .insert({
          household_id: householdId,
          name: newName.slice(0, 160),
          institution: institution.slice(0, 160),
          account_type: accountType,
          balance_cents: cents(normalizedBalance),
          owner_scope: "Household",
          last_four: (body.newAccount?.lastFour || parsed!.accountMask || "").slice(-8) || null,
          source: "file",
          sort_order: 450,
        })
        .select("id,name,institution,account_type,source")
        .single();

      if (error || !created) {
        throw new Error(`Unable to create import account: ${error?.message ?? "unknown error"}`);
      }
      account = created;
      accountId = String(created.id);
    }

    const { data: batch, error: batchError } = await supabase
      .from("file_import_batches")
      .insert({
        household_id: householdId,
        target_account_id: accountId,
        file_name: body.fileName.slice(0, 240),
        file_format: parsed!.format,
        record_type: parsed!.kind,
        file_digest: body.fileDigest,
        total_records: total,
        imported_records: 0,
        duplicate_records: 0,
        status: "imported",
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      throw new Error(`Unable to create import audit record: ${batchError?.message ?? "unknown error"}`);
    }
    batchId = String(batch.id);

    let importedRecords = 0;
    let duplicateRecords = 0;

    if (parsed!.kind === "transactions") {
      const seen = new Set<string>();
      const candidates = parsed!.transactions.flatMap((transaction) => {
        const fingerprint = transactionFingerprint(transaction);
        if (seen.has(fingerprint)) {
          duplicateRecords += 1;
          return [];
        }
        seen.add(fingerprint);
        return [{ transaction, fingerprint }];
      });

      const existing = await existingTransactionFingerprints(
        supabase,
        householdId,
        accountId!,
        candidates.map((item) => item.fingerprint)
      );

      const rows = candidates.flatMap(({ transaction, fingerprint }) => {
        if (existing.has(fingerprint)) {
          duplicateRecords += 1;
          return [];
        }
        return [{
          household_id: householdId,
          account_id: accountId,
          posted_at: transaction.postedAt,
          merchant: transaction.merchant.slice(0, 240),
          category: (transaction.category || "Uncategorized").slice(0, 160),
          amount_cents: cents(transaction.amount),
          transaction_type: transaction.type,
          note: `Imported from ${body.fileName}`,
          source: "file",
          import_batch_id: batchId,
          import_fingerprint: fingerprint,
        }];
      });

      for (let index = 0; index < rows.length; index += 500) {
        const chunk = rows.slice(index, index + 500);
        const { error } = await supabase.from("transactions").insert(chunk);
        if (error) throw new Error(`Transaction import failed: ${error.message}`);
        importedRecords += chunk.length;
      }
    } else {
      const seen = new Set<string>();
      const uniqueHoldings = parsed!.holdings.filter((holding) => {
        const ticker = holding.ticker.toUpperCase();
        if (seen.has(ticker)) {
          duplicateRecords += 1;
          return false;
        }
        seen.add(ticker);
        return true;
      });

      const tickers = uniqueHoldings.map((holding) => holding.ticker.toUpperCase());
      const existingTickers = new Set<string>();
      for (let index = 0; index < tickers.length; index += 200) {
        const { data, error } = await supabase
          .from("holdings")
          .select("ticker")
          .eq("household_id", householdId)
          .eq("account_id", accountId!)
          .in("ticker", tickers.slice(index, index + 200));
        if (error) throw new Error(`Holding duplicate lookup failed: ${error.message}`);
        for (const row of data ?? []) existingTickers.add(String(row.ticker).toUpperCase());
      }
      duplicateRecords += existingTickers.size;

      const rows = uniqueHoldings.map((holding) => ({
        household_id: householdId,
        account_id: accountId,
        ticker: holding.ticker.toUpperCase(),
        name: holding.name,
        holding_kind: holding.kind,
        shares: holding.shares,
        price: holding.price,
        cost_basis_cents: cents(holding.costBasis),
        market_value_cents: cents(holding.marketValue),
        day_change_pct: 0,
        ytd_return_pct: 0,
        sector: holding.sector || "Other",
        source: "file",
        import_batch_id: batchId,
        import_fingerprint: holdingFingerprint(holding),
      }));

      if (rows.length) {
        const { error } = await supabase.from("holdings").upsert(rows, {
          onConflict: "household_id,account_id,ticker",
        });
        if (error) throw new Error(`Holding import failed: ${error.message}`);
        importedRecords = rows.length;
      }
    }

    if (parsed!.closingBalance != null || parsed!.kind === "holdings") {
      const balance =
        parsed!.closingBalance ??
        parsed!.holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
      const accountType = String(account?.account_type ?? parsed!.accountType);
      const normalizedBalance =
        accountType === "debt" ? -Math.abs(balance) : Math.abs(balance);

      const { error } = await supabase
        .from("accounts")
        .update({
          balance_cents: cents(normalizedBalance),
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId!)
        .eq("household_id", householdId);
      if (error) throw new Error(`Unable to update imported account balance: ${error.message}`);
    }

    const { error: updateError } = await supabase
      .from("file_import_batches")
      .update({
        imported_records: importedRecords,
        duplicate_records: duplicateRecords,
        status: "imported",
      })
      .eq("id", batchId)
      .eq("household_id", householdId);

    if (updateError) throw new Error(`Unable to finalize import audit record: ${updateError.message}`);

    return NextResponse.json({
      ok: true,
      accountId,
      importedRecords,
      duplicateRecords,
      totalRecords: total,
    });
  } catch (error) {
    if (batchId) {
      try {
        const { supabase, householdId } = await getConnectHouseholdContext();
        await supabase
          .from("file_import_batches")
          .update({ status: "failed" })
          .eq("id", batchId)
          .eq("household_id", householdId);
      } catch {
        // Preserve the original import error.
      }
    }

    const status = error instanceof ConnectAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "File import failed." },
      { status }
    );
  }
}
