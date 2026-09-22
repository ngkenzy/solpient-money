import { NextResponse } from "next/server";
import { ConnectAuthError, getConnectHouseholdContext } from "@/lib/connect/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabase, householdId } = await getConnectHouseholdContext();
    const url = new URL(request.url);
    const signature = url.searchParams.get("signature")?.trim();

    if (!signature) {
      return NextResponse.json({ error: "Missing format signature." }, { status: 400 });
    }

    const { data: profile, error } = await supabase
      .from("file_import_profiles")
      .select("*")
      .eq("household_id", householdId)
      .eq("format_signature", signature)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, profile: profile ?? null });
  } catch (error) {
    const status = error instanceof ConnectAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load import profile." },
      { status }
    );
  }
}
