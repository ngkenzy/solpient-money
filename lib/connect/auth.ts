import { requireActiveHousehold } from "@/lib/money-auth";

export class ConnectAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "ConnectAuthError";
    this.status = status;
  }
}

export async function getConnectHouseholdContext() {
  try {
    const context = await requireActiveHousehold();
    return {
      database: context.database,
      // Compatibility alias for existing connector code.
      supabase: context.database,
      userId: context.userId,
      householdId: context.householdId,
    };
  } catch (error) {
    throw new ConnectAuthError(
      error instanceof Error
        ? error.message
        : "Local Money database is unavailable.",
      409
    );
  }
}
