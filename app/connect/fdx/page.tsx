import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  FlaskConical,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import FdxConnectionActions from "@/components/FdxConnectionActions";
import { requireActiveHousehold } from "@/lib/money-auth";
import {
  getFdxProvider,
  getFdxProviders,
  providerCanAuthorize,
} from "@/lib/connect/fdx/providers";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function providerStatusLabel(status: string) {
  if (status === "sandbox_ready") {
    return "sandbox ready";
  }
  if (status === "setup_required") {
    return "setup required";
  }
  if (status === "partner_required") {
    return "partner required";
  }
  return status;
}

export default async function FdxPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    sync?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const { supabase, householdId } =
    await requireActiveHousehold();
  const providers = getFdxProviders();

  const { data: connections } =
    await supabase
      .from("oauth_fdx_connections")
      .select(
        "id,provider_id,institution_name,security_profile,status,granted_scopes,last_synced_at,last_error_code,last_error_message,created_at"
      )
      .eq("household_id", householdId)
      .order("created_at", {
        ascending: false,
      });

  const sandboxReady = providers.filter(
    (provider) =>
      provider.status ===
      "sandbox_ready"
  ).length;
  const productionGated = providers.filter(
    (provider) =>
      provider.securityProfile === "fdx_fapi"
  ).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="SOLPIENT CONNECT V1.4"
        title="OAuth / FDX Framework"
        description="Validate OAuth consent, PKCE, encrypted token storage, refresh, FDX-aligned normalization, and Connector SDK sync in sandbox—while keeping production FDX/FAPI behind real institution onboarding, PAR, mTLS, and registered client credentials."
        action={
          <Link
            className="research-button"
            href="/connect"
          >
            <ArrowLeft size={14} />
            Connector registry
          </Link>
        }
      />

      {params.connected ? (
        <div className="connect-success">
          <BadgeCheck size={18} />
          <div>
            <strong>
              OAuth authorization completed
            </strong>
            <span>
              {params.connected} · initial
              sync{" "}
              {params.sync === "ok"
                ? "completed"
                : "needs review"}
            </span>
          </div>
        </div>
      ) : null}

      {params.error ? (
        <div className="connect-error">
          <LockKeyhole size={17} />
          <span>{params.error}</span>
        </div>
      ) : null}

      <div className="metric-grid four">
        <div className="metric-card">
          <span>Sandbox providers</span>
          <strong>{sandboxReady}</strong>
          <small>
            OAuth/PKCE paths ready to test
          </small>
        </div>
        <div className="metric-card">
          <span>Connections</span>
          <strong>
            {connections?.length ?? 0}
          </strong>
          <small>
            Encrypted token vault instances
          </small>
        </div>
        <div className="metric-card">
          <span>Production FDX</span>
          <strong>{productionGated}</strong>
          <small>
            Providers explicitly gated
          </small>
        </div>
        <div className="metric-card">
          <span>Password storage</span>
          <strong>0</strong>
          <small>
            Bank credentials never collected
          </small>
        </div>
      </div>

      <section className="card page-card fdx-security-profile">
        <ShieldCheck size={21} />
        <div>
          <strong>
            Sandbox OAuth is not being mislabeled as production FDX.
          </strong>
          <span>
            FDX currently references FAPI/OIDC/OAuth security,
            including PAR and mTLS sender-constrained tokens.
            Solpient V1.4 exercises PKCE in sandbox, but a
            production institution remains blocked until its own
            registration and security requirements are satisfied.
          </span>
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              PROVIDER CAPABILITY REGISTRY
            </span>
            <h2>
              Connect only what is actually authorized.
            </h2>
          </div>
          <span className="small-muted">
            OAuth + FDX-aligned data
          </span>
        </div>

        <div className="fdx-provider-grid">
          {providers.map((provider) => {
            const canAuthorize =
              providerCanAuthorize(provider);

            return (
              <article
                className={
                  "fdx-provider-card " +
                  provider.status
                }
                key={provider.id}
              >
                <div className="fdx-provider-head">
                  <span className="connector-sdk-icon">
                    {provider.id ===
                    "solpient-fdx-sandbox" ? (
                      <FlaskConical size={18} />
                    ) : (
                      <Building2 size={18} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {provider.name}
                    </strong>
                    <span
                      className={
                        "connection-status " +
                        (provider.status ===
                        "sandbox_ready"
                          ? "healthy"
                          : provider.status ===
                              "setup_required"
                            ? "setup_required"
                            : "unavailable")
                      }
                    >
                      {providerStatusLabel(
                        provider.status
                      )}
                    </span>
                  </div>
                </div>

                <p>{provider.summary}</p>

                <div className="fdx-security-tags">
                  <span>
                    {provider.securityProfile ===
                    "fdx_fapi"
                      ? "FDX/FAPI"
                      : "OAuth PKCE sandbox"}
                  </span>
                  {provider.requiresPar ? (
                    <span>PAR</span>
                  ) : null}
                  {provider.requiresMtls ? (
                    <span>mTLS</span>
                  ) : null}
                  {provider.requiresClientRegistration ? (
                    <span>
                      client registration
                    </span>
                  ) : null}
                </div>

                <div className="fdx-provider-actions">
                  {canAuthorize ? (
                    <a
                      href={`/api/connect/fdx/start?provider=${encodeURIComponent(
                        provider.id
                      )}`}
                    >
                      Authorize
                    </a>
                  ) : provider.onboardingUrl ? (
                    <a
                      href={
                        provider.onboardingUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open onboarding portal
                    </a>
                  ) : (
                    <span>
                      No production client
                      configured
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              OAUTH / FDX CONNECTIONS
            </span>
            <h2>
              Consent and sync lifecycle
            </h2>
          </div>
          <span className="small-muted">
            {connections?.length ?? 0}{" "}
            connection
            {connections?.length === 1
              ? ""
              : "s"}
          </span>
        </div>

        {(connections?.length ?? 0) > 0 ? (
          <div className="fdx-connection-list">
            {(connections ?? []).map(
              (connection) => {
                const provider =
                  getFdxProvider(
                    String(
                      connection.provider_id
                    )
                  );
                const reconnect =
                  Boolean(provider) &&
                  providerCanAuthorize(
                    provider!
                  );

                return (
                  <article
                    className="fdx-connection-row"
                    key={connection.id}
                  >
                    <span className="connector-sdk-icon">
                      <Building2 size={17} />
                    </span>
                    <div>
                      <strong>
                        {
                          connection.institution_name
                        }
                      </strong>
                      <span>
                        {
                          connection.security_profile
                        }{" "}
                        ·{" "}
                        {(
                          connection.granted_scopes ??
                          []
                        ).join(", ")}
                      </span>
                    </div>
                    <div>
                      <span>Last sync</span>
                      <strong>
                        {formatDate(
                          connection.last_synced_at
                            ? String(
                                connection.last_synced_at
                              )
                            : null
                        )}
                      </strong>
                    </div>
                    <span
                      className={
                        "connection-status " +
                        (connection.status ===
                        "active"
                          ? "healthy"
                          : "attention")
                      }
                    >
                      {connection.status}
                    </span>
                    <FdxConnectionActions
                      connectionId={String(
                        connection.id
                      )}
                      providerId={String(
                        connection.provider_id
                      )}
                      canReconnect={
                        reconnect
                      }
                    />
                    {connection.last_error_message ? (
                      <p className="fdx-connection-error">
                        {connection.last_error_code
                          ? `${connection.last_error_code}: `
                          : ""}
                        {
                          connection.last_error_message
                        }
                      </p>
                    ) : null}
                  </article>
                );
              }
            )}
          </div>
        ) : (
          <div className="empty-connection-state">
            <FlaskConical size={26} />
            <strong>
              No OAuth/FDX connections yet
            </strong>
            <span>
              Authorize the Solpient FDX
              Sandbox first to validate the
              complete flow without a bank.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
