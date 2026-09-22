import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMoneySupabaseConfigured } from "@/lib/supabase/config";

export async function GET(request: Request) {
  if (isMoneySupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
