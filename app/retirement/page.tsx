import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getCashFlowIntelligence } from "@/lib/cash-flow-intelligence";
import { buildFinancialHealthEngine } from "@/lib/financial-health-engine";
import { money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

export default async function RetirementPage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const plan = data.householdPlan;
  const cashFlow = await getCashFlowIntelligence();
  const health = buildFinancialHealthEngine(data, cashFlow);
  const years = health.metrics.retirementYears;
  const projected = health.metrics.retirementProjectedAssets;
  const funding = health.metrics.retirementFundingPct;

  return (
    <div className="page">
      <PageHeader
        eyebrow="RETIREMENT"
        title="Plan with scenarios, not one magic number."
        description="The baseline uses household planning assumptions, current invested assets, and transaction-derived savings."
        action={<Link className="research-button" href="/scenario-lab">Open Scenario Lab <ArrowRight size={15} /></Link>}
      />
      <div className="retirement-plan-link"><Link href="/plan">Open Financial Plan <ArrowRight size={14} /></Link></div>
      <div className="metric-grid four">
        <div className="metric-card"><span>Invested assets</span><strong>{money(health.metrics.investments)}</strong><small>Current household portfolio</small></div>
        <div className="metric-card"><span>Baseline projection</span><strong>{money(projected)}</strong><small>{years} years at {plan.expectedAnnualReturnPct}% assumption</small></div>
        <div className="metric-card"><span>Target funding</span><strong>{funding.toFixed(0)}%</strong><small>Against {money(plan.targetRetirementAssets)}</small></div>
        <div className="metric-card"><span>Target age</span><strong>{plan.targetRetirementAge}</strong><small>Current age assumption {plan.demoCurrentAge}</small></div>
      </div>
      <section className="card page-card">
        <div className="section-title-row"><div><span className="card-kicker">BASELINE ASSUMPTIONS</span><h2>Visible instead of hidden</h2></div></div>
        <div className="scenario-grid">
          <div><strong>{money(health.metrics.retirementMonthlyContribution)}/mo</strong><span>Trailing average positive household surplus</span></div>
          <div><strong>{plan.expectedAnnualReturnPct}%</strong><span>Constant annual investment-return assumption</span></div>
          <div><strong>{years} years</strong><span>Target age minus current-age assumption</span></div>
          <div><strong>Not modeled</strong><span>Taxes, inflation, pensions, Social Security, sequence risk</span></div>
        </div>
      </section>
    </div>
  );
}
