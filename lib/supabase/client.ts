import { createBrowserClient } from "@supabase/ssr";
import { getMoneySupabaseConfig } from "@/lib/supabase/config";

export function createClient() {
  const config = getMoneySupabaseConfig();
  if (!config) {
    throw new Error(
      "Solpient Money Supabase is not configured. Set NEXT_PUBLIC_MONEY_SUPABASE_URL and NEXT_PUBLIC_MONEY_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  return createBrowserClient(config.url, config.publishableKey);
}
