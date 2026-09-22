import { NextResponse } from "next/server";
import { ConnectAuthError, getConnectHouseholdContext } from "@/lib/connect/auth";

export const dynamic = "force-dynamic";

type PriorHolding = {
  id?: string;
  household_id: string;
  account_id: string | null;
  ticker: string;
  name: string;
  holding_kind: string;
  shares: number;
  price: number;
  cost_basis_cents: number;
  market_value_cents: number;
  day_change_pct: number;
  ytd_return_pct: number;
  sector: string;
  source: string;
  import_batch_id?: string | null;
  import_fingerprint?: string | null;
  plaid_connection_id?: string | null;
  plaid_security_id?: string | null;
  plaid_account_id?: string | null;
};

export async function POST(request: Request) {
  try {
    const { supabase, householdId } = await getConnectHouseholdContext();
    const body = (await request.json()) as { batchId?: string };

    if (!body.batchId) {
      return NextResponse.json({ error: "Missing batch id." }, { status: 400 });
    }

    const { data: batch, error } = await supabase
      .from("file_import_batches")
      .select("*")
      .eq("id", body.batchId)
      .eq("household_id", householdId)
      .single();

    if (error || !batch) {
      return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
    }

    if (batch.status !== "imported") {
      return NextResponse.json(
        { error: batch.status === "undone" ? "This import was already undone." : "Only completed imports can be undone." },
        { status: 409 }
      );
    }

    const accountId = batch.target_account_id ? String(batch.target_account_id) : null;

    if (accountId) {
      const { data: newer } = await supabase
        .from("file_import_batches")
        .select("id,file_name,created_at")
        .eq("household_id", householdId)
        .eq("target_account_id", accountId)
        .eq("status", "imported")
        .gt("created_at", batch.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (newer) {
        return NextResponse.json(
          {
            error: `Undo the newer import "${newer.file_name}" first so account history remains consistent.`,
          },
          { status: 409 }
        );
      }
    }

    if (batch.record_type === "transactions") {
      const { error: deleteError } = await supabase
        .from("transactions")
        .delete()
        .eq("household_id", householdId)
        .eq("import_batch_id", batch.id);
      if (deleteError) throw new Error(`Unable to remove imported transactions: ${deleteError.message}`);
    } else {
      const { error: deleteError } = await supabase
        .from("holdings")
        .delete()
        .eq("household_id", householdId)
        .eq("import_batch_id", batch.id);
      if (deleteError) throw new Error(`Unable to remove imported holdings: ${deleteError.message}`);

      const payload = (batch.rollback_payload ?? {}) as { priorHoldings?: PriorHolding[] };
      const priorHoldings = Array.isArray(payload.priorHoldings) ? payload.priorHoldings : [];

      if (priorHoldings.length) {
        const rows = priorHoldings.map((holding) => ({
          id: holding.id,
          household_id: householdId,
          account_id: holding.account_id,
          ticker: holding.ticker,
          name: holding.name,
          holding_kind: holding.holding_kind,
          shares: holding.shares,
          price: holding.price,
          cost_basis_cents: holding.cost_basis_cents,
          market_value_cents: holding.market_value_cents,
          day_change_pct: holding.day_change_pct,
          ytd_return_pct: holding.ytd_return_pct,
          sector: holding.sector,
          source: holding.source,
          import_batch_id: holding.import_batch_id ?? null,
          import_fingerprint: holding.import_fingerprint ?? null,
          plaid_connection_id: holding.plaid_connection_id ?? null,
          plaid_security_id: holding.plaid_security_id ?? null,
          plaid_account_id: holding.plaid_account_id ?? null,
        }));
        const { error: restoreError } = await supabase.from("holdings").insert(rows);
        if (restoreError) throw new Error(`Unable to restore prior holdings: ${restoreError.message}`);
      }
    }

    const undoneAt = new Date().toISOString();
    const { error: batchUpdateError } = await supabase
      .from("file_import_batches")
      .update({ status: "undone", undone_at: undoneAt })
      .eq("id", batch.id)
      .eq("household_id", householdId);

    if (batchUpdateError) throw new Error(batchUpdateError.message);

    if (accountId) {
      if (batch.created_account) {
        const [{ count: txCount }, { count: holdingCount }] = await Promise.all([
          supabase
            .from("transactions")
            .select("id", { count: "exact", head: true })
            .eq("household_id", householdId)
            .eq("account_id", accountId),
          supabase
            .from("holdings")
            .select("id", { count: "exact", head: true })
            .eq("household_id", householdId)
            .eq("account_id", accountId),
        ]);

        if ((txCount ?? 0) === 0 && (holdingCount ?? 0) === 0) {
          const { error: accountDeleteError } = await supabase
            .from("accounts")
            .delete()
            .eq("id", accountId)
            .eq("household_id", householdId);
          if (accountDeleteError) throw new Error(accountDeleteError.message);
          return NextResponse.json({ ok: true, accountDeleted: true });
        }
      }

      const { data: latest } = await supabase
        .from("file_import_batches")
        .select("created_at")
        .eq("household_id", householdId)
        .eq("target_account_id", accountId)
        .eq("status", "imported")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const update: Record<string, unknown> = {
        last_file_import_at: latest?.created_at ?? null,
        updated_at: undoneAt,
      };

      if (batch.pre_import_balance_cents != null) {
        update.balance_cents = batch.pre_import_balance_cents;
      }

      const { error: accountUpdateError } = await supabase
        .from("accounts")
        .update(update)
        .eq("id", accountId)
        .eq("household_id", householdId);
      if (accountUpdateError) throw new Error(accountUpdateError.message);
    }

    return NextResponse.json({ ok: true, accountDeleted: false });
  } catch (error) {
    const status = error instanceof ConnectAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to undo import." },
      { status }
    );
  }
}
