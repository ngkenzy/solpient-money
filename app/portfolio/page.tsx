import Link from "next/link";
import { ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import AllocationDonut from "@/components/AllocationDonut";
import InteractiveLineChart from "@/components/InteractiveLineChart";
import PageHeader from "@/components/PageHeader";
import { getPortfolioInsights, getPortfolioMetrics, money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";
import { loadResearchSnapshots, summarizeResearchCoverage } from "@/lib/research";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const metrics = getPortfolioMetrics(data);
  const directTickers = data.holdings.filter((holding) => holding.kind === "stock").map((holding) => holding.ticker);
  const research = await loadResearchSnapshots(directTickers);
  const researchSummary = summarizeResearchCoverage(data.holdings, research.snapshots);
  const insights = getPortfolioInsights(research.snapshots, data);

  return (
    <div className="page">
      <PageHeader
        eyebrow="PORTFOLIO"
        title="Your investments, connected to live Research."
        description={context.source === "database" ? "Persisted household holdings are matched to live published Solpient Research." : "Demo holdings are matched to live published Solpient Research until Money persistence is connected."}
        action={<span className={"live-pill " + (research.connected ? "connected" : "disconnected")}>{research.connected ? "RESEARCH LIVE" : "RESEARCH UNAVAILABLE"}</span>}
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Portfolio value</span><strong>{money(metrics.total)}</strong><small>{data.holdings.length} holdings</small></div>
        <div className="metric-card"><span>Research coverage</span><strong>{researchSummary.coveragePct.toFixed(0)}%</strong><small>Of direct-stock value</small></div>
        <div className="metric-card"><span>Weighted Research score</span><strong>{researchSummary.weightedScore?.toFixed(0) ?? "—"}</strong><small>Latest published runs</small></div>
        <div className="metric-card"><span>Evidence confidence</span><strong>{researchSummary.weightedEvidenceConfidence?.toFixed(0) ?? "—"}</strong><small>Current Research ranking layer</small></div>
      </div>

      <div className="portfolio-layout">
        <section className="card page-card" id="performance">
          <div className="section-title-row">
            <div><span className="card-kicker">PERFORMANCE</span><h2>Portfolio vs benchmark</h2></div>
            <Link className="text-button" href="/performance">Open performance <ArrowRight size={15} /></Link>
          </div>
          <InteractiveLineChart
            data={data.portfolioPerformance}
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
            <AllocationDonut items={data.allocation} totalLabel={money(metrics.total / 1000) + "K"} />
            <div className="allocation-list roomy">
              {data.allocation.map((item) => (
                <div key={item.label}><span className={"dot " + item.tone} /><span>{item.label}</span><strong>{item.value}%</strong></div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">HOLDINGS</span><h2>Positions + live Research</h2></div>
          <span className="small-muted">Click a holding for position and Research detail</span>
        </div>
        <div className="data-table holdings-table v03">
          <div className="table-row table-head-row">
            <span>Holding</span><span>Value</span><span>Weight</span><span>YTD</span><span>Research</span><span>Fair value</span><span>Thesis</span>
          </div>
          {data.holdings.map((holding) => {
            const weight = metrics.total ? (holding.value / metrics.total) * 100 : 0;
            const snapshot = research.snapshots[holding.ticker];
            return (
              <Link className="table-row table-link" href={`/portfolio/${holding.ticker.toLowerCase()}`} key={holding.ticker}>
                <span className="holding-name">
                  <strong>{holding.ticker}</strong>
                  <small>
                    {holding.name}
                    {holding.source === "plaid" ? <em className="source-badge plaid-test">PLAID TEST</em> : holding.source === "file" ? <em className="source-badge file-import">FILE IMPORT</em> : holding.source === "ofx_direct" ? <em className="source-badge direct-ofx">DIRECT OFX</em> : null}
                  </small>
                </span>
                <strong>{money(holding.value)}</strong>
                <span>{weight.toFixed(1)}%</span>
                <span className={holding.ytdReturn >= 0 ? "positive-text" : "negative-text"}>{holding.ytdReturn >= 0 ? "+" : ""}{holding.ytdReturn.toFixed(1)}%</span>
                <span>{snapshot?.overall_score ?? "—"}</span>
                <span>{snapshot?.base_value != null ? money(snapshot.base_value, true) : "—"}</span>
                <span><span className={"thesis-pill " + (snapshot?.thesis_health ?? "none")}>{snapshot?.thesis_health?.replace("_", " ") ?? "No coverage"}</span></span>
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
