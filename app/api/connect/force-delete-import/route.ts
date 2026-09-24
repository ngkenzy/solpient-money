import { NextResponse } from "next/server";
import {
  ConnectAuthError,
  getConnectHouseholdContext,
} from "@/lib/connect/auth";

export const dynamic = "force-dynamic";

function numberOrNull(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  try {
    const { database, householdId } =
      await getConnectHouseholdContext();
    const body = (await request.json()) as {
      batchId?: string;
    };

    if (!body.batchId) {
      return NextResponse.json(
        { error: "Missing batch id." },
        { status: 400 }
      );
    }

    const batchResult = await database
      .from("file_import_batches")
      .select("*")
      .eq("id", body.batchId)
      .eq("household_id", householdId)
      .single();

    if (batchResult.error || !batchResult.data) {
      return NextResponse.json(
        { error: "Import batch not found." },
        { status: 404 }
      );
    }

    const batch = batchResult.data;
    const batchId = String(batch.id);
    const accountId =
      batch.target_account_id == null
        ? null
        : String(batch.target_account_id);

    const [txDelete, holdingDelete] = await Promise.all([
      database
        .from("transactions")
        .delete()
        .eq("household_id", householdId)
        .eq("import_batch_id", batchId),
      database
        .from("holdings")
        .delete()
        .eq("household_id", householdId)
        .eq("import_batch_id", batchId),
    ]);

    if (txDelete.error) {
      throw new Error(
        `Unable to purge imported transactions: ${txDelete.error.message}`
      );
    }
    if (holdingDelete.error) {
      throw new Error(
        `Unable to purge imported holdings: ${holdingDelete.error.message}`
      );
    }

    const digest = String(batch.file_digest ?? "");
    if (digest) {
      const tspRows = await database
        .from("tsp_statement_imports")
        .select("id")
        .eq("household_id", householdId)
        .eq("source_content_sha256", digest);

      if (tspRows.error) {
        throw new Error(
          `Unable to inspect matching TSP history: ${tspRows.error.message}`
        );
      }

      const ids = (tspRows.data ?? []).map((row) =>
        String(row.id)
      );

      if (ids.length) {
        const tspDelete = await database
          .from("tsp_statement_imports")
          .delete()
          .eq("household_id", householdId)
          .in("id", ids);

        if (tspDelete.error) {
          throw new Error(
            `Unable to purge matching TSP import history: ${tspDelete.error.message}`
          );
        }
      }
    }

    const batchDelete = await database
      .from("file_import_batches")
      .delete()
      .eq("id", batchId)
      .eq("household_id", householdId);

    if (batchDelete.error) {
      throw new Error(
        `Unable to purge import history: ${batchDelete.error.message}`
      );
    }

    let accountDeleted = false;

    if (accountId) {
      const [
        remainingTx,
        remainingHoldings,
        remainingBatches,
        latestBatch,
      ] = await Promise.all([
        database
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("household_id", householdId)
          .eq("account_id", accountId),
        database
          .from("holdings")
          .select("market_value_cents")
          .eq("household_id", householdId)
          .eq("account_id", accountId),
        database
          .from("file_import_batches")
          .select("id", { count: "exact", head: true })
          .eq("household_id", householdId)
          .eq("target_account_id", accountId)
          .eq("status", "imported"),
        database
          .from("file_import_batches")
          .select("created_at,record_type,post_import_balance_cents")
          .eq("household_id", householdId)
          .eq("target_account_id", accountId)
          .eq("status", "imported")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (remainingTx.error) {
        throw new Error(
          `Unable to inspect remaining transactions: ${remainingTx.error.message}`
        );
      }
      if (remainingHoldings.error) {
        throw new Error(
          `Unable to inspect remaining holdings: ${remainingHoldings.error.message}`
        );
      }
      if (remainingBatches.error) {
        throw new Error(
          `Unable to inspect remaining imports: ${remainingBatches.error.message}`
        );
      }
      if (latestBatch.error) {
        throw new Error(
          `Unable to inspect latest remaining import: ${latestBatch.error.message}`
        );
      }

      const holdings = remainingHoldings.data ?? [];
      const txCount = remainingTx.count ?? 0;
      const batchCount = remainingBatches.count ?? 0;

      if (
        Boolean(batch.created_account) &&
        txCount === 0 &&
        holdings.length === 0 &&
        batchCount === 0
      ) {
        const accountDelete = await database
          .from("accounts")
          .delete()
          .eq("id", accountId)
          .eq("household_id", householdId);

        if (accountDelete.error) {
          throw new Error(
            `Unable to delete now-empty imported account: ${accountDelete.error.message}`
          );
        }

        accountDeleted = true;
      } else {
        const update: Record<string, unknown> = {
          last_file_import_at:
            latestBatch.data?.created_at ?? null,
          updated_at: new Date().toISOString(),
        };

        if (String(batch.record_type) === "holdings") {
          if (holdings.length > 0) {
            update.balance_cents = holdings.reduce(
              (sum, row) =>
                sum +
                Number(row.market_value_cents ?? 0),
              0
            );
          } else {
            update.balance_cents =
              numberOrNull(batch.pre_import_balance_cents) ??
              0;
          }
        } else if (!latestBatch.data) {
          const preImportBalance =
            numberOrNull(batch.pre_import_balance_cents);
          if (preImportBalance != null) {
            update.balance_cents = preImportBalance;
          }
        }

        const accountUpdate = await database
          .from("accounts")
          .update(update)
          .eq("id", accountId)
          .eq("household_id", householdId);

        if (accountUpdate.error) {
          throw new Error(
            `Unable to reconcile account after purge: ${accountUpdate.error.message}`
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      purged: true,
      accountDeleted,
    });
  } catch (error) {
    const status =
      error instanceof ConnectAuthError
        ? error.status
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to force-delete this import.",
      },
      { status }
    );
  }
}
