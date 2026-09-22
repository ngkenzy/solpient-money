import Link from "next/link";
import {
  ArrowLeft,
  Cable,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import DirectOfxSetupForm from "@/components/DirectOfxSetupForm";
import DirectOfxConnectionActions from "@/components/DirectOfxConnectionActions";
import { requireActiveHousehold } from "@/lib/money-auth";
import { getDirectOfxStatus } from "@/lib/connect/direct-ofx/config";

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

function endpointHost(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "Invalid endpoint";
  }
}

export default async function DirectOfxPage() {
  const { supabase, householdId } = await requireActiveHousehold();
  const status = getDirectOfxStatus();

  const { data: connections } = await supabase
    .from("direct_ofx_connections")
    .select(
      "id,institution_name,endpoint_url,org,fid,message_set,account_type,account_mask,app_id,app_ver,status,last_synced_at,last_error_code,last_error_message,created_at"
    )
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  return (
    <div className="page">
      <PageHeader
        eyebrow="SOLPIENT CONNECT V1.3"
        title="Direct OFX Connector"
        description="Connect directly to an institution-provided OFX endpoint using an institution-issued Direct Connect credential. Solpient encrypts the credential, sends OFX over hardened HTTPS, and normalizes the response into Money."
        action={
          <Link className="research-button" href="/connect">
            <ArrowLeft size={14} />
            Connector registry
          </Link>
        }
      />

      <section className="card page-card direct-ofx-principles">
        <Cable size={20} />
        <div>
          <strong>Direct connection—not a universal bank directory.</strong>
          <span>
            You provide the OFX server URL and identifiers supplied by the
            financial institution. Some institutions restrict Direct Connect
            access or require registration, a CLIENTUID, USERKEY, or one-time
            authorization token.
          </span>
        </div>
      </section>

      {!status.configured ? (
        <section className="card page-card plaid-config-card">
          <KeyRound size={23} />
          <div>
            <span className="card-kicker">
              LOCAL SECRET CONFIGURATION
            </span>
            <h2>Enable the Direct OFX encrypted vault</h2>
            <p>
              Add a separate connector encryption key to{" "}
              <code>.env.local</code>. The key stays outside GitHub and
              outside Supabase.
            </p>
            <pre>
              {"CONNECT_SECRET_ENCRYPTION_KEY=..."}
            </pre>
            <small>
              Generate locally with{" "}
              <code>openssl rand -base64 32</code>.
            </small>
          </div>
        </section>
      ) : null}

      <DirectOfxSetupForm configured={status.configured} />

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              DIRECT OFX CONNECTIONS
            </span>
            <h2>Institution endpoints</h2>
          </div>
          <span className="small-muted">
            {connections?.length ?? 0} connection
            {connections?.length === 1 ? "" : "s"}
          </span>
        </div>

        {(connections?.length ?? 0) > 0 ? (
          <div className="direct-ofx-list">
            {(connections ?? []).map((connection) => (
              <article
                className="direct-ofx-row"
                key={connection.id}
              >
                <span className="connector-sdk-icon">
                  <Cable size={18} />
                </span>

                <div className="direct-ofx-main">
                  <strong>{connection.institution_name}</strong>
                  <span>
                    {String(connection.message_set).replace(
                      "_",
                      " "
                    )}
                    {connection.account_mask
                      ? ` · •••• ${connection.account_mask}`
                      : ""}
                    {" · "}
                    {endpointHost(String(connection.endpoint_url))}
                  </span>
                  <small>
                    APPID {connection.app_id} · APPVER{" "}
                    {connection.app_ver}
                    {connection.org && connection.fid
                      ? ` · ${connection.org}/${connection.fid}`
                      : ""}
                  </small>
                </div>

                <div className="direct-ofx-health">
                  <span
                    className={
                      "connection-status " +
                      (connection.status === "active"
                        ? "healthy"
                        : connection.status === "needs_update"
                          ? "attention"
                          : connection.status)
                    }
                  >
                    {connection.status === "needs_update"
                      ? "credential needed"
                      : connection.status}
                  </span>
                  <small>
                    Last sync{" "}
                    {formatDate(
                      connection.last_synced_at
                        ? String(connection.last_synced_at)
                        : null
                    )}
                  </small>
                </div>

                <DirectOfxConnectionActions
                  connectionId={String(connection.id)}
                  configured={status.configured}
                />

                {connection.last_error_message ? (
                  <p className="direct-ofx-row-error">
                    {connection.last_error_code ? (
                      <strong>
                        OFX {connection.last_error_code}:{" "}
                      </strong>
                    ) : null}
                    {connection.last_error_message}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-connection-state">
            <Cable size={26} />
            <strong>No Direct OFX connections yet</strong>
            <span>
              Add the endpoint details supplied by your bank or brokerage,
              then Save + test connection.
            </span>
          </div>
        )}
      </section>

      <div className="plaid-security-grid">
        <section className="card page-card">
          <LockKeyhole size={20} />
          <div>
            <strong>AES-256-GCM credential vault</strong>
            <span>
              OFX user IDs, account IDs, Direct Connect credentials,
              CLIENTUIDs, and authorization tokens are encrypted before
              storage. The database stores ciphertext only.
            </span>
          </div>
        </section>
        <section className="card page-card">
          <ShieldCheck size={20} />
          <div>
            <strong>Hardened outbound HTTPS</strong>
            <span>
              The connector rejects HTTP, URL credentials, non-443 ports,
              local/private networks, redirects, oversized responses, and
              long-running requests.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
