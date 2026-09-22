import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/setup";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/setup", url.origin));
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=Unable%20to%20confirm%20the%20authentication%20session", url.origin)
  );
}
