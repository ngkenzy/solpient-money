import {
  DatabaseZap,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import PlaidConnectButton from "@/components/PlaidConnectButton";
import PlaidConnectionActions from "@/components/PlaidConnectionActions";
import PlaidAutoRefresh from "@/components/PlaidAutoRefresh";
import { requireActiveHousehold } from "@/lib/money-auth";
import { getPlaidStatus } from "@/lib/plaid/config";

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

export default async function ConnectionsPage() {
  const { supabase, householdId } = await requireActiveHousehold();
  const plaid = getPlaidStatus();

  const [{ data: connections }, { data: plaidAccounts }] = await Promise.all([
    supabase
      .from("plaid_connections")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false }),
    supabase
      .from("accounts")
      .select("id,plaid_connection_id")
      .eq("household_id", householdId)
      .eq("source", "plaid"),
  ]);

  const accountCounts = new Map<string, number>();
  for (const account of plaidAccounts ?? []) {
    const id = String(account.plaid_connection_id ?? "");
    if (!id) continue;
    accountCounts.set(id, (accountCounts.get(id) ?? 0) + 1);
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="CONNECTOR SDK · PLAID"
        title="Plaid Sandbox adapter."
        description="Plaid remains a Sandbox adapter inside Solpient Connect V1.2. Its connection-specific Link, repair, disconnect, and encrypted-token controls stay here while health and sync are surfaced through the shared Connector SDK."
        action={
          <span className={"live-pill " + (plaid.configured ? "connected" : "disconnected")}>
            {plaid.configured ? "SANDBOX READY" : "CREDENTIALS NEEDED"}
          </span>
        }
      />

      {!plaid.configured ? (
        <section className="card page-card plaid-config-card">
          <KeyRound size={23} />
          <div>
            <span className="card-kicker">LOCAL SECRET CONFIGURATION</span>
            <h2>Add your free Plaid Sandbox credentials</h2>
            <p>Get the Sandbox Client ID and secret from the Plaid Dashboard. Keep both the Plaid secret and the token-encryption key in <code>.env.local</code>; neither belongs in GitHub.</p>
            <pre>{"PLAID_ENV=sandbox\nPLAID_CLIENT_ID=...\nPLAID_SECRET=...\nPLAID_TOKEN_ENCRYPTION_KEY=..."}</pre>
            <small>Generate the encryption key locally with <code>openssl rand -base64 32</code>.</small>
          </div>
        </section>
      ) : null}

      <section className="sandbox-warning card page-card">
        <strong>PLAID SANDBOX TEST DATA</strong>
        <span>All Plaid-connected balances, transactions, and holdings in V1.2 are test data. Manual Money data is unchanged.</span>
      </section>

      <PlaidAutoRefresh
        enabled={plaid.configured}
        connectionCount={connections?.length ?? 0}
      />

      <div className="plaid-connect-grid">
        <section className="card page-card">
          <PlaidConnectButton mode="banking" configured={plaid.configured} />
        </section>
        <section className="card page-card">
          <PlaidConnectButton mode="investments" configured={plaid.configured} />
        </section>
      </div>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">CONNECTED ITEMS</span><h2>Sandbox institutions</h2></div>
          <span className="small-muted">{connections?.length ?? 0} Item{connections?.length === 1 ? "" : "s"}</span>
        </div>

        {(connections?.length ?? 0) > 0 ? (
          <div className="plaid-connection-list">
            {(connections ?? []).map((connection) => (
              <article className="plaid-connection-row" key={connection.id}>
                <span className="plaid-institution-icon"><DatabaseZap size={19} /></span>
                <div className="plaid-connection-main">
                  <strong>{connection.institution_name}</strong>
                  <span>{connection.connection_mode} · {accountCounts.get(String(connection.id)) ?? 0} imported account{accountCounts.get(String(connection.id)) === 1 ? "" : "s"}</span>
                </div>
                <div className="plaid-connection-status">
                  <span className={"connection-status " + connection.status}>
                    {connection.status === "needs_update"
                      ? "repair required"
                      : connection.status === "error"
                        ? "sync failed"
                        : connection.status}
                  </span>
                  <small>Last sync {formatDate(connection.last_synced_at)}</small>
                </div>
                <PlaidConnectionActions
                  connectionId={String(connection.id)}
                  configured={plaid.configured}
                  status={String(connection.status)}
                />
                {connection.last_error_message ? (
                  <p className="plaid-row-error">
                    {connection.last_error_code ? <strong>{connection.last_error_code}: </strong> : null}
                    {connection.last_error_message}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-connection-state">
            <DatabaseZap size={26} />
            <strong>No Plaid Sandbox Items yet</strong>
            <span>Use Plaid Link or the one-click Sandbox test Item above.</span>
          </div>
        )}
      </section>

      <div className="plaid-security-grid">
        <section className="card page-card">
          <LockKeyhole size={20} />
          <div><strong>Encrypted access tokens</strong><span>Access tokens are AES-256-GCM encrypted before storage. The private database stores ciphertext only.</span></div>
        </section>
        <section className="card page-card">
          <ShieldCheck size={20} />
          <div><strong>Household isolation</strong><span>Plaid connection metadata and imported financial rows remain under the same household RLS boundary as V0.5.</span></div>
        </section>
      </div>
    </div>
  );
}
