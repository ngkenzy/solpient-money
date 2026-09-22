export type MoneySupabaseConfig = {
  url: string;
  publishableKey: string;
};

const DEFAULT_MONEY_SUPABASE_URL = "https://lvbkyxnptohcwqtuxxxh.supabase.co";
const DEFAULT_MONEY_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WuuXjwPMHnohCu3D9WSP0w_ydWGaEyJ";

export function getMoneySupabaseConfig(): MoneySupabaseConfig {
  const url =
    process.env.NEXT_PUBLIC_MONEY_SUPABASE_URL?.trim() ||
    DEFAULT_MONEY_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_MONEY_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    DEFAULT_MONEY_SUPABASE_PUBLISHABLE_KEY;

  return { url: url.replace(/\/$/, ""), publishableKey };
}

export function isMoneySupabaseConfigured() {
  return true;
}
