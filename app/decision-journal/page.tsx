import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  History,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/finance";
import {
  getDecisionJournal,
  getPortfolioAttribution,
} from "@/lib/portfolio-history";
import { requireMoneyDataset } from "@/lib/money-data";
import { buildPortfolioIntelligence } from "@/lib/portfolio-intelligence";
import { loadResearchSnapshots } from "@/lib/research";
import { recordInvestmentDecision } from "./actions";

export const dynamic = "force-dynamic";

function decisionLabel(value: string) {
  return value.replaceAll("_", " ");
}

function dateTime(value: string) {
  const parsed = new Date(value);
  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  ).format(parsed);
}

function signedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}${money(
    Math.abs(value)
  )}`;
}

export default async function DecisionJournalPage({
  searchParams,
}: {
  searchParams: Promise<{
    ticker?: string;
    actionItemId?: string;
  }>;
}) {
  const query = await searchParams;
  const context =
    await requireMoneyDataset();
  const stockHoldings =
    context.dataset.holdings.filter(
      (holding) =>
        holding.kind === "stock"
    );
  const research =
    await loadResearchSnapshots(
      stockHoldings.map(
        (holding) =>
          holding.ticker
      )
    );
  const report =
    buildPortfolioIntelligence(
      context.dataset,
      research
    );

  const requestedTicker = String(
    query.ticker ?? ""
  )
    .trim()
    .toUpperCase();
  const selectedTicker =
    report.positions.some(
      (position) =>
        position.ticker ===
        requestedTicker
    )
      ? requestedTicker
      : "";

  const [decisions, attribution] =
    await Promise.all([
      getDecisionJournal(100),
      getPortfolioAttribution(),
    ]);

  return (
    <div className="page decision-journal-page">
      <PageHeader
        eyebrow="V1.6 · DECISION JOURNAL"
        title="Remember what you knew, what you decided, and what happened next."
        description="Every decision is human-authored and attached to the current V1.6 portfolio/Research snapshot. Solpient records the evidence context; it does not execute the decision."
        action={
          <span className="live-pill connected">
            LOCAL HISTORY
          </span>
        }
      />

      <section className="card page-card decision-entry-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              RECORD A DECISION
            </span>
            <h2>
              Create a decision-time baseline
            </h2>
          </div>
          <BookOpenCheck size={18} />
        </div>

        <form
          className="decision-entry-form"
          action={
            recordInvestmentDecision
          }
        >
          <input
            type="hidden"
            name="actionItemId"
            value={String(
              query.actionItemId ?? ""
            )}
          />
          <label>
            <span>Holding</span>
            <select
              name="ticker"
              required
              defaultValue={selectedTicker}
            >
              <option
                value=""
                disabled
              >
                Choose a holding
              </option>
              {report.positions.map(
                (position) => (
                  <option
                    key={
                      position.ticker
                    }
                    value={
                      position.ticker
                    }
                  >
                    {position.ticker} ·{" "}
                    {position.weightPct.toFixed(
                      1
                    )}
                    % · Priority{" "}
                    {
                      position.reviewPriority
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            <span>Decision</span>
            <select
              name="decisionType"
              required
              defaultValue="hold"
            >
              <option value="hold">
                Hold
              </option>
              <option value="add_later">
                Add later
              </option>
              <option value="reduce_later">
                Reduce later
              </option>
              <option value="watch">
                Watch
              </option>
              <option value="no_action">
                No action
              </option>
            </select>
          </label>

          <label className="decision-note-field">
            <span>
              Why? (optional)
            </span>
            <textarea
              name="note"
              maxLength={4000}
              placeholder="Record the reasoning, uncertainty, or condition that would change your mind."
            />
          </label>

          <button
            className="research-button"
            type="submit"
          >
            Save decision{" "}
            <ArrowRight size={15} />
          </button>
        </form>
      </section>

      <div className="decision-journal-layout">
        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                JOURNAL
              </span>
              <h2>
                Recent investment decisions
              </h2>
            </div>
            <span className="small-muted">
              {decisions.length} recorded
            </span>
          </div>

          {decisions.length ? (
            <div className="decision-list">
              {decisions.map(
                (decision) => (
                  <Link
                    className="decision-row"
                    href={`/portfolio/${decision.ticker.toLowerCase()}`}
                    key={decision.id}
                  >
                    <span className="decision-symbol">
                      {decision.ticker}
                    </span>
                    <div>
                      <strong>
                        {decisionLabel(
                          decision.decisionType
                        )}
                      </strong>
                      <span>
                        {decision.note ||
                          "No note recorded."}
                      </span>
                    </div>
                    <time>
                      {dateTime(
                        decision.decidedAt
                      )}
                    </time>
                    <ArrowRight
                      size={14}
                    />
                  </Link>
                )
              )}
            </div>
          ) : (
            <div className="action-empty">
              <BookOpenCheck
                size={24}
              />
              <strong>
                No decisions recorded yet.
              </strong>
              <span>
                Your first entry will create a
                decision-time evidence baseline.
              </span>
            </div>
          )}
        </section>

        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                ATTRIBUTION
              </span>
              <h2>
                What drove portfolio value changes
              </h2>
            </div>
            <History size={18} />
          </div>

          {attribution.length ? (
            <div className="decision-attribution-list">
              {attribution.map(
                (item) => (
                  <div
                    className="decision-attribution-row"
                    key={
                      item.ticker
                    }
                  >
                    <span
                      className={
                        item.valueChange >=
                        0
                          ? "decision-attribution-icon positive"
                          : "decision-attribution-icon negative"
                      }
                    >
                      {item.valueChange >=
                      0 ? (
                        <TrendingUp
                          size={15}
                        />
                      ) : (
                        <TrendingDown
                          size={15}
                        />
                      )}
                    </span>
                    <div>
                      <strong>
                        {item.ticker}
                      </strong>
                      <span>
                        {item.firstDate} →{" "}
                        {item.latestDate}
                      </span>
                    </div>
                    <strong
                      className={
                        item.valueChange >=
                        0
                          ? "positive-text"
                          : "negative-text"
                      }
                    >
                      {signedMoney(
                        item.valueChange
                      )}
                    </strong>
                    <span>
                      {item.valueChangePct ==
                      null
                        ? "—"
                        : `${item.valueChangePct >= 0 ? "+" : ""}${item.valueChangePct.toFixed(
                            1
                          )}%`}
                    </span>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="action-empty">
              <History size={24} />
              <strong>
                History starts with V1.6.
              </strong>
              <span>
                After multiple daily snapshots,
                attribution will show which
                positions drove the observed
                portfolio change.
              </span>
            </div>
          )}
        </section>
      </div>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              CURRENT REVIEW CONTEXT
            </span>
            <h2>
              Evidence available for your next decision
            </h2>
          </div>
          <BrainCircuit size={18} />
        </div>

        <div className="decision-context-grid">
          {report.positions
            .slice(0, 8)
            .map(
              (position) => (
                <Link
                  href={`/portfolio/${position.ticker.toLowerCase()}`}
                  key={
                    position.ticker
                  }
                >
                  <div>
                    <strong>
                      {position.ticker}
                    </strong>
                    <span>
                      {position.weightPct.toFixed(
                        1
                      )}
                      % portfolio
                    </span>
                  </div>
                  <div>
                    <span>
                      Review priority
                    </span>
                    <strong>
                      {
                        position.reviewPriority
                      }
                    </strong>
                  </div>
                  <div>
                    <span>
                      Evidence
                    </span>
                    <strong>
                      {position.evidenceConfidence?.toFixed(
                        0
                      ) ?? "—"}
                    </strong>
                  </div>
                  <ArrowRight
                    size={14}
                  />
                </Link>
              )
            )}
        </div>
      </section>

      <div className="bottom-note">
        <BookOpenCheck size={15} />
        <span>
          Hold, Add later, Reduce later, Watch,
          and No action are journal labels, not
          executable orders. Solpient V1.6
          records your intent but never places a
          trade.
        </span>
      </div>
    </div>
  );
}
