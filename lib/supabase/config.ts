export type MoneySupabaseConfig = {
  url: string;
  publishableKey: string;
};

export function getMoneySupabaseConfig(): MoneySupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_MONEY_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_MONEY_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) return null;
  return { url: url.replace(/\/$/, ""), publishableKey };
}

export function isMoneySupabaseConfigured() {
  return getMoneySupabaseConfig() !== null;
}
