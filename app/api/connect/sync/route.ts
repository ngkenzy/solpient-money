import { NextResponse } from "next/server";
import {
  ConnectAuthError,
  getConnectHouseholdContext,
} from "@/lib/connect/auth";
import {
  isConnectorId,
  runConnectorSync,
} from "@/lib/connect/registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      connectorId?: string;
      instanceId?: string;
    };

    if (!body.connectorId || !isConnectorId(body.connectorId)) {
      return NextResponse.json(
        { error: "Unknown or missing connector id." },
        { status: 400 }
      );
    }

    const { supabase, householdId } =
      await getConnectHouseholdContext();

    const results = await runConnectorSync(
      body.connectorId,
      { supabase, householdId },
      body.instanceId
    );

    return NextResponse.json({
      ok: results.every((result) => result.ok),
      connectorId: body.connectorId,
      results,
    });
  } catch (error) {
    const status =
      error instanceof ConnectAuthError
        ? error.status
        : error instanceof Error &&
            /not configured|does not support automatic sync/i.test(
              error.message
            )
          ? 503
          : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Connector sync failed.",
      },
      { status }
    );
  }
}
