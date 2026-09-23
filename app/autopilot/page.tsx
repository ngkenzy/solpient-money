import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  DatabaseZap,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import AutopilotRunButton from "@/components/AutopilotRunButton";
import {
  getMoneyAutopilotBriefing,
  type AutopilotLevel,
} from "@/lib/money-autopilot";

export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function signedMoney(value: number) {
  const formatted = money(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function levelIcon(level: AutopilotLevel) {
  if (level === "critical") return <ShieldAlert size={17} />;
  if (level === "watch") return <CircleAlert size={17} />;
  if (level === "positive") return <CheckCircle2 size={17} />;
  return <Activity size={17} />;
}

function statusCopy(level: AutopilotLevel) {
  if (level === "critical") return "Critical";
  if (level === "watch") return "Watch";
  if (level === "positive") return "Good";
  return "Info";
}

function changeValue(
  key: string,
  value: number
) {
  if (
    key === "healthScore" ||
    key === "planAlignment" ||
    key === "transactionCount"
  ) {
    return value > 0
      ? `+${value.toFixed(0)}`
      : value.toFixed(0);
  }
  return signedMoney(value);
}

export default async function AutopilotPage() {
  const briefing =
    await getMoneyAutopilotBriefing();

  const importantChanges = briefing.changes
    .filter((change) =>
      [
        "netWorth",
        "cash",
        "investments",
        "monthlySpending",
        "monthlySurplus",
        "healthScore",
        "planAlignment",
      ].includes(change.key)
    )
    .slice(0, 8);

  return (
    <div className="dashboard autopilot-page">
      <div className="welcome-row">
        <div>
          <div className="eyebrow">
            V1.3 · MONEY AUTOPILOT
            <span className="demo-pill persistent">READ ONLY</span>
          </div>
          <h1>Your daily financial briefing.</h1>
          <p>
            Autopilot refreshes eligible connectors once per local app day,
            then compares deterministic household metrics with the previous
            stored daily snapshot.
          </p>
        </div>
        <div className="asof">
          <strong>{briefing.runDate}</strong>
          <span>
            {briefing.persisted
              ? "Persisted daily observation"
              : "Preview before today’s persisted run"}
          </span>
        </div>
      </div>

      <section className="card autopilot-hero">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">DAILY BRIEFING</span>
            <h2>{briefing.summary}</h2>
          </div>
          <AutopilotRunButton />
        </div>

        <div className="autopilot-metrics">
          <div>
            <span>Net worth</span>
            <strong>{money(briefing.snapshot.netWorth)}</strong>
          </div>
          <div>
            <span>Financial health</span>
            <strong>{briefing.snapshot.healthScore}/100</strong>
          </div>
          <div>
            <span>Plan alignment</span>
            <strong>{briefing.snapshot.planAlignment}/100</strong>
          </div>
          <div>
            <span>New transactions</span>
            <strong>{briefing.newTransactionCount}</strong>
          </div>
          <div>
            <span>Critical</span>
            <strong>{briefing.criticalCount}</strong>
          </div>
          <div>
            <span>Watch</span>
            <strong>{briefing.watchCount}</strong>
          </div>
        </div>
      </section>

      <div className="dashboard-grid autopilot-grid">
        <section className="card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">WHAT CHANGED</span>
              <h2>
                {briefing.previousRunDate
                  ? `Since ${briefing.previousRunDate}`
                  : "First daily baseline"}
              </h2>
            </div>
            <RefreshCw size={18} />
          </div>

          {importantChanges.length ? (
            <div className="autopilot-change-list">
              {importantChanges.map((change) => (
                <div className="autopilot-change-row" key={change.key}>
                  <span>{change.label}</span>
                  <strong
                    className={
                      change.delta > 0
                        ? "income-text"
                        : change.delta < 0
                          ? "mini-negative"
                          : ""
                    }
                  >
                    {changeValue(change.key, change.delta)}
                  </strong>
                  <em>
                    {change.deltaPct == null
                      ? "—"
                      : `${change.deltaPct > 0 ? "+" : ""}${change.deltaPct.toFixed(1)}%`}
                  </em>
                </div>
              ))}
            </div>
          ) : (
            <p className="autopilot-empty">
              No prior daily snapshot exists yet. Today becomes the comparison
              point for the next run.
            </p>
          )}
        </section>

        <section className="card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">SOURCES</span>
              <h2>Freshness and connector health</h2>
            </div>
            <DatabaseZap size={18} />
          </div>

          <div className="autopilot-source-list">
            {briefing.connectors.map((connector) => (
              <div className="autopilot-source-row" key={connector.id}>
                <div>
                  <strong>{connector.name}</strong>
                  <span>
                    {connector.accountCount} account
                    {connector.accountCount === 1 ? "" : "s"} ·{" "}
                    {connector.automaticSync ? "automatic" : "manual"}
                  </span>
                </div>
                <div className="autopilot-source-status">
                  <strong>{connector.health.replace("_", " ")}</strong>
                  <span>
                    {connector.lastSyncedAt
                      ? new Date(connector.lastSyncedAt).toLocaleString("en-US")
                      : "No completed sync"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Link className="text-button" href="/connect">
            Manage sources <ArrowRight size={15} />
          </Link>
        </section>
      </div>

      <section className="card autopilot-alerts">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">DESERVES ATTENTION</span>
            <h2>Deterministic alerts</h2>
          </div>
          <Sparkles size={18} />
        </div>

        <div className="autopilot-alert-list">
          {briefing.alerts.map((alert) => (
            <Link
              className={`autopilot-alert autopilot-${alert.level}`}
              href={alert.href}
              key={alert.id}
            >
              <span className="autopilot-alert-icon">
                {levelIcon(alert.level)}
              </span>
              <span className="autopilot-alert-copy">
                <strong>{alert.title}</strong>
                <span>{alert.detail}</span>
              </span>
              <span className="autopilot-alert-level">
                {statusCopy(alert.level)}
              </span>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      </section>

      <section className="askbar">
        <span className="ask-icon"><Sparkles size={19} /></span>
        <div className="ask-copy">
          <strong>Ask Money Copilot what changed today.</strong>
          <span>
            Copilot reads the same persisted Autopilot briefing and remains
            read-only.
          </span>
        </div>
        <div className="ask-prompts">
          <Link href="/copilot">Give me my daily briefing</Link>
          <Link href="/copilot">What changed since yesterday?</Link>
          <Link href="/copilot">What needs my attention?</Link>
        </div>
        <Link className="ask-send" aria-label="Open Money Copilot" href="/copilot">
          <ArrowRight size={18} />
        </Link>
      </section>

      <div className="bottom-note">
        <Activity size={15} />
        <span>
          Autopilot can refresh configured read-only data connectors and write
          derived daily observations. It cannot transfer funds, submit trades,
          pay bills, or modify your financial plan.
        </span>
      </div>
    </div>
  );
}
