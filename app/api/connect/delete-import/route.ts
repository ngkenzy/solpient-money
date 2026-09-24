import { NextResponse } from "next/server";
import {
  ConnectAuthError,
  getConnectHouseholdContext,
} from "@/lib/connect/auth";

export const dynamic = "force-dynamic";

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
        "id,file_name,file_digest,status,target_account_id"
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

    if (batch.status === "imported") {
      return NextResponse.json(
        {
          error:
            "Undo this import before permanently deleting its history.",
        },
        { status: 409 }
      );
    }

    const digest = String(batch.file_digest ?? "");
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
