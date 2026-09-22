import { CheckCircle2, TriangleAlert } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { holdings } from "@/lib/demo-data";
import { getFinancialSummary, getPortfolioInsights } from "@/lib/finance";
import { loadResearchSnapshots, summarizeResearchCoverage } from "@/lib/research";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const financial = getFinancialSummary();
  const tickers = holdings.filter((holding) => holding.kind === "stock").map((holding) => holding.ticker);
  const research = await loadResearchSnapshots(tickers);
  const researchSummary = summarizeResearchCoverage(holdings, research.snapshots);
  const insights = getPortfolioInsights(research.snapshots);

  return (
    <div className="page">
      <PageHeader
        eyebrow="SOLPIENT INTELLIGENCE"
        title="What deserves your attention."
        description="Portfolio calculations are deterministic. Research coverage and evidence confidence are now read live from Solpient Research."
        action={<span className={"live-pill " + (research.connected ? "connected" : "disconnected")}>{research.connected ? "RESEARCH LIVE" : "RESEARCH UNAVAILABLE"}</span>}
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Research coverage</span><strong>{researchSummary.coveragePct.toFixed(0)}%</strong><small>Direct-stock value with published Research</small></div>
        <div className="metric-card"><span>Weighted Research score</span><strong>{researchSummary.weightedScore?.toFixed(0) ?? "—"}</strong><small>Latest published runs</small></div>
        <div className="metric-card"><span>Evidence confidence</span><strong>{researchSummary.weightedEvidenceConfidence?.toFixed(0) ?? "—"}</strong><small>Current ranking layer</small></div>
        <div className="metric-card"><span>Demo savings rate</span><strong>{financial.savingsRate.toFixed(0)}%</strong><small>From visible demo transactions</small></div>
      </div>

      <section className="card page-card">
        <div className="section-title-row"><div><span className="card-kicker">RULE-BASED REVIEW</span><h2>Current findings</h2></div></div>
        <div className="insight-list-large">
          {insights.map((insight, index) => (
            <div className={"insight-large " + insight.level} key={insight.title}>
              <span className="insight-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="insight-large-icon">{insight.level === "good" ? <CheckCircle2 size={22} /> : <TriangleAlert size={22} />}</span>
              <div><strong>{insight.title}</strong><p>{insight.detail}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row"><div><span className="card-kicker">RESEARCH SIGNALS</span><h2>Covered holdings</h2></div></div>
        <div className="live-research-table">
          {Object.values(research.snapshots)
            .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
            .map((snapshot) => (
              <div className="live-research-row" key={snapshot.ticker}>
                <strong>{snapshot.ticker}</strong>
                <span>Score {snapshot.overall_score?.toFixed(0) ?? "—"}</span>
                <span>Thesis {snapshot.thesis_health}</span>
                <span>Evidence {snapshot.evidence_confidence_score?.toFixed(1) ?? "—"}</span>
                <span>Readiness {snapshot.current_decision_readiness_pct?.toFixed(1) ?? "—"}%</span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
