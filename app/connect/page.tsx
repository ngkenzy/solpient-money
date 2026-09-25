import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import FileImportWorkbench from "@/components/FileImportWorkbench";
import UniversalImportWorkbench from "@/components/UniversalImportWorkbench";
import ImportHistoryActions from "@/components/ImportHistoryActions";
import DeleteTspImportButton from "@/components/DeleteTspImportButton";
import ConnectorRegistryPanel from "@/components/ConnectorRegistryPanel";
import { requireActiveHousehold } from "@/lib/money-auth";
import { getConnectorOverviews } from "@/lib/connect/registry";
import { TSP_OFFICIAL_CSV_VERSION } from "@/lib/tsp-official-csv";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Never";
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

function moneyFromCents(value: unknown) {
  const amount = Number(value ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function freshness(value: string | null) {
  if (!value) {
    return { label: "Never refreshed", stale: true, days: null };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { label: "Unknown", stale: true, days: null };
  }
  const days = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 86_400_000)
  );
  return {
    label:
      days === 0
        ? "Updated today"
        : `${days} day${days === 1 ? "" : "s"} ago`,
    stale: days >= 14,
    days,
  };
}

function reconciliationLabel(delta: unknown, statement: unknown) {
  if (statement == null) return "unavailable";
  if (delta == null) return "captured";
  const statementDollars = Math.abs(Number(statement) / 100);
  const deltaDollars = Math.abs(Number(delta) / 100);
  const tolerance = Math.max(5, statementDollars * 0.005);
  return deltaDollars <= tolerance ? "matched" : "attention";
}

