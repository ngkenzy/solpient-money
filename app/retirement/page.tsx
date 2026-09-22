import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { householdPlan } from "@/lib/demo-data";
import { money } from "@/lib/finance";
import { getFinancialHealth } from "@/lib/intelligence";

function futureValue(principal: number, monthlyContribution: number, annualReturnPct: number, months: number) {
  const monthlyRate = annualReturnPct / 100 / 12;
  if (months <= 0) return principal;
  const growth = Math.pow(1 + monthlyRate, months);
  return principal * growth + monthlyContribution * ((growth - 1) / monthlyRate);
}

export default function RetirementPage() {
  const health = getFinancialHealth();
  const years = householdPlan.targetRetirementAge - householdPlan.demoCurrentAge;
  const projected = futureValue(
    health.metrics.investments,
    health.metrics.averageMonthlySavings,
    householdPlan.expectedAnnualReturnPct,
    years * 12
  );
  const funding = Math.min(100, projected / householdPlan.targetRetirementAssets * 100);

  return (
    <div className="page">
      <PageHeader
        eyebrow="RETIREMENT"
        title="Plan with scenarios, not one magic number."
        description="V0.4 replaces the old hard-coded projection with a deterministic baseline using the shared demo portfolio, six-month average savings, and an explicit return assumption."
        action={<Link className="research-button" href="/scenario-lab">Open Scenario Lab <ArrowRight size={15} /></Link>}
      />
      <div className="metric-grid four">
        <div className="metric-card"><span>Invested assets</span><strong>{money(health.metrics.investments)}</strong><small>Current demo portfolio</small></div>
        <div className="metric-card"><span>Baseline projection</span><strong>{money(projected)}</strong><small>{years} years at {householdPlan.expectedAnnualReturnPct}% demo return</small></div>
        <div className="metric-card"><span>Demo target funding</span><strong>{funding.toFixed(0)}%</strong><small>Against {money(householdPlan.targetRetirementAssets)}</small></div>
        <div className="metric-card"><span>Target age</span><strong>{householdPlan.targetRetirementAge}</strong><small>Synthetic current age {householdPlan.demoCurrentAge}</small></div>
      </div>
      <section className="card page-card">
        <div className="section-title-row"><div><span className="card-kicker">BASELINE ASSUMPTIONS</span><h2>Visible instead of hidden</h2></div></div>
        <div className="scenario-grid">
          <div><strong>{money(health.metrics.averageMonthlySavings)}/mo</strong><span>Six-month average household surplus</span></div>
          <div><strong>{householdPlan.expectedAnnualReturnPct}%</strong><span>Constant annual demo investment return</span></div>
          <div><strong>{years} years</strong><span>Target age minus synthetic current age</span></div>
          <div><strong>Not modeled</strong><span>Taxes, inflation, pensions, Social Security, sequence risk</span></div>
        </div>
      </section>
    </div>
  );
}
