import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ConnectAuthError, getConnectHouseholdContext } from "@/lib/connect/auth";
import { analyzeConnectImport } from "@/lib/connect/reconciliation";
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
  rememberFormat?: boolean;
  newAccount?: {
    name?: string;
    institution?: string;
    accountType?: "cash" | "investment" | "retirement" | "debt";
    lastFour?: string;
  };
  parsed?: ParsedFinancialFile;
};

type MoneyAccount = {
  id: string;
  name: string;
  institution: string;
  account_type: string;
  source: string;
  balance_cents: number | string | null;
  last_four?: string | null;
};

function cents(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100);
}

function dollars(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
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
    parsed.kind === "transactions"
      ? parsed.transactions.length
      : parsed.holdings.length;
  if (total < 1) {
    throw new ConnectAuthError("The import contains no usable records.", 400);
  }
  if (total > 5000) {
    throw new ConnectAuthError(
      "Connect V1.1 accepts up to 5,000 records per file.",
      413
    );
  }
  return total;
}

function normalizeBalanceForAccount(
  value: number | null | undefined,
  accountType: string
) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const amount = Number(value);
  return accountType === "debt" ? -Math.abs(amount) : Math.abs(amount);
}

async function getTargetAccount(
  supabase: Awaited<ReturnType<typeof getConnectHouseholdContext>>["supabase"],
  householdId: string,
  accountId: string
): Promise<MoneyAccount> {
  const { data: account, error } = await supabase
    .from("accounts")
    .select("id,name,institution,account_type,source,balance_cents,last_four")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .single();

  if (error || !account) {
    throw new ConnectAuthError("Target account not found.", 404);
  }
  if (!["manual", "file"].includes(String(account.source))) {
    throw new ConnectAuthError(
      "File imports must use a manual/file account so provider data remains isolated.",
      409
    );
  }
  return account as MoneyAccount;
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

function uniqueTransactionCandidates(parsed: ParsedFinancialFile) {
  const seen = new Set<string>();
  let withinFileDuplicates = 0;
  const candidates =
    parsed.kind !== "transactions"
      ? []
      : parsed.transactions.flatMap((transaction) => {
          const fingerprint = transactionFingerprint(transaction);
          if (seen.has(fingerprint)) {
            withinFileDuplicates += 1;
            return [];
          }
          seen.add(fingerprint);
          return [{ transaction, fingerprint }];
        });

  return { candidates, withinFileDuplicates };
}

function uniqueHoldings(parsed: ParsedFinancialFile) {
  const seen = new Set<string>();
  let withinFileDuplicates = 0;
  const holdings =
    parsed.kind !== "holdings"
      ? []
      : parsed.holdings.filter((holding) => {
          const ticker = holding.ticker.toUpperCase();
          if (seen.has(ticker)) {
            withinFileDuplicates += 1;
            return false;
          }
          seen.add(ticker);
          return true;
        });
  return { holdings, withinFileDuplicates };
}

async function prepareImport(
  body: ImportRequest,
  parsed: ParsedFinancialFile,
  total: number
) {
  const { supabase, householdId } = await getConnectHouseholdContext();
  const targetExists = Boolean(body.targetAccountId);
  const account = body.targetAccountId
    ? await getTargetAccount(supabase, householdId, body.targetAccountId)
    : null;
  const accountType =
    account?.account_type ??
    body.newAccount?.accountType ??
    parsed.accountType ??
    (parsed.kind === "holdings" ? "investment" : "cash");
  const currentBalance = account ? dollars(account.balance_cents) : null;

  let withinFileDuplicates = 0;
  let existingDuplicates = 0;
  let estimatedUpdates = 0;
  let newTransactionNet = 0;
  let transactionRows: Array<{
    transaction: ParsedTransaction;
    fingerprint: string;
  }> = [];
  let holdingRows: ParsedHolding[] = [];

  if (parsed.kind === "transactions") {
    const unique = uniqueTransactionCandidates(parsed);
    withinFileDuplicates = unique.withinFileDuplicates;
    transactionRows = unique.candidates;

    if (account) {
      const existing = await existingTransactionFingerprints(
        supabase,
        householdId,
        String(account.id),
        transactionRows.map((item) => item.fingerprint)
      );
      existingDuplicates = existing.size;
      transactionRows = transactionRows.filter(
        (item) => !existing.has(item.fingerprint)
      );
    }

    newTransactionNet = transactionRows.reduce(
      (sum, item) => sum + item.transaction.amount,
      0
    );
  } else {
    const unique = uniqueHoldings(parsed);
    withinFileDuplicates = unique.withinFileDuplicates;
    holdingRows = unique.holdings;

    if (account && holdingRows.length) {
      const tickers = holdingRows.map((holding) =>
        holding.ticker.toUpperCase()
      );
      for (let index = 0; index < tickers.length; index += 200) {
        const { data, error } = await supabase
          .from("holdings")
          .select("ticker")
          .eq("household_id", householdId)
          .eq("account_id", account.id)
          .in("ticker", tickers.slice(index, index + 200));
        if (error) {
          throw new Error(
            `Holding duplicate lookup failed: ${error.message}`
          );
        }
        estimatedUpdates += data?.length ?? 0;
      }
    }
  }

  const statementBalance = normalizeBalanceForAccount(
    parsed.closingBalance,
    accountType
  );
  const openingBalance = normalizeBalanceForAccount(
    parsed.openingBalance,
    accountType
  );
  const analyzedParsed: ParsedFinancialFile = {
    ...parsed,
    openingBalance: openingBalance ?? undefined,
    closingBalance: statementBalance ?? undefined,
  };

  const duplicateCount =
    withinFileDuplicates +
    (parsed.kind === "transactions" ? existingDuplicates : 0);

  const analysis = analyzeConnectImport({
    parsed: analyzedParsed,
    currentBalance,
    targetExists,
    newTransactionNet,
    duplicateCount,
    totalRecords: total,
  });

  const { data: prior } = await supabase
    .from("file_import_batches")
    .select("id,created_at,imported_records,duplicate_records,status")
    .eq("household_id", householdId)
    .eq("file_digest", body.fileDigest ?? "")
    .eq("record_type", parsed.kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    supabase,
    householdId,
    account,
    accountType,
    currentBalance,
    transactionRows,
    holdingRows,
    withinFileDuplicates,
    existingDuplicates,
    estimatedUpdates,
    duplicateCount,
    newTransactionNet,
    analysis,
    prior,
    estimatedNew:
      parsed.kind === "transactions"
        ? transactionRows.length
        : Math.max(0, holdingRows.length - estimatedUpdates),
  };
}

async function saveProfile({
  body,
  parsed,
  account,
  householdId,
  supabase,
}: {
  body: ImportRequest;
  parsed: ParsedFinancialFile;
  account: MoneyAccount;
  householdId: string;
  supabase: Awaited<ReturnType<typeof getConnectHouseholdContext>>["supabase"];
}) {
  if (body.rememberFormat === false || !parsed.formatSignature) return null;

  const { data: existing } = await supabase
    .from("file_import_profiles")
    .select("id,usage_count")
    .eq("household_id", householdId)
    .eq("format_signature", parsed.formatSignature)
    .maybeSingle();

  const now = new Date().toISOString();
  const profileName = `${account.institution || "Imported"} ${parsed.kind}`;

  const { data, error } = await supabase
    .from("file_import_profiles")
    .upsert(
      {
        household_id: householdId,
        format_signature: parsed.formatSignature,
        file_format: parsed.format,
        record_type: parsed.kind,
        profile_name: profileName.slice(0, 160),
        institution: account.institution,
        preferred_account_id: account.id,
        account_name: account.name,
        account_type: account.account_type,
        last_four: account.last_four ?? null,
        column_mapping: parsed.columnMapping ?? {},
        usage_count: Number(existing?.usage_count ?? 0) + 1,
        last_used_at: now,
        updated_at: now,
      },
      { onConflict: "household_id,format_signature" }
    )
    .select("id")
    .single();

  if (error) throw new Error(`Unable to remember import format: ${error.message}`);
  return data?.id ? String(data.id) : existing?.id ? String(existing.id) : null;
}

export async function POST(request: Request) {
  let batchId: string | null = null;
  let cleanupAccountId: string | null = null;
  let cleanupCreatedAccount = false;

  try {
    const body = (await request.json()) as ImportRequest;
    const parsed = body.parsed;
    const total = validateParsed(parsed);

    if (!body.fileName || !body.fileDigest) {
      throw new ConnectAuthError("Missing file identity.", 400);
    }

    const prepared = await prepareImport(body, parsed!, total);

    if (body.action === "preview") {
      return NextResponse.json({
        ok: true,
        preview: {
          total,
          withinFileDuplicates: prepared.withinFileDuplicates,
          existingDuplicates: prepared.existingDuplicates,
          estimatedUpdates: prepared.estimatedUpdates,
          estimatedNew: prepared.estimatedNew,
          priorFileImport: prepared.prior ?? null,
          analysis: prepared.analysis,
        },
      });
    }

    const {
      supabase,
      householdId,
      accountType,
      currentBalance,
      transactionRows,
      holdingRows,
      duplicateCount,
      analysis,
    } = prepared;

    let account = prepared.account;
    let accountId = body.targetAccountId ?? null;
    let createdAccount = false;

    if (!accountId) {
      const newName =
        body.newAccount?.name?.trim() ||
        parsed!.accountName ||
        "Imported account";
      const institution =
        body.newAccount?.institution?.trim() ||
        parsed!.institutionGuess ||
        "File import";

      const { data: created, error } = await supabase
        .from("accounts")
        .insert({
          household_id: householdId,
          name: newName.slice(0, 160),
          institution: institution.slice(0, 160),
          account_type: accountType,
          balance_cents: 0,
          owner_scope: "Household",
          last_four:
            (body.newAccount?.lastFour || parsed!.accountMask || "").slice(-8) ||
            null,
          source: "file",
          sort_order: 450,
        })
        .select("id,name,institution,account_type,source,balance_cents,last_four")
        .single();

      if (error || !created) {
        throw new Error(
          `Unable to create import account: ${error?.message ?? "unknown error"}`
        );
      }

      account = created as MoneyAccount;
      accountId = String(created.id);
      createdAccount = true;
      cleanupAccountId = accountId;
      cleanupCreatedAccount = true;
    }

    if (!account || !accountId) {
      throw new Error("Import account could not be resolved.");
    }

    let priorHoldings: Record<string, unknown>[] = [];
    if (parsed!.kind === "holdings" && holdingRows.length) {
      const tickers = holdingRows.map((holding) =>
        holding.ticker.toUpperCase()
      );
      const { data, error } = await supabase
        .from("holdings")
        .select("*")
        .eq("household_id", householdId)
        .eq("account_id", accountId)
        .in("ticker", tickers);

      if (error) {
        throw new Error(`Unable to snapshot prior holdings: ${error.message}`);
      }
      priorHoldings = (data ?? []) as Record<string, unknown>[];
    }

    const preBalance = createdAccount ? null : currentBalance;
    const now = new Date().toISOString();

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
        duplicate_records: duplicateCount,
        status: "imported",
        pre_import_balance_cents:
          preBalance == null ? null : cents(preBalance),
        statement_balance_cents:
          analysis.statementBalance == null
            ? null
            : cents(analysis.statementBalance),
        post_import_balance_cents:
          analysis.postImportBalance == null
            ? null
            : cents(analysis.postImportBalance),
        reconciliation_delta_cents:
          analysis.reconciliationDelta == null
            ? null
            : cents(analysis.reconciliationDelta),
        anomaly_count: analysis.anomalies.length,
        rollback_payload: { priorHoldings },
        created_account: createdAccount,
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      throw new Error(
        `Unable to create import audit record: ${batchError?.message ?? "unknown error"}`
      );
    }
    batchId = String(batch.id);

    let importedRecords = 0;

    if (parsed!.kind === "transactions") {
      const rows = transactionRows.map(({ transaction, fingerprint }) => ({
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
      }));

      for (let index = 0; index < rows.length; index += 500) {
        const chunk = rows.slice(index, index + 500);
        const { error } = await supabase.from("transactions").insert(chunk);
        if (error) {
          throw new Error(`Transaction import failed: ${error.message}`);
        }
        importedRecords += chunk.length;
      }
    } else {
      const rows = holdingRows.map((holding) => ({
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
        if (error) {
          throw new Error(`Holding import failed: ${error.message}`);
        }
        importedRecords = rows.length;
      }
    }

    const accountUpdate: Record<string, unknown> = {
      last_file_import_at: now,
      updated_at: now,
    };
    if (analysis.postImportBalance != null) {
      accountUpdate.balance_cents = cents(analysis.postImportBalance);
    }

    const { error: accountUpdateError } = await supabase
      .from("accounts")
      .update(accountUpdate)
      .eq("id", accountId)
      .eq("household_id", householdId);
    if (accountUpdateError) {
      throw new Error(
        `Unable to update imported account: ${accountUpdateError.message}`
      );
    }

    const profileId = await saveProfile({
      body,
      parsed: parsed!,
      account,
      householdId,
      supabase,
    });

    const { error: updateError } = await supabase
      .from("file_import_batches")
      .update({
        imported_records: importedRecords,
        duplicate_records: duplicateCount,
        anomaly_count: analysis.anomalies.length,
        profile_id: profileId,
        status: "imported",
      })
      .eq("id", batchId)
      .eq("household_id", householdId);

    if (updateError) {
      throw new Error(
        `Unable to finalize import audit record: ${updateError.message}`
      );
    }

    return NextResponse.json({
      ok: true,
      batchId,
      accountId,
      importedRecords,
      duplicateRecords: duplicateCount,
      totalRecords: total,
      analysis,
      remembered: Boolean(profileId),
    });
  } catch (error) {
    try {
      if (batchId) {
        const { supabase, householdId } = await getConnectHouseholdContext();
        const { data: batch } = await supabase
          .from("file_import_batches")
          .select("target_account_id,pre_import_balance_cents,rollback_payload")
          .eq("id", batchId)
          .eq("household_id", householdId)
          .maybeSingle();

        await supabase
          .from("transactions")
          .delete()
          .eq("household_id", householdId)
          .eq("import_batch_id", batchId);
        await supabase
          .from("holdings")
          .delete()
          .eq("household_id", householdId)
          .eq("import_batch_id", batchId);

        const payload = (batch?.rollback_payload ?? {}) as {
          priorHoldings?: Record<string, unknown>[];
        };
        if (Array.isArray(payload.priorHoldings) && payload.priorHoldings.length) {
          await supabase.from("holdings").insert(payload.priorHoldings);
        }

        if (
          batch?.target_account_id &&
          batch.pre_import_balance_cents != null
        ) {
          await supabase
            .from("accounts")
            .update({
              balance_cents: batch.pre_import_balance_cents,
              updated_at: new Date().toISOString(),
            })
            .eq("id", batch.target_account_id)
            .eq("household_id", householdId);
        }

        await supabase
          .from("file_import_batches")
          .update({ status: "failed" })
          .eq("id", batchId)
          .eq("household_id", householdId);
      }

      if (cleanupCreatedAccount && cleanupAccountId) {
        const { supabase, householdId } = await getConnectHouseholdContext();
        const [{ count: txCount }, { count: holdingCount }] = await Promise.all([
          supabase
            .from("transactions")
            .select("id", { count: "exact", head: true })
            .eq("household_id", householdId)
            .eq("account_id", cleanupAccountId),
          supabase
            .from("holdings")
            .select("id", { count: "exact", head: true })
            .eq("household_id", householdId)
            .eq("account_id", cleanupAccountId),
        ]);
        if ((txCount ?? 0) === 0 && (holdingCount ?? 0) === 0) {
          await supabase
            .from("accounts")
            .delete()
            .eq("id", cleanupAccountId)
            .eq("household_id", householdId);
        }
      }
    } catch {
      // Preserve the original import error.
    }

    const status = error instanceof ConnectAuthError ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "File import failed.",
      },
      { status }
    );
  }
}
