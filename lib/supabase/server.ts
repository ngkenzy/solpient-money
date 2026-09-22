import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getMoneySupabaseConfig } from "@/lib/supabase/config";

export async function createClient() {
  const config = getMoneySupabaseConfig();
  if (!config) {
    throw new Error(
      "Solpient Money Supabase is not configured. Set NEXT_PUBLIC_MONEY_SUPABASE_URL and NEXT_PUBLIC_MONEY_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components cannot write cookies. proxy.ts refreshes sessions.
        }
      },
    },
  });
}
