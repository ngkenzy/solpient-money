import Link from "next/link";
import {
  Cable,
  DatabaseZap,
  FileSpreadsheet,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import FileImportWorkbench from "@/components/FileImportWorkbench";
import { requireActiveHousehold } from "@/lib/money-auth";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function ConnectPage() {
  const { supabase, householdId } = await requireActiveHousehold();

  const [{ data: accounts }, { data: batches }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,institution,account_type,source")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .in("source", ["manual", "file"])
      .order("created_at", { ascending: true }),
    supabase
      .from("file_import_batches")
      .select("id,file_name,file_format,record_type,total_records,imported_records,duplicate_records,status,created_at,target_account_id")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const importAccounts = (accounts ?? []).map((account) => ({
    id: String(account.id),
    name: String(account.name),
    institution: String(account.institution),
    type: String(account.account_type),
    source: String(account.source),
  }));

  return (
    <div className="page">
      <PageHeader
        eyebrow="SOLPIENT CONNECT V1"
        title="Your financial data, without one-provider lock-in."
        description="Import bank transactions and investment positions directly from CSV, QFX, or OFX. Solpient normalizes every source into the same Money model."
        action={<span className="live-pill connected">FILE CONNECTOR LIVE</span>}
      />

      <div className="connector-grid">
        <section className="card connector-card active">
          <FileSpreadsheet size={21} />
          <div><span className="card-kicker">NATIVE</span><strong>CSV / QFX / OFX</strong><p>Private browser parsing, normalized imports, duplicate protection.</p></div>
          <span className="connection-status active">live</span>
        </section>

        <section className="card connector-card">
          <DatabaseZap size={21} />
          <div><span className="card-kicker">AGGREGATOR</span><strong>Plaid Sandbox</strong><p>Automatic test banking and investment connections remain available.</p></div>
          <Link href="/connections">Open Plaid</Link>
        </section>

        <section className="card connector-card future">
          <Landmark size={21} />
          <div><span className="card-kicker">DIRECT API</span><strong>FDX / OAuth</strong><p>Adapter slot reserved for approved direct institution connections.</p></div>
          <span>future</span>
        </section>

        <section className="card connector-card future">
          <Cable size={21} />
          <div><span className="card-kicker">DIRECT LEGACY</span><strong>OFX endpoint</strong><p>The same OFX parser can later power direct OFX downloads where institutions permit them.</p></div>
          <span>future</span>
        </section>
      </div>

      <FileImportWorkbench accounts={importAccounts} />

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">IMPORT HISTORY</span><h2>Audit trail</h2></div>
          <span className="small-muted">{batches?.length ?? 0} recent batch{batches?.length === 1 ? "" : "es"}</span>
        </div>

        {(batches?.length ?? 0) ? (
          <div className="connect-history">
            {(batches ?? []).map((batch) => (
              <div className="connect-history-row" key={batch.id}>
                <span className="connect-file-icon"><FileSpreadsheet size={17} /></span>
                <div>
                  <strong>{batch.file_name}</strong>
                  <span>{String(batch.file_format).toUpperCase()} · {batch.record_type} · {formatDate(String(batch.created_at))}</span>
                </div>
                <div><span>Imported</span><strong>{batch.imported_records}</strong></div>
                <div><span>Duplicates</span><strong>{batch.duplicate_records}</strong></div>
                <span className={"connection-status " + batch.status}>{batch.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-connection-state">
            <FileSpreadsheet size={25} />
            <strong>No file imports yet</strong>
            <span>Your first completed import will appear here with its audit counts.</span>
          </div>
        )}
      </section>

      <section className="card page-card connect-principle">
        <ShieldCheck size={20} />
        <div>
          <strong>Solpient owns the normalized financial model.</strong>
          <span>CSV/QFX/OFX, Plaid, and future FDX connectors all feed the same account, transaction, holding, and liability model. Provider-specific schemas stay at the edge.</span>
        </div>
      </section>
    </div>
  );
}
