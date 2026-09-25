import { NextResponse } from "next/server";
import {
  ConnectAuthError,
  getConnectHouseholdContext,
} from "@/lib/connect/auth";
import { createEncryptedBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Create an encrypted backup of the local database and return it as a
 * file download. A server-side copy is also kept in backups/ so the
 * Data page backup-health check stays accurate.
 */
export async function POST() {
  try {
    await getConnectHouseholdContext();
    const { filename, artifact } =
      await createEncryptedBackup();

    return new NextResponse(new Uint8Array(artifact), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(artifact.length),
      },
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
            : "Backup failed.",
      },
      { status }
    );
  }
}
