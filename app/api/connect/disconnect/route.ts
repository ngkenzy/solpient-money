import { NextResponse } from "next/server";
import {
  ConnectAuthError,
  getConnectHouseholdContext,
} from "@/lib/connect/auth";
import {
  isConnectorId,
  runConnectorDisconnect,
} from "@/lib/connect/registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      connectorId?: string;
      instanceId?: string;
    };

    if (!body.connectorId || !isConnectorId(body.connectorId)) {
      return NextResponse.json(
        { error: "Unknown or missing connector id." },
        { status: 400 }
      );
    }
    if (!body.instanceId) {
      return NextResponse.json(
        { error: "Missing connector instance id." },
        { status: 400 }
      );
    }

    const { supabase, householdId } =
      await getConnectHouseholdContext();

    const result = await runConnectorDisconnect(
      body.connectorId,
      { supabase, householdId },
      body.instanceId
    );

    return NextResponse.json(result, {
      status: result.ok ? 200 : 409,
    });
  } catch (error) {
    const status =
      error instanceof ConnectAuthError
        ? error.status
        : error instanceof Error &&
            /does not support disconnect/i.test(error.message)
          ? 409
          : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Connector disconnect failed.",
      },
      { status }
    );
  }
}
