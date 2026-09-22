import Link from "next/link";
import {
  Cable,
  DatabaseZap,
  FileSpreadsheet,
  Landmark,
} from "lucide-react";
import ConnectorSyncButton from "@/components/ConnectorSyncButton";
import type {
  ConnectorId,
  ConnectorOverview,
} from "@/lib/connect/sdk";

function iconFor(id: ConnectorId) {
  if (id === "files") return FileSpreadsheet;
  if (id === "plaid") return DatabaseZap;
  if (id === "fdx") return Landmark;
  return Cable;
}

function healthLabel(health: ConnectorOverview["health"]) {
  if (health === "setup_required") return "setup required";
  return health.replace("_", " ");
}

function capabilityLabels(
  capabilities: ConnectorOverview["manifest"]["capabilities"]
) {
  const labels: string[] = [];
  if (capabilities.accounts) labels.push("Accounts");
  if (capabilities.transactions) labels.push("Transactions");
  if (capabilities.holdings) labels.push("Holdings");
  if (capabilities.liabilities) labels.push("Liabilities");
  if (capabilities.reconciliation) labels.push("Reconcile");
  if (capabilities.automaticSync) labels.push("Auto sync");
  if (capabilities.manualImport) labels.push("File import");
  return labels;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function ConnectorRegistryPanel({
  overviews,
}: {
  overviews: ConnectorOverview[];
}) {
  return (
    <>
      <div className="connector-sdk-grid">
        {overviews.map((overview) => {
          const Icon = iconFor(overview.manifest.id);
          const live =
            overview.manifest.maturity !== "future";

          return (
            <section
              className={
                "card connector-sdk-card " +
                overview.health +
                (live ? "" : " future")
              }
              key={overview.manifest.id}
            >
              <div className="connector-sdk-head">
                <span className="connector-sdk-icon">
                  <Icon size={20} />
                </span>
                <div>
                  <span className="card-kicker">
                    {overview.manifest.kind.replace("-", " ")}
                  </span>
                  <strong>{overview.manifest.name}</strong>
                </div>
                <span
                  className={
                    "connection-status " + overview.health
                  }
                >
                  {healthLabel(overview.health)}
                </span>
              </div>

              <p>{overview.manifest.description}</p>

              <div className="connector-capabilities">
                {capabilityLabels(
                  overview.manifest.capabilities
                ).map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div className="connector-sdk-metrics">
                <div>
                  <span>Instances</span>
                  <strong>{overview.instanceCount}</strong>
                </div>
                <div>
                  <span>Accounts</span>
                  <strong>{overview.accountCount}</strong>
                </div>
                <div>
                  <span>Last sync</span>
                  <strong>
                    {formatDate(overview.lastSyncedAt)}
                  </strong>
                </div>
              </div>

              <div className="connector-sdk-actions">
                {live ? (
                  <Link href={overview.manifest.href}>
                    {overview.manifest.id === "files"
                      ? "Import file"
                      : "Manage"}
                  </Link>
                ) : (
                  <span>Adapter slot reserved</span>
                )}
                {overview.manifest.capabilities.automaticSync &&
                overview.instanceCount > 0 &&
                overview.manifest.maturity !== "future" ? (
                  <ConnectorSyncButton
                    connectorId={overview.manifest.id}
                    label="Sync all"
                  />
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <section className="card page-card connector-instance-section">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              UNIFIED CONNECTION HEALTH
            </span>
            <h2>All connector instances</h2>
          </div>
          <span className="small-muted">
            {
              overviews.flatMap(
                (overview) => overview.instances
              ).length
            }{" "}
            active instance
            {overviews.flatMap(
              (overview) => overview.instances
            ).length === 1
              ? ""
              : "s"}
          </span>
        </div>

        <div className="connector-instance-list">
          {overviews.flatMap((overview) =>
            overview.instances.map((instance) => (
              <div
                className="connector-instance-row"
                key={`${overview.manifest.id}:${instance.id}`}
              >
                <span className="connector-instance-provider">
                  {overview.manifest.shortName}
                </span>
                <div>
                  <strong>{instance.name}</strong>
                  <span>{instance.detail}</span>
                </div>
                <div>
                  <span>Last sync</span>
                  <strong>
                    {formatDate(instance.lastSyncedAt)}
                  </strong>
                </div>
                <span
                  className={
                    "connection-status " + instance.health
                  }
                >
                  {healthLabel(instance.health)}
                </span>
                {instance.canSync ? (
                  <ConnectorSyncButton
                    connectorId={instance.connectorId}
                    instanceId={instance.id}
                  />
                ) : (
                  <span className="small-muted">
                    Manual refresh
                  </span>
                )}
              </div>
            ))
          )}

          {overviews.every(
            (overview) => overview.instances.length === 0
          ) ? (
            <div className="empty-connection-state">
              <Cable size={25} />
              <strong>No connector instances yet</strong>
              <span>
                Import a file or add a Plaid Sandbox Item to
                create the first one.
              </span>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
