import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Copy,
  DatabaseZap,
  Fingerprint,
  GitMerge,
  RefreshCw,
  ShieldCheck,
  Tags,
  X,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getTruthEngineReport } from "@/lib/truth-engine";
import {
  createMerchantRule,
  deleteMerchantRule,
  manuallyPairTransfer,
  reviewAccountDuplicate,
  reviewTransactionDuplicate,
  reviewTransferGroup,
  runTruthEngine,
} from "./actions";

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
  if (status === "merged") return "Merged";
  return "Not scanned";
}

function reviewCopy(status: string) {
  if (status === "confirmed") return "Confirmed";
  if (status === "rejected") return "Rejected";
  if (status === "confirmed_duplicate") return "Merged";
  if (status === "not_duplicate") return "Keep separate";
  return "Needs review";
}

export default async function DataHealthPage() {
  const report = await getTruthEngineReport();
  const { summary } = report;
  const hasRun = Boolean(summary.lastRunAt);

  return (
    <div className="page">
      <PageHeader
        eyebrow="DATA HEALTH"
        title="Financial data health"
        description="Review Truth Engine decisions, merge confirmed duplicate accounts, pair transfers, and teach Solpient persistent merchant and category rules."
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
          <span className="card-kicker">HUMAN-IN-THE-LOOP TRUTH</span>
          <h2>
            {hasRun
              ? "Automation finds candidates. You control the truth."
              : "Ready for first household scan"}
          </h2>
          <p>
            Rejections persist across future scans. Confirmed account merges are atomic and
            audited. Raw transaction descriptions and imported categories remain preserved.
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
          <span>Active accounts</span>
          <strong>{summary.accountsScanned}</strong>
          <small>{summary.duplicateAccountCandidates} awaiting account review</small>
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
          <small>reviewable cross-source matches</small>
        </div>
        <div className="card truth-metric">
          <ArrowLeftRight size={18} />
          <span>Internal transfers</span>
          <strong>{summary.detectedTransfers}</strong>
          <small>automatic + manually confirmed pairs</small>
        </div>
      </section>

      <section className="card page-card truth-section">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">ACCOUNT RECONCILIATION</span>
            <h2>Confirm the household account map</h2>
            <p className="empty-copy">
              A confirmed merge keeps the canonical balance, moves transaction history, preserves
              non-overlapping holdings, suppresses overlapping duplicate holdings, and writes an
              audit record.
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
              <div className={"truth-account-row" + (!account.isActive ? " inactive" : "")} key={account.id}>
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

                {account.isActive &&
                account.status === "duplicate_candidate" &&
                account.canonicalAccountId ? (
                  <form className="truth-review-actions" action={reviewAccountDuplicate}>
                    <input type="hidden" name="account_id" value={account.id} />
                    <input
                      type="hidden"
                      name="canonical_account_id"
                      value={account.canonicalAccountId}
                    />
                    <button className="confirm" name="decision" value="confirm" type="submit">
                      <GitMerge size={13} />
                      Merge into {account.canonicalAccountName ?? "canonical"}
                    </button>
                    <button className="reject" name="decision" value="reject" type="submit">
                      <X size={13} />
                      Keep separate
                    </button>
                  </form>
                ) : account.reviewStatus !== "unreviewed" ? (
                  <div className="truth-reviewed-label">
                    <Check size={12} />
                    {reviewCopy(account.reviewStatus)}
                  </div>
                ) : null}
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
            <span className="card-kicker">TRANSACTION REVIEW</span>
            <h2>Approve or reject engine classifications</h2>
            <p className="empty-copy">
              Rejected signals stay rejected on future scans. Confirmed duplicates remain excluded
              from the primary Money dataset; confirmed transfers stay out of income and spending.
            </p>
          </div>
        </div>

        {report.signals.length ? (
          <div className="truth-signal-list">
            {report.signals.map((signal) => {
              const reviewStatus =
                signal.signal === "duplicate"
                  ? signal.duplicateReviewStatus
                  : signal.transferReviewStatus;
              const needsReview = reviewStatus === "unreviewed";

              return (
                <div className="truth-signal-row reconcile" key={signal.id}>
                  <span className={`truth-signal-icon ${signal.signal}`}>
                    {signal.signal === "duplicate" ? (
                      <Copy size={15} />
                    ) : (
                      <ArrowLeftRight size={15} />
                    )}
                  </span>
                  <div>
                    <strong>{signal.normalizedMerchant}</strong>
                    <span>
                      {signal.postedAt} · {signal.accountName} · raw: {signal.merchant} ·{" "}
                      {signal.source.toUpperCase()}
                    </span>
                  </div>
                  <strong className={signal.amount < 0 ? "negative" : ""}>
                    {money(signal.amount)}
                  </strong>
                  <div className="truth-signal-confidence">
                    <span>{signal.signal === "duplicate" ? "Duplicate" : "Transfer"}</span>
                    <strong>{pct(signal.confidence)}</strong>
                  </div>

                  {needsReview && signal.signal === "duplicate" ? (
                    <form className="truth-review-actions compact" action={reviewTransactionDuplicate}>
                      <input type="hidden" name="transaction_id" value={signal.id} />
                      <button className="confirm" name="decision" value="confirm" type="submit">
                        <Check size={12} />
                        Confirm duplicate
                      </button>
                      <button className="reject" name="decision" value="reject" type="submit">
                        <X size={12} />
                        Not duplicate
                      </button>
                    </form>
                  ) : needsReview && signal.transferGroupId ? (
                    <form className="truth-review-actions compact" action={reviewTransferGroup}>
                      <input
                        type="hidden"
                        name="transfer_group_id"
                        value={signal.transferGroupId}
                      />
                      <button className="confirm" name="decision" value="confirm" type="submit">
                        <Check size={12} />
                        Confirm transfer
                      </button>
                      <button className="reject" name="decision" value="reject" type="submit">
                        <X size={12} />
                        Not transfer
                      </button>
                    </form>
                  ) : (
                    <div className={`truth-reviewed-label ${reviewStatus}`}>
                      <Check size={12} />
                      {reviewCopy(reviewStatus)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="truth-empty">
            <ShieldCheck size={28} />
            <strong>
              {hasRun
                ? "No duplicate or transfer signals found"
                : "Run the Truth Engine to classify household data"}
            </strong>
            <span>Only high-confidence signals are surfaced automatically.</span>
          </div>
        )}
      </section>

      <section className="truth-two-column">
        <section className="card page-card truth-section">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">MANUAL TRANSFER PAIR</span>
              <h2>Teach Solpient a transfer</h2>
              <p className="empty-copy">
                Choose equal-and-opposite transactions from two accounts. They must be within seven
                days of each other.
              </p>
            </div>
          </div>

          <form className="truth-rule-form" action={manuallyPairTransfer}>
            <label>
              <span>Money leaving one account</span>
              <select name="first_transaction_id" required defaultValue="">
                <option value="" disabled>
                  Select transaction
                </option>
                {report.transferCandidates.map((transaction) => (
                  <option key={transaction.id} value={transaction.id}>
                    {transaction.postedAt} · {transaction.accountName} ·{" "}
                    {money(transaction.amount)} · {transaction.merchant}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Matching transaction</span>
              <select name="second_transaction_id" required defaultValue="">
                <option value="" disabled>
                  Select transaction
                </option>
                {report.transferCandidates.map((transaction) => (
                  <option key={transaction.id} value={transaction.id}>
                    {transaction.postedAt} · {transaction.accountName} ·{" "}
                    {money(transaction.amount)} · {transaction.merchant}
                  </option>
                ))}
              </select>
            </label>
            <button className="data-submit" type="submit">
              <ArrowLeftRight size={13} />
              Confirm transfer pair
            </button>
          </form>
        </section>

        <section className="card page-card truth-section">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">MERCHANT RULES</span>
              <h2>Teach once, reuse forever</h2>
              <p className="empty-copy">
                Rules affect Solpient’s derived merchant and category only. Imported raw fields
                remain unchanged.
              </p>
            </div>
          </div>

          <form className="truth-rule-form" action={createMerchantRule}>
            <label>
              <span>Merchant to match</span>
              <input name="match_merchant" placeholder="AMZN Mktp or Amazon" required />
            </label>
            <div className="truth-rule-split">
              <label>
                <span>Display merchant</span>
                <input name="normalized_merchant" placeholder="Amazon" />
              </label>
              <label>
                <span>Category</span>
                <input name="category" placeholder="Shopping" />
              </label>
            </div>
            <input type="hidden" name="priority" value="100" />
            <button className="data-submit" type="submit">
              <Tags size={13} />
              Save merchant rule
            </button>
          </form>

          <div className="truth-rule-list">
            {report.merchantRules.map((rule) => (
              <div className="truth-rule-row" key={rule.id}>
                <div>
                  <strong>{rule.normalizedMerchant ?? rule.matchMerchant}</strong>
                  <span>
                    match: {rule.matchMerchant}
                    {rule.category ? ` · ${rule.category}` : ""}
                  </span>
                </div>
                <form action={deleteMerchantRule}>
                  <input type="hidden" name="rule_id" value={rule.id} />
                  <button className="truth-icon-danger" type="submit" aria-label="Delete rule">
                    <X size={13} />
                  </button>
                </form>
              </div>
            ))}
            {!report.merchantRules.length ? (
              <span className="truth-rule-empty">No household merchant rules yet.</span>
            ) : null}
          </div>
        </section>
      </section>

      {report.mergeAudits.length ? (
        <section className="card page-card truth-section">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">MERGE AUDIT</span>
              <h2>Confirmed account consolidation history</h2>
            </div>
          </div>
          <div className="truth-audit-list">
            {report.mergeAudits.map((audit) => (
              <div className="truth-audit-row" key={audit.id}>
                <GitMerge size={15} />
                <div>
                  <strong>
                    {audit.duplicateAccountName} → {audit.canonicalAccountName}
                  </strong>
                  <span>{when(audit.createdAt)}</span>
                </div>
                <span>{audit.movedTransactions} transactions moved</span>
                <span>{audit.reassignedHoldings} holdings moved</span>
                <span>{audit.suppressedHoldings} overlaps suppressed</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
