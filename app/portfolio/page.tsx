import Link from "next/link";
import { ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import AllocationDonut from "@/components/AllocationDonut";
import InteractiveLineChart from "@/components/InteractiveLineChart";
import PageHeader from "@/components/PageHeader";
import { allocation, holdings, portfolioPerformance } from "@/lib/demo-data";
import { getPortfolioInsights, getPortfolioMetrics, money } from "@/lib/finance";

export default function PortfolioPage() {
  const metrics = getPortfolioMetrics();
  const insights = getPortfolioInsights();

  return (
    <div className="page">
      <PageHeader
        eyebrow="PORTFOLIO"
        title="Your investments, connected to intelligence."
        description="Holdings, allocation, concentration, performance, and demo Solpient Research signals in one decision surface."
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Portfolio value</span><strong>{money(metrics.total)}</strong><small>Across demo holdings</small></div>
        <div className="metric-card"><span>Largest holding</span><strong>{metrics.largestHolding.ticker}</strong><small>{metrics.largestHolding.weight.toFixed(1)}% of portfolio</small></div>
        <div className="metric-card"><span>Research coverage</span><strong>{metrics.researchCoverage.toFixed(0)}%</strong><small>Of direct-stock value</small></div>
        <div className="metric-card"><span>Research score</span><strong>{metrics.weightedResearchScore.toFixed(0)}</strong><small>Value-weighted demo score</small></div>
      </div>

      <div className="portfolio-layout">
        <section className="card page-card" id="performance">
          <div className="section-title-row">
            <div><span className="card-kicker">PERFORMANCE</span><h2>Portfolio vs benchmark</h2></div>
            <Link className="text-button" href="/performance">Open performance <ArrowRight size={15} /></Link>
          </div>
          <InteractiveLineChart
            data={portfolioPerformance}
            series={[
              { key: "portfolio", label: "Portfolio", format: "percent" },
              { key: "benchmark", label: "Benchmark", format: "percent" },
            ]}
            height={255}
          />
        </section>

        <section className="card page-card allocation-panel" id="allocation">
          <div className="section-title-row">
            <div><span className="card-kicker">ALLOCATION</span><h2>Asset mix</h2></div>
            <Link className="text-button" href="/allocation">Details <ArrowRight size={15} /></Link>
          </div>
          <div className="portfolio-allocation">
            <AllocationDonut items={allocation} totalLabel="$864K" />
            <div className="allocation-list roomy">
              {allocation.map((item) => (
                <div key={item.label}>
                  <span className={"dot " + item.tone} />
                  <span>{item.label}</span>
                  <strong>{item.value}%</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">HOLDINGS</span><h2>Positions</h2></div>
          <span className="small-muted">Click a holding for position detail</span>
        </div>
        <div className="data-table holdings-table">
          <div className="table-row table-head-row">
            <span>Holding</span><span>Value</span><span>Weight</span><span>YTD</span><span>Research</span><span>Thesis</span>
          </div>
          {holdings.map((holding) => {
            const weight = (holding.value / metrics.total) * 100;
            return (
              <Link className="table-row table-link" href={`/portfolio/${holding.ticker.toLowerCase()}`} key={holding.ticker}>
                <span className="holding-name"><strong>{holding.ticker}</strong><small>{holding.name}</small></span>
                <strong>{money(holding.value)}</strong>
                <span>{weight.toFixed(1)}%</span>
                <span className={holding.ytdReturn >= 0 ? "positive-text" : "negative-text"}>{holding.ytdReturn >= 0 ? "+" : ""}{holding.ytdReturn.toFixed(1)}%</span>
                <span>{holding.researchScore ?? "—"}</span>
                <span><span className={"thesis-pill " + (holding.thesis?.toLowerCase().replace(" ", "-") ?? "none")}>{holding.thesis ?? "Index / cash"}</span></span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">PORTFOLIO INTELLIGENCE</span><h2>What deserves attention</h2></div>
          <Link className="text-button" href="/insights">All insights <ArrowRight size={15} /></Link>
        </div>
        <div className="insight-grid">
          {insights.map((insight) => (
            <div className={"insight-item " + insight.level} key={insight.title}>
              {insight.level === "good" ? <CheckCircle2 size={20} /> : <TriangleAlert size={20} />}
              <div><strong>{insight.title}</strong><p>{insight.detail}</p></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
