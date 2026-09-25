import { NextResponse } from "next/server";
import {
  ConnectAuthError,
  getConnectHouseholdContext,
} from "@/lib/connect/auth";
import {
  BackupValidationError,
  restoreBackupArtifact,
} from "@/lib/backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Restore the local database from an uploaded encrypted backup file.
 * The artifact is decrypted and authenticated BEFORE anything is
 * written — a foreign or tampered file never touches live data.
 */
export async function POST(request: Request) {
  try {
    await getConnectHouseholdContext();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Choose a backup file to restore." },
        { status: 400 }
      );
    }

    const artifact = Buffer.from(
      await file.arrayBuffer()
    );
    restoreBackupArtifact(artifact);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status =
      error instanceof ConnectAuthError
        ? error.status
        : error instanceof BackupValidationError
          ? 400
          : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Restore failed.",
      },
      { status }
    );
  }
}
