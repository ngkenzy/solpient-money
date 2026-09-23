import { NextResponse } from "next/server";
import { getMoneyActionCenter } from "@/lib/money-action-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const center = await getMoneyActionCenter();

    return NextResponse.json({
      ok: true,
      counts: center.counts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Action Center count.",
      },
      { status: 500 }
    );
  }
}
