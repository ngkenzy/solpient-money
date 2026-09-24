import { NextResponse } from "next/server";
import { runTruthEngineForHousehold } from "@/lib/truth-engine";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const summary = await runTruthEngineForHousehold();

    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reconcile imported financial data.",
      },
      { status: 500 }
    );
  }
}
