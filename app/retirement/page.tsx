import PageHeader from "@/components/PageHeader";
import { getPortfolioMetrics, money } from "@/lib/finance";

export default function RetirementPage() {
  const portfolio = getPortfolioMetrics();
  const projected = portfolio.total * 2.15;

  return (
    <div className="page">
      <PageHeader
        eyebrow="RETIREMENT"
        title="Plan with scenarios, not one magic number."
        description="V0.2 provides the planning surface only. Later versions will use household cash flows, pensions, taxes, Social Security, and Monte Carlo simulations."
      />
      <div className="metric-grid four">
        <div className="metric-card"><span>Invested assets</span><strong>{money(portfolio.total)}</strong><small>Current demo portfolio</small></div>
        <div className="metric-card"><span>Illustrative projection</span><strong>{money(projected)}</strong><small>Not a forecast</small></div>
        <div className="metric-card"><span>Funding status</span><strong>92%</strong><small>Demo planning score</small></div>
        <div className="metric-card"><span>Target age</span><strong>50</strong><small>Demo assumption</small></div>
      </div>
      <section className="card page-card">
        <div className="section-title-row"><div><span className="card-kicker">SCENARIO FRAMEWORK</span><h2>What V0.3+ will model</h2></div></div>
        <div className="scenario-grid">
          <div><strong>Base case</strong><span>Current saving and allocation assumptions</span></div>
          <div><strong>Market stress</strong><span>Large drawdown near retirement</span></div>
          <div><strong>Earlier retirement</strong><span>Move the retirement date forward</span></div>
          <div><strong>Higher spending</strong><span>Travel or lifestyle changes</span></div>
        </div>
      </section>
    </div>
  );
}
