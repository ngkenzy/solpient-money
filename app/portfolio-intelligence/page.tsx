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
  aggregateHoldingsByTicker,
  buildPortfolioIntelligence,
  type PortfolioSignalLevel,
} from "@/lib/portfolio-intelligence";
import {
  getValueCheck,
  signalLabel as valueSignalLabel,
  VALUE_SOURCE_LABEL,
  type ValueSignal,
} from "@/lib/value-proxies";
import { getDividendIntelligence } from "@/lib/dividends";

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
  const holdings = aggregateHoldingsByTicker(
    context.dataset.holdings
  );
  const dividendIntel =
    await getDividendIntelligence(holdings);
  const yieldByTicker = new Map(
    dividendIntel.payers.map((payer) => [
      payer.ticker,
      payer.yieldPct,
    ])
  );
  const valueCheck = await getValueCheck(
    holdings,
    yieldByTicker
  );
  const valueUpdatedLabel = valueCheck.fetchedAt
    ? new Date(
        valueCheck.fetchedAt
      ).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

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

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              VALUE CHECK
            </span>
            <h2>Cheap or expensive?</h2>
          </div>
          {valueUpdatedLabel ? (
            <span className="small-muted">
              Updated {valueUpdatedLabel} ·{" "}
              {VALUE_SOURCE_LABEL}
            </span>
          ) : null}
        </div>
        {valueCheck.rows.length === 0 ? (
          <p className="small-muted">
            No value data yet. On the Portfolio
            page, use “Refresh dividends &amp;
            value” to pull 52-week ranges and
            analyst targets for your holdings —
            fully automatic, nothing to type.
          </p>
        ) : (
          <>
            <div className="value-summary">
              <span className="value-chip">
                <strong>
                  {valueCheck.highYieldCount}
                </strong>{" "}
                high yielders (4%+)
              </span>
              <span className="value-chip">
                <strong>
                  {valueCheck.discountCount}
                </strong>{" "}
                trading 10%+ off highs
              </span>
            </div>
            <div className="data-table value-table">
              <div className="table-row table-head-row">
                <span>Holding</span>
                <span>Price</span>
                <span>Yield</span>
                <span>Vs 52-wk high</span>
                <span>Analyst target</span>
                <span>Signals</span>
              </div>
              {valueCheck.rows.map((row) => (
                <div
                  className="table-row"
                  key={row.ticker}
                >
                  <span className="holding-name">
                    <strong>{row.ticker}</strong>
                    <small>
                      {row.sector ?? row.name}
                    </small>
                  </span>
                  <span>
                    <strong>
                      {money(row.price)}
                    </strong>
                  </span>
                  <span>
                    {row.yieldPct != null
                      ? `${row.yieldPct.toFixed(2)}%`
                      : "—"}
                  </span>
                  <span
                    className={
                      row.belowHighPct != null &&
                      row.belowHighPct >= 10
                        ? "positive-text"
                        : undefined
                    }
                  >
                    {row.belowHighPct != null
                      ? `−${row.belowHighPct.toFixed(1)}%`
                      : "—"}
                  </span>
                  <span
                    className={
                      row.targetGapPct != null &&
                      row.targetGapPct >= 0
                        ? "positive-text"
                        : "negative-text"
                    }
                  >
                    {row.targetGapPct != null
                      ? `${row.targetGapPct >= 0 ? "+" : ""}${row.targetGapPct.toFixed(1)}%`
                      : "—"}
                  </span>
                  <span className="value-signals">
                    {row.signals.length ? (
                      row.signals.map(
                        (
                          signal: ValueSignal
                        ) => (
                          <em
                            key={signal}
                            className={`value-signal value-signal-${signal}`}
                          >
                            {valueSignalLabel(
                              signal
                            )}
                          </em>
                        )
                      )
                    ) : (
                      <em className="value-signal value-signal-none">
                        Fairly priced
                      </em>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="small-muted div-footnote">
              Automatic proxies, not a buy
              recommendation. Your own intrinsic
              value is the real call — these just
              show where price sits right now.
            </p>
          </>
        )}
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
