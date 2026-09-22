import { CheckCircle2, TriangleAlert } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getFinancialSummary, getPortfolioInsights, getPortfolioMetrics } from "@/lib/finance";

export default function InsightsPage() {
  const portfolio = getPortfolioMetrics();
  const financial = getFinancialSummary();
  const insights = getPortfolioInsights();

  return (
    <div className="page">
      <PageHeader
        eyebrow="SOLPIENT INTELLIGENCE"
        title="What deserves your attention."
        description="V0.2 derives these observations from the demo financial model. The language is explanatory; the underlying metrics are deterministic."
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Research coverage</span><strong>{portfolio.researchCoverage.toFixed(0)}%</strong><small>Direct-stock value</small></div>
        <div className="metric-card"><span>Largest direct stock</span><strong>{portfolio.largestDirectStock.ticker}</strong><small>{portfolio.largestDirectStock.weight.toFixed(1)}% of investments</small></div>
        <div className="metric-card"><span>Portfolio cash</span><strong>{portfolio.cashWeight.toFixed(1)}%</strong><small>Of invested assets</small></div>
        <div className="metric-card"><span>Demo savings rate</span><strong>{financial.savingsRate.toFixed(0)}%</strong><small>From visible transactions</small></div>
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
    </div>
  );
}
