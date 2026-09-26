import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, TriangleAlert } from "lucide-react";
import AllocationExplorer from "@/components/AllocationExplorer";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import RefreshPricesButton from "./RefreshPricesButton";
import { getPortfolioMetrics, money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";
import {
  aggregateHoldingsByTicker,
  buildPortfolioIntelligence,
} from "@/lib/portfolio-intelligence";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const metrics = getPortfolioMetrics(data);
  const portfolioIntelligence = buildPortfolioIntelligence(data);
  const holdings = aggregateHoldingsByTicker(data.holdings);
  const bySector = Object.entries(
    data.holdings.reduce<Record<string, number>>((acc, holding) => {
      acc[holding.sector] = (acc[holding.sector] ?? 0) + holding.value;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  if (!data.holdings.length) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="PORTFOLIO"
          title="Your investments."
          description="Persisted household holdings with deterministic exposure review."
        />
        <EmptyState
          icon={BriefcaseBusiness}
          title="No holdings yet"
          copy="Import a brokerage CSV or add your first holding to see allocation, performance, and exposure review."
          actionHref="/connect"
          actionLabel="Import holdings"
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="PORTFOLIO"
        title="Your investments."
        description={context.source === "database" ? "Persisted household holdings with deterministic exposure review." : "Demo holdings with deterministic exposure review until Money persistence is connected."}
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Portfolio value</span><strong>{money(metrics.total)}</strong><small>{data.holdings.length} holdings</small></div>
        <div className="metric-card"><span>Largest position</span><strong>{portfolioIntelligence.largestStockWeightPct.toFixed(1)}%</strong><small>Of invested assets</small></div>
        <div className="metric-card"><span>Top-three weight</span><strong>{portfolioIntelligence.topThreeStockWeightPct.toFixed(1)}%</strong><small>Review line {data.householdPlan.topThreeStockReviewPct}%</small></div>
        <div className="metric-card"><span>Positions flagged</span><strong>{portfolioIntelligence.watchCount + portfolioIntelligence.criticalCount}</strong><small>Concentration review</small></div>
      </div>

      <section className="card page-card" id="allocation">
          <div className="section-title-row">
            <div><span className="card-kicker">ALLOCATION</span><h2>Asset mix</h2></div>
            <span className="small-muted">Select a class to see its positions</span>
          </div>
          <AllocationExplorer items={data.allocation} holdings={holdings} total={metrics.total} />
          <div className="alloc-exposures">
            <div className="section-title-row">
              <div><span className="card-kicker">EXPOSURES</span><h2>By sector / sleeve</h2></div>
            </div>
            <div className="bar-grid two-col">
              {bySector.map(([sector, value]) => {
                const weight = metrics.total ? (value / metrics.total) * 100 : 0;
                return (
                  <div className="bar-item" key={sector}>
                    <div><span>{sector}</span><strong>{weight.toFixed(1)}% · {money(value)}</strong></div>
                    <div className="bar-track"><span style={{ width: `${weight}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">HOLDINGS</span><h2>Positions</h2></div>
          <div className="holdings-header-actions">
            <span className="small-muted">Click a holding for position detail</span>
            {context.source === "database" ? <RefreshPricesButton /> : null}
          </div>
        </div>
        <div className="data-table holdings-table v03">
          <div className="table-row table-head-row">
            <span>Holding</span><span>Value</span><span>Weight</span><span>YTD</span>
          </div>
          {holdings.map((holding) => {
            const weight = metrics.total ? (holding.value / metrics.total) * 100 : 0;
            return (
              <Link className="table-row table-link" href={`/portfolio/${holding.ticker.toLowerCase()}`} key={holding.ticker}>
                <span className="holding-name">
                  <strong>{holding.ticker}</strong>
                  <small>
                    {holding.name}
                    {holding.source === "file" ? <em className="source-badge file-import">FILE IMPORT</em> : null}
                  </small>
                </span>
                <strong>{money(holding.value)}</strong>
                <span>{weight.toFixed(1)}%</span>
                <span className={holding.ytdReturn >= 0 ? "positive-text" : "negative-text"}>{holding.ytdReturn >= 0 ? "+" : ""}{holding.ytdReturn.toFixed(1)}%</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">PORTFOLIO INTELLIGENCE</span><h2>Exposure review</h2></div>
          <Link className="text-button" href="/portfolio-intelligence">Open intelligence <ArrowRight size={15} /></Link>
        </div>
        <div className="insight-grid">
          {portfolioIntelligence.signals.slice(0, 4).map((signal) => (
            <div
              className={
                "insight-item " +
                (signal.level === "positive" ? "good" : "watch")
              }
              key={signal.id}
            >
              {signal.level === "positive" ? (
                <CheckCircle2 size={20} />
              ) : (
                <TriangleAlert size={20} />
              )}
              <div>
                <strong>{signal.title}</strong>
                <p>{signal.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