export default async function ConnectPage() {
  const { supabase, householdId } = await requireActiveHousehold();
  const connectorOverviews = await getConnectorOverviews({
    supabase,
    householdId,
  });

  const [
    { data: accounts },
    { data: batches },
    { data: profiles },
    { data: tspImports },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id,name,institution,account_type,source,balance_cents,last_four,last_file_import_at,created_at"
      )
      .eq("household_id", householdId)
      .eq("is_active", true)
      .in("source", ["manual", "file"])
      .order("created_at", { ascending: true }),
    supabase
      .from("file_import_batches")
      .select(
        "id,file_name,file_format,record_type,file_digest,total_records,imported_records,duplicate_records,status,created_at,target_account_id,statement_balance_cents,reconciliation_delta_cents,anomaly_count,undone_at,target_account:accounts(name,institution)"
      )
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("file_import_profiles")
      .select(
        "id,profile_name,file_format,record_type,institution,usage_count,last_used_at"
      )
      .eq("household_id", householdId)
      .order("last_used_at", { ascending: false }),
    supabase
      .from("tsp_statement_imports")
      .select(
        "id,source_filename,source_content_sha256,parser_version,parsed_statement_date,imported_at"
      )
      .eq("household_id", householdId)
      .order("parsed_statement_date", {
        ascending: false,
        nullsFirst: false,
      })
      .order("imported_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(100),
  ]);

  const importAccounts = (accounts ?? []).map((account) => ({
    id: String(account.id),
    name: String(account.name),
    institution: String(account.institution),
    type: String(account.account_type),
    source: String(account.source),
    lastFour: String(account.last_four ?? ""),
  }));

  const fileAccounts = (accounts ?? []).filter(
    (account) =>
      account.source === "file" || account.last_file_import_at != null
  );
  const staleAccounts = fileAccounts.filter(
    (account) =>
      freshness(
        account.last_file_import_at
          ? String(account.last_file_import_at)
          : null
      ).stale
  );
  const anomalyTotal = (batches ?? [])
    .filter((batch) => batch.status === "imported")
    .reduce(
      (sum, batch) => sum + Number(batch.anomaly_count ?? 0),
      0
    );

  const connectDigests = new Set(
    (batches ?? [])
      .map((batch) => String(batch.file_digest ?? ""))
      .filter(Boolean)
  );

  const standaloneTspImports = (tspImports ?? []).filter(
    (item) =>
      !connectDigests.has(
        String(item.source_content_sha256 ?? "")
      )
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="SOLPIENT CONNECT"
        title="One import center. Every financial account."
        description="Drop bank, credit-card, brokerage, retirement, CSV, QFX, or OFX files together. Solpient detects the source, routes each file to the right account, normalizes holdings and transactions, reconciles transfers, and updates the financial model used across Money."
        action={
          <span className="live-pill connected">
            UNIVERSAL IMPORT
          </span>
        }
      />

      <div className="metric-grid four">
        <div className="metric-card">
          <span>Remembered formats</span>
          <strong>{profiles?.length ?? 0}</strong>
          <small>Reusable mappings and account defaults</small>
        </div>
        <div className="metric-card">
          <span>File-linked accounts</span>
          <strong>{fileAccounts.length}</strong>
          <small>Native Connect sources</small>
        </div>
        <div className="metric-card">
          <span>Needs refresh</span>
          <strong>{staleAccounts.length}</strong>
          <small>14+ days since file import</small>
        </div>
        <div className="metric-card">
          <span>Review flags</span>
          <strong>{anomalyTotal}</strong>
          <small>Across recent active import batches</small>
        </div>
      </div>

      <ConnectorRegistryPanel overviews={connectorOverviews} />

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">IMPORT CENTER</span>
            <h2>Which accounts need fresh data?</h2>
          </div>
          <span className="small-muted">
            File sources are considered stale after 14 days
          </span>
        </div>

        {fileAccounts.length ? (
          <div className="connect-freshness-list">
            {fileAccounts.map((account) => {
              const state = freshness(
                account.last_file_import_at
                  ? String(account.last_file_import_at)
                  : null
              );
              return (
                <div
                  className={
                    "connect-freshness-row" +
                    (state.stale ? " stale" : "")
                  }
                  key={account.id}
                >
                  <span className="connect-file-icon">
                    {state.stale ? (
                      <AlertTriangle size={17} />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}
                  </span>
                  <div>
                    <strong>{account.name}</strong>
                    <span>
                      {account.institution} ·{" "}
                      {moneyFromCents(account.balance_cents)}
                    </span>
                  </div>
                  <div>
                    <span>Last file refresh</span>
                    <strong>{state.label}</strong>
                  </div>
                  <span
                    className={
                      "connection-status " +
                      (state.stale ? "attention" : "matched")
                    }
                  >
                    {state.stale ? "needs refresh" : "current"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-connection-state">
            <RefreshCw size={25} />
            <strong>No file-linked accounts yet</strong>
            <span>
              Your first imported account will appear here with freshness
              status.
            </span>
          </div>
        )}
      </section>

      <UniversalImportWorkbench accounts={importAccounts} />

      <details className="connect-advanced-import">
        <summary>
          Advanced single-file mapping
        </summary>
        <p>
          Use this when Solpient does not recognize a new institution yet or when you need to teach it custom columns.
        </p>
        <FileImportWorkbench accounts={importAccounts} />
      </details>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">REMEMBERED FORMATS</span>
            <h2>Import memory</h2>
          </div>
          <span className="small-muted">
            {profiles?.length ?? 0} profile
            {profiles?.length === 1 ? "" : "s"}
          </span>
        </div>

        {(profiles?.length ?? 0) > 0 ? (
          <div className="connect-profile-list">
            {(profiles ?? []).map((profile) => (
              <div className="connect-profile-row" key={profile.id}>
                <span className="connect-file-icon">
                  <FileSpreadsheet size={16} />
                </span>
                <div>
                  <strong>{profile.profile_name}</strong>
                  <span>
                    {String(profile.file_format).toUpperCase()} ·{" "}
                    {profile.record_type}
                    {profile.institution
                      ? ` · ${profile.institution}`
                      : ""}
                  </span>
                </div>
                <div>
                  <span>Used</span>
                  <strong>{profile.usage_count ?? 0}×</strong>
                </div>
                <div>
                  <span>Last recognized</span>
                  <strong>{formatDate(profile.last_used_at)}</strong>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-copy">
            Successful imports can remember their column mapping,
            institution, and destination account automatically.
          </p>
        )}
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">IMPORT HISTORY</span>
            <h2>Audit + rollback trail</h2>
          </div>
          <span className="small-muted">
            {batches?.length ?? 0} recent batch
            {batches?.length === 1 ? "" : "es"}
          </span>
        </div>

        {(batches?.length ?? 0) > 0 ? (
          <div className="connect-history v11">
            {(batches ?? []).map((batch) => {
              const related = batch.target_account as unknown as
                | { name?: string; institution?: string }
                | null;
              const reconciliation = reconciliationLabel(
                batch.reconciliation_delta_cents,
                batch.statement_balance_cents
              );
              return (
                <div className="connect-history-row v11" key={batch.id}>
                  <span className="connect-file-icon">
                    <FileSpreadsheet size={17} />
                  </span>
                  <div>
                    <strong>{batch.file_name}</strong>
                    <span>
                      {String(batch.file_format).toUpperCase()} ·{" "}
                      {batch.record_type} ·{" "}
                      {related?.name ?? "Account removed"} ·{" "}
                      {formatDate(String(batch.created_at))}
                    </span>
                  </div>
                  <div>
                    <span>Imported</span>
                    <strong>{batch.imported_records}</strong>
                  </div>
                  <div>
                    <span>Flags</span>
                    <strong>{batch.anomaly_count ?? 0}</strong>
                  </div>
                  <span
                    className={
                      "connection-status " +
                      (batch.status === "undone"
                        ? "disconnected"
                        : reconciliation)
                    }
                  >
                    {batch.status === "undone"
                      ? "undone"
                      : reconciliation}
                  </span>
                  <ImportHistoryActions
                    batchId={String(batch.id)}
                    fileName={String(batch.file_name)}
                    status={String(batch.status)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-connection-state">
            <FileSpreadsheet size={25} />
            <strong>No file imports yet</strong>
            <span>
              Your first completed import will appear here with
              reconciliation and rollback status.
            </span>
          </div>
        )}
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">TSP CSV HISTORY</span>
            <h2>Standalone TSP imports</h2>
          </div>
          <span className="small-muted">
            {standaloneTspImports.length} import
            {standaloneTspImports.length === 1 ? "" : "s"}
          </span>
        </div>

        <p className="empty-copy">
          These are TSP CSVs imported through the dedicated Thrift Saving Plan
          page rather than Universal Import. Deleting the newest one restores
          the previous TSP CSV when available.
        </p>

        {standaloneTspImports.length ? (
          <div className="connect-history v11">
            {standaloneTspImports.map((item) => (
              <div className="connect-history-row tsp-history" key={item.id}>
                <span className="connect-file-icon">
                  <FileSpreadsheet size={17} />
                </span>
                <div>
                  <strong>
                    {item.source_filename ?? "TSP CSV"}
                  </strong>
                  <span>
                    TSP CSV ·{" "}
                    {item.parsed_statement_date
                      ? `Statement ${item.parsed_statement_date}`
                      : "Statement date unavailable"}{" "}
                    · {formatDate(
                      item.imported_at == null
                        ? null
                        : String(item.imported_at)
                    )}
                  </span>
                </div>
                <div>
                  <span>Parser</span>
                  <strong>{item.parser_version}</strong>
                </div>
                <span className="connection-status matched">
                  stored
                </span>
                <DeleteTspImportButton
                  importId={String(item.id)}
                  fileName={String(
                    item.source_filename ?? "TSP CSV"
                  )}
                  isStatementImport={
                    String(item.parser_version ?? "") !==
                    TSP_OFFICIAL_CSV_VERSION
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-connection-state">
            <FileSpreadsheet size={25} />
            <strong>No standalone TSP CSV imports</strong>
            <span>
              TSP files imported through Universal Import are managed in
              Import History above.
            </span>
          </div>
        )}
      </section>

      <section className="card page-card connect-principle">
        <ShieldCheck size={20} />
        <div>
          <strong>
            Solpient owns the normalized financial model.
          </strong>
          <span>
            File imports and Direct OFX connections feed
            the same account, transaction, holding, and liability model.
            Provider-specific schemas remain at the edge.
          </span>
        </div>
      </section>
    </div>
  );
}
