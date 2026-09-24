import { NextResponse } from "next/server";
import {
  ConnectAuthError,
  getConnectHouseholdContext,
} from "@/lib/connect/auth";

export const dynamic = "force-dynamic";

async function removeTaggedRows({
  database,
  householdId,
  batchId,
}: {
  database: Awaited<
    ReturnType<typeof getConnectHouseholdContext>
  >["database"];
  householdId: string;
  batchId: string;
}) {
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
      `Unable to remove imported transactions: ${txDelete.error.message}`
    );
  }
  if (holdingDelete.error) {
    throw new Error(
      `Unable to remove imported holdings: ${holdingDelete.error.message}`
    );
  }
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

    const { data: batch, error } = await database
      .from("file_import_batches")
      .select(
        "id,file_name,file_digest,status,target_account_id,record_type,created_at"
      )
      .eq("id", body.batchId)
      .eq("household_id", householdId)
      .single();

    if (error || !batch) {
      return NextResponse.json(
        { error: "Import batch not found." },
        { status: 404 }
      );
    }

    const accountId =
      batch.target_account_id == null
        ? null
        : String(batch.target_account_id);

    let newerImport:
      | Record<string, unknown>
      | null = null;

    if (accountId) {
      const newerResult = await database
        .from("file_import_batches")
        .select("id,file_name,created_at")
        .eq("household_id", householdId)
        .eq("target_account_id", accountId)
        .eq("record_type", batch.record_type)
        .eq("status", "imported")
        .gt("created_at", batch.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (newerResult.error) {
        throw new Error(
          `Unable to inspect newer imports: ${newerResult.error.message}`
        );
      }

      newerImport = newerResult.data;
    }

    if (
      batch.status === "imported" &&
      !newerImport
    ) {
      return NextResponse.json(
        {
          error:
            "This is the current import for the account. Undo it first so Solpient can restore the prior account state safely.",
          requiresUndo: true,
        },
        { status: 409 }
      );
    }

    // If a newer import already exists, this batch is historical/superseded.
    // Purge any rows still tagged to it, but do not roll account balance or
    // holdings backward to the old pre-import state.
    if (
      batch.status === "imported" &&
      newerImport
    ) {
      await removeTaggedRows({
        database,
        householdId,
        batchId: String(batch.id),
      });
    }

    const digest = String(
      batch.file_digest ?? ""
    );
    let tspAuditDeleted = false;

    if (digest) {
      const { data: tspRows, error: tspReadError } =
        await database
          .from("tsp_statement_imports")
          .select("id")
          .eq("household_id", householdId)
          .eq("source_content_sha256", digest);

      if (tspReadError) {
        throw new Error(
          `Unable to inspect matching TSP import history: ${tspReadError.message}`
        );
      }

      const ids = (tspRows ?? []).map((row) =>
        String(row.id)
      );

      if (ids.length) {
        const { error: tspDeleteError } =
          await database
            .from("tsp_statement_imports")
            .delete()
            .eq("household_id", householdId)
            .in("id", ids);

        if (tspDeleteError) {
          throw new Error(
            `Unable to delete matching TSP import history: ${tspDeleteError.message}`
          );
        }

        tspAuditDeleted = true;
      }
    }

    const { error: deleteError } = await database
      .from("file_import_batches")
      .delete()
      .eq("id", body.batchId)
      .eq("household_id", householdId);

    if (deleteError) {
      throw new Error(
        `Unable to delete import history: ${deleteError.message}`
      );
    }

    return NextResponse.json({
      ok: true,
      batchDeleted: true,
      tspAuditDeleted,
      historicalPurge: Boolean(newerImport),
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
            : "Unable to permanently delete this import.",
      },
      { status }
    );
  }
}
