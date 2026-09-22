import { requireActiveHousehold } from "@/lib/money-auth";

export class PlaidAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "PlaidAuthError";
    this.status = status;
  }
}

export async function getPlaidHouseholdContext() {
  try {
    const context = await requireActiveHousehold();
    return {
      database: context.database,
      // Compatibility alias for the Plaid connector migration.
      supabase: context.database,
      userId: context.userId,
      householdId: context.householdId,
    };
  } catch (error) {
    throw new PlaidAuthError(
      error instanceof Error
        ? error.message
        : "Create a local Money household before connecting Plaid.",
      409
    );
  }
}
