import { NextResponse } from "next/server";
import {
  getMoneyAutopilotBriefing,
  runMoneyAutopilot,
} from "@/lib/money-autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const briefing =
      await getMoneyAutopilotBriefing();

    return NextResponse.json({
      ok: true,
      briefing,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Money Autopilot.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request
      .json()
      .catch(() => ({}))) as {
      force?: unknown;
      runKind?: unknown;
    };

    const briefing =
      await runMoneyAutopilot({
        force: body.force === true,
        runKind:
          body.runKind === "manual"
            ? "manual"
            : "automatic",
      });

    return NextResponse.json({
      ok: true,
      briefing,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Money Autopilot run failed.",
      },
      { status: 500 }
    );
  }
}
