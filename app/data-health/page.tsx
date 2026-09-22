import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Copy,
  DatabaseZap,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getTruthEngineReport } from "@/lib/truth-engine";
import { runTruthEngine } from "./actions";

export const dynamic = "force-dynamic";

function pct(value: number) {
  return value > 0 ? `${Math.round(value * 100)}%` : "—";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function when(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusCopy(status: string) {
  if (status === "healthy") return "Healthy";
  if (status === "stale") return "Stale";
  if (status === "duplicate_candidate") return "Review duplicate";
  if (status === "needs_review") return "Needs review";
  return "Not scanned";
}

export default async function DataHealthPage() {
  const report = await getTruthEngineReport();
  const { summary } = report;
  const hasRun = Boolean(summary.lastRunAt);

  return (
    <div className="page">
      <PageHeader
        eyebrow="V0.9 · TRUTH ENGINE"
        title="Financial data health"
        description="Normalize noisy financial records, identify likely duplicates, detect internal transfers, and surface stale account data without deleting source records."
        action={
          <form action={runTruthEngine}>
            <button className="research-button truth-run-button" type="submit">
              <RefreshCw size={14} />
              {hasRun ? "Run again" : "Run Truth Engine"}
            </button>
          </form>
        }
      />

      <section className="truth-hero card">
        <div className="truth-hero-icon">
          <ShieldCheck size={26} />
        </div>
        <div>
          <span className="card-kicker">AUDITABLE DERIVED DATA</span>
          <h2>{hasRun ? "Household truth layer is active" : "Ready for first household scan"}</h2>
          <p>
            The engine keeps raw connector and import records intact. Duplicate and transfer
            classifications are derived metadata that can be rerun as the data improves.
          </p>
        </div>
        <div className="truth-last-run">
          <span>Last scan</span>
          <strong>{when(summary.lastRunAt)}</strong>
        </div>
      </section>

      <section className="truth-metric-grid">
        <div className="card truth-metric">
          <Fingerprint size={18} />
          <span>Accounts scanned</span>
          <strong>{summary.accountsScanned}</strong>
          <small>{summary.duplicateAccountCandidates} duplicate candidates</small>
        </div>
        <div className="card truth-metric">
          <DatabaseZap size={18} />
          <span>Transactions normalized</span>
          <strong>{summary.normalizedTransactions}</strong>
          <small>of {summary.transactionsScanned} scanned</small>
        </div>
        <div className="card truth-metric">
          <Copy size={18} />
          <span>Likely duplicates</span>
          <strong>{summary.duplicateTransactions}</strong>
          <small>cross-source exact semantic matches</small>
        </div>
        <div className="card truth-metric">
          <ArrowLeftRight size={18} />
          <span>Internal transfers</span>
          <strong>{summary.detectedTransfers}</strong>
          <small>matched account-to-account pairs</small>
        </div>
      </section>

      <section className="card page-card truth-section">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">ACCOUNT IDENTITY</span>
            <h2>One household, one coherent account map</h2>
            <p className="empty-copy">
              Identity keys use institution, account type, and masked account identifiers when
              available. Candidates are linked for review, not auto-merged.
            </p>
          </div>
          <div className={"truth-health-pill" + (summary.staleAccounts ? " warning" : "")}>
            {summary.staleAccounts ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            {summary.staleAccounts ? `${summary.staleAccounts} stale` : "Freshness clear"}
          </div>
        </div>

        <div className="truth-account-list">
          {report.accounts.length ? (
            report.accounts.map((account) => (
              <div className="truth-account-row" key={account.id}>
                <div className="truth-account-main">
                  <strong>{account.name}</strong>
                  <span>
                    {account.institution} · {account.source.toUpperCase()} · •••• {account.lastFour}
                  </span>
                </div>
                <div className="truth-account-confidence">
                  <span>Identity</span>
                  <strong>{pct(account.identityConfidence)}</strong>
                </div>
                <div className="truth-account-freshness">
                  <span>Last source update</span>
                  <strong>{when(account.lastUpdatedAt)}</strong>
                </div>
                <div className={`truth-status ${account.status}`}>
                  {statusCopy(account.status)}
                  {account.canonicalAccountName ? (
                    <small>→ {account.canonicalAccountName}</small>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="empty-copy">No accounts are available for this household yet.</p>
          )}
        </div>
      </section>

      <section className="card page-card truth-section">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">TRANSACTION SIGNALS</span>
            <h2>What the engine changed in interpretation</h2>
            <p className="empty-copy">
              Duplicate rows remain stored for audit but are excluded from the primary Money
              dataset. Transfer pairs remain stored with their original transaction type but are
              interpreted as transfers in cash-flow calculations.
            </p>
          </div>
        </div>

        {report.signals.length ? (
          <div className="truth-signal-list">
            {report.signals.map((signal) => (
              <div className="truth-signal-row" key={signal.id}>
                <span className={`truth-signal-icon ${signal.signal}`}>
                  {signal.signal === "duplicate" ? <Copy size={15} /> : <ArrowLeftRight size={15} />}
                </span>
                <div>
                  <strong>{signal.normalizedMerchant}</strong>
                  <span>
                    {signal.postedAt} · raw: {signal.merchant} · {signal.source.toUpperCase()}
                  </span>
                </div>
                <strong className={signal.amount < 0 ? "negative" : ""}>
                  {money(signal.amount)}
                </strong>
                <div className="truth-signal-confidence">
                  <span>{signal.signal === "duplicate" ? "Duplicate" : "Transfer"}</span>
                  <strong>{pct(signal.confidence)}</strong>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="truth-empty">
            <ShieldCheck size={28} />
            <strong>{hasRun ? "No duplicate or transfer signals found" : "Run the Truth Engine to classify household data"}</strong>
            <span>Only high-confidence signals are surfaced in this first V0.9 build.</span>
          </div>
        )}
      </section>
    </div>
  );
}
