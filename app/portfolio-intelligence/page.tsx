import Link from "next/link";
import {
  ArrowLeft,
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

export const dynamic = "force-dynamic";

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
  const report =
    buildPortfolioIntelligence(
      context.dataset
    );

  return (
    <div className="page portfolio-intelligence-page">
      <Link className="back-link" href="/portfolio"><ArrowLeft size={15} /> Back to portfolio</Link>
      <PageHeader
        eyebrow="PORTFOLIO INTELLIGENCE"
        title="Where portfolio exposure deserves review."
        description="Deterministic exposure review: position size against household concentration limits. It prioritizes review; it does not issue trades."
      />

      <div className="metric-grid four">
        <div className="metric-card">
          <span>Direct-stock value</span>
          <strong>
            {money(report.directStockValue)}
          </strong>
          <small>
            {report.positions.length} positions
          </small>
        </div>
        <div className="metric-card">
          <span>Largest position</span>
          <strong>
            {report.largestStockWeightPct.toFixed(
              1
            )}
            %
          </strong>
          <small>
            Of invested assets
          </small>
        </div>
        <div className="metric-card">
          <span>Top-three weight</span>
          <strong>
            {report.topThreeStockWeightPct.toFixed(
              1
            )}
            %
          </strong>
          <small>
            Review line{" "}
            {
              context.dataset.householdPlan
                .topThreeStockReviewPct
            }
            %
          </small>
        </div>
        <div className="metric-card">
          <span>Sectors</span>
          <strong>
            {report.sectors.length}
          </strong>
          <small>
            Direct-stock exposure
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
          href="/portfolio"
        >
          Open Portfolio{" "}
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
                    <span>Priority</span>
                    <strong>
                      {position.reviewPriority}
                    </strong>
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
              PORTFOLIO SIGNALS
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
          based on portfolio exposure against
          household concentration limits. It is not a
          buy/sell recommendation and does not
          execute trades.
        </span>
      </div>
    </div>
  );
}
