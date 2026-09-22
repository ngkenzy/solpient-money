import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/finance";
import { getFinancialHealth } from "@/lib/intelligence";
import { requireMoneyDataset } from "@/lib/money-data";

function futureValue(principal: number, monthlyContribution: number, annualReturnPct: number, months: number) {
  const monthlyRate = annualReturnPct / 100 / 12;
  if (months <= 0) return principal;
  if (Math.abs(monthlyRate) < 0.0000001) return principal + monthlyContribution * months;
  const growth = Math.pow(1 + monthlyRate, months);
  return principal * growth + monthlyContribution * ((growth - 1) / monthlyRate);
}

export const dynamic = "force-dynamic";

export default async function RetirementPage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const plan = data.householdPlan;
  const health = getFinancialHealth({}, data);
  const years = Math.max(0, plan.targetRetirementAge - plan.demoCurrentAge);
  const projected = futureValue(health.metrics.investments, health.metrics.averageMonthlySavings, plan.expectedAnnualReturnPct, years * 12);
  const funding = plan.targetRetirementAssets > 0 ? Math.min(100, projected / plan.targetRetirementAssets * 100) : 0;

  return (
    <div className="page">
      <PageHeader
        eyebrow="RETIREMENT"
        title="Plan with scenarios, not one magic number."
        description="The baseline uses household planning assumptions, current invested assets, and transaction-derived savings."
        action={<Link className="research-button" href="/scenario-lab">Open Scenario Lab <ArrowRight size={15} /></Link>}
      />
      <div className="metric-grid four">
        <div className="metric-card"><span>Invested assets</span><strong>{money(health.metrics.investments)}</strong><small>Current household portfolio</small></div>
        <div className="metric-card"><span>Baseline projection</span><strong>{money(projected)}</strong><small>{years} years at {plan.expectedAnnualReturnPct}% assumption</small></div>
        <div className="metric-card"><span>Target funding</span><strong>{funding.toFixed(0)}%</strong><small>Against {money(plan.targetRetirementAssets)}</small></div>
        <div className="metric-card"><span>Target age</span><strong>{plan.targetRetirementAge}</strong><small>Current age assumption {plan.demoCurrentAge}</small></div>
      </div>
      <section className="card page-card">
        <div className="section-title-row"><div><span className="card-kicker">BASELINE ASSUMPTIONS</span><h2>Visible instead of hidden</h2></div></div>
        <div className="scenario-grid">
          <div><strong>{money(health.metrics.averageMonthlySavings)}/mo</strong><span>Average household surplus</span></div>
          <div><strong>{plan.expectedAnnualReturnPct}%</strong><span>Constant annual investment-return assumption</span></div>
          <div><strong>{years} years</strong><span>Target age minus current-age assumption</span></div>
          <div><strong>Not modeled</strong><span>Taxes, inflation, pensions, Social Security, sequence risk</span></div>
        </div>
      </section>
    </div>
  );
}
