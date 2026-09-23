import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  Gauge,
  ShieldAlert,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";
import {
  buildPortfolioIntelligence,
  type PortfolioSignalLevel,
} from "@/lib/portfolio-intelligence";
import { loadResearchSnapshots } from "@/lib/research";

export const dynamic = "force-dynamic";

function pct(
  value: number | null,
  digits = 1
) {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function signalIcon(
  level: PortfolioSignalLevel
) {
  if (level === "critical") {
    return <ShieldAlert size={17} />;
  }
  if (level === "watch") {
    return <CircleAlert size={17} />;
  }
  return <CheckCircle2 size={17} />;
}

function signalLabel(
  level: PortfolioSignalLevel
) {
  if (level === "critical") return "Critical";
  if (level === "watch") return "Review";
  if (level === "positive") return "Aligned";
  return "Info";
}

export default async function PortfolioIntelligencePage() {
  const context = await requireMoneyDataset();
  const tickers = context.dataset.holdings
    .filter(
      (holding) =>
        holding.kind === "stock"
    )
    .map((holding) => holding.ticker);

  const research =
    await loadResearchSnapshots(tickers);
  const report =
    buildPortfolioIntelligence(
      context.dataset,
      research
    );

  return (
    <div className="page portfolio-intelligence-page">
      <PageHeader
        eyebrow="V1.5 · PORTFOLIO INTELLIGENCE"
        title="Where portfolio exposure and Research evidence conflict."
        description="V1.5 combines position size, household concentration limits, published valuation, thesis health, evidence confidence, decision readiness, and evidence age. It prioritizes review; it does not issue trades."
        action={
          <span
            className={
              "live-pill " +
              (report.researchConnected
                ? "connected"
                : "disconnected")
            }
          >
            {report.researchConnected
              ? "RESEARCH LIVE"
              : "RESEARCH UNAVAILABLE"}
          </span>
        }
      />

      {!report.researchConnected ? (
        <section className="card page-card error-card">
          <strong>
            Portfolio Research connection unavailable
          </strong>
          <p>
            {report.researchError ??
              "Solpient cannot currently verify published Research context."}
          </p>
        </section>
      ) : null}

      <div className="metric-grid four">
        <div className="metric-card">
          <span>Direct-stock coverage</span>
          <strong>
            {report.coveragePct.toFixed(0)}%
          </strong>
          <small>
            {money(report.coveredValue)} of{" "}
            {money(report.directStockValue)}
          </small>
        </div>
        <div className="metric-card">
          <span>Weighted Research score</span>
          <strong>
            {report.weightedResearchScore?.toFixed(
              0
            ) ?? "—"}
          </strong>
          <small>
            Position-value weighted
          </small>
        </div>
        <div className="metric-card">
          <span>Evidence confidence</span>
          <strong>
            {report.weightedEvidenceConfidence?.toFixed(
              0
            ) ?? "—"}
          </strong>
          <small>
            Covered direct-stock value
          </small>
        </div>
        <div className="metric-card">
          <span>Weighted valuation gap</span>
          <strong
            className={
              (report.weightedValuationGapPct ??
                0) >= 0
                ? "positive-text"
                : "negative-text"
            }
          >
            {pct(
              report.weightedValuationGapPct
            )}
          </strong>
          <small>
            Research base value vs holding price
          </small>
        </div>
      </div>

      <section className="card page-card portfolio-intel-hero">
        <div>
          <span className="card-kicker">
            REVIEW PRESSURE
          </span>
          <h2>
            {report.criticalCount} critical ·{" "}
            {report.watchCount} review
          </h2>
          <p>
            Largest direct stock:{" "}
            {report.largestStockWeightPct.toFixed(
              1
            )}
            % · Top three:{" "}
            {report.topThreeStockWeightPct.toFixed(
              1
            )}
            %.
          </p>
        </div>
        <Link
          className="research-button"
          href="/action-center"
        >
          Open Action Center{" "}
          <ArrowRight size={15} />
        </Link>
      </section>

      <div className="portfolio-intel-layout">
        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                REVIEW QUEUE
              </span>
              <h2>
                Positions ranked by review priority
              </h2>
            </div>
            <BrainCircuit size={18} />
          </div>

          <div className="portfolio-review-list">
            {report.positions.map(
              (position, index) => (
                <Link
                  className="portfolio-review-row"
                  href={`/portfolio/${position.ticker.toLowerCase()}`}
                  key={position.ticker}
                >
                  <span className="portfolio-review-rank">
                    {index + 1}
                  </span>
                  <div className="portfolio-review-main">
                    <div>
                      <strong>
                        {position.ticker}
                      </strong>
                      <span>
                        {position.name}
                      </span>
                    </div>
                    <p>
                      {position.reviewReasons[0]}
                    </p>
                  </div>
                  <div className="portfolio-review-metric">
                    <span>Weight</span>
                    <strong>
                      {position.weightPct.toFixed(
                        1
                      )}
                      %
                    </strong>
                  </div>
                  <div className="portfolio-review-metric">
                    <span>Base gap</span>
                    <strong
                      className={
                        (position.valuationGapPct ??
                          0) >= 0
                          ? "positive-text"
                          : "negative-text"
                      }
                    >
                      {pct(
                        position.valuationGapPct
                      )}
                    </strong>
                  </div>
                  <div className="portfolio-review-metric">
                    <span>Evidence</span>
                    <strong>
                      {position.evidenceConfidence?.toFixed(
                        0
                      ) ?? "—"}
                    </strong>
                  </div>
                  <div className="portfolio-review-state">
                    <span
                      className={
                        "thesis-pill " +
                        (position.thesisHealth ??
                          "none")
                      }
                    >
                      {position.thesisHealth
                        ? position.thesisHealth.replaceAll(
                            "_",
                            " "
                          )
                        : "No coverage"}
                    </span>
                    <small>
                      Priority{" "}
                      {position.reviewPriority}
                    </small>
                  </div>
                  <ArrowRight size={15} />
                </Link>
              )
            )}
          </div>
        </section>

        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                SECTOR EXPOSURE
              </span>
              <h2>Direct-stock concentration</h2>
            </div>
            <Gauge size={18} />
          </div>

          <div className="portfolio-sector-list">
            {report.sectors.map((sector) => (
              <div
                className="portfolio-sector-row"
                key={sector.sector}
              >
                <div>
                  <strong>{sector.sector}</strong>
                  <span>
                    {sector.holdingCount} holding
                    {sector.holdingCount === 1
                      ? ""
                      : "s"}
                  </span>
                </div>
                <strong>
                  {sector.weightPct.toFixed(1)}%
                </strong>
                <div className="portfolio-sector-track">
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        sector.weightPct
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              PORTFOLIO + RESEARCH SIGNALS
            </span>
            <h2>What deserves attention now</h2>
          </div>
          <span className="small-muted">
            {report.signals.length} current signal
            {report.signals.length === 1
              ? ""
              : "s"}
          </span>
        </div>

        <div className="portfolio-signal-list">
          {report.signals.map((signal) => (
            <Link
              className={`portfolio-signal-row portfolio-signal-${signal.level}`}
              href={signal.href}
              key={signal.id}
            >
              <span className="portfolio-signal-icon">
                {signalIcon(signal.level)}
              </span>
              <div>
                <strong>{signal.title}</strong>
                <span>{signal.detail}</span>
              </div>
              <span className="portfolio-signal-label">
                {signalLabel(
                  signal.level
                )}
              </span>
              <ArrowRight size={15} />
            </Link>
          ))}
        </div>
      </section>

      <div className="bottom-note">
        <BrainCircuit size={15} />
        <span>
          Review priority is deterministic and
          based on portfolio exposure plus
          published Research context. It is not a
          buy/sell recommendation and does not
          execute trades.
        </span>
      </div>
    </div>
  );
}
