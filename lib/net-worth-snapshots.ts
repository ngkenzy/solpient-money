import { requireActiveHousehold } from "./money-auth";

export interface NetWorthSnapshotResult {
  recorded: boolean;
  snapshotDate: string;
  assetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Record today's net worth snapshot for the active household.
 *
 * Called from the Overview page, so the net-worth history chart grows one
 * point per day as the app is used. Idempotent: the unique
 * (household_id, snapshot_date) constraint means re-runs on the same day
 * refresh the numbers instead of duplicating rows.
 */
export async function recordDailyNetWorthSnapshot(): Promise<NetWorthSnapshotResult> {
  const { database, householdId } = await requireActiveHousehold();

  const { data: accounts, error: accountsError } = await database
    .from("accounts")
    .select("balance_cents")
    .eq("household_id", householdId)
    .eq("is_active", true);

  if (accountsError) {
    throw new Error(
      `Could not read account balances for the net-worth snapshot: ${accountsError.message}`
    );
  }

  const balances = (accounts ?? []).map((account) =>
    Number((account as { balance_cents?: number | string }).balance_cents ?? 0)
  );
  const assetsCents = balances
    .filter((balance) => balance > 0)
    .reduce((sum, balance) => sum + balance, 0);
  const liabilitiesCents = Math.abs(
    balances
      .filter((balance) => balance < 0)
      .reduce((sum, balance) => sum + balance, 0)
  );
  const netWorthCents = assetsCents - liabilitiesCents;
  const snapshotDate = localDateString(new Date());

  const { error: upsertError } = await database
    .from("net_worth_snapshots")
    .upsert(
      {
        household_id: householdId,
        snapshot_date: snapshotDate,
        assets_cents: assetsCents,
        liabilities_cents: liabilitiesCents,
        net_worth_cents: netWorthCents,
        source: "calculated",
      },
      { onConflict: "household_id,snapshot_date" }
    );

  if (upsertError) {
    throw new Error(
      `Could not record the net-worth snapshot: ${upsertError.message}`
    );
  }

  return {
    recorded: true,
    snapshotDate,
    assetsCents,
    liabilitiesCents,
    netWorthCents,
  };
}
