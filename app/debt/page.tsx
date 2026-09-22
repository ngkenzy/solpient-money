import Link from "next/link";
import { ArrowRight, CircleDollarSign } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getDebtPriority, getFinancialHealth } from "@/lib/intelligence";
import { money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

export default async function DebtPage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const debts = getDebtPriority(data);
  const health = getFinancialHealth({}, data);
  const total = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const annualizedInterest = debts.reduce((sum, debt) => sum + debt.annualizedInterest, 0);

  return (
    <div className="page">
      <PageHeader
        eyebrow="DEBT"
        title="Know the cost, not just the balance."
        description="APR-aware household debt intelligence. The ordering shows a highest-APR-first calculation, not a personalized instruction."
        action={<Link className="research-button" href="/scenario-lab">Open Scenario Lab <ArrowRight size={15} /></Link>}
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Total debt</span><strong>{money(total)}</strong><small>{debts.length} tracked liabilities</small></div>
        <div className="metric-card"><span>Annualized interest</span><strong>{money(annualizedInterest)}</strong><small>If balances stayed unchanged for a year</small></div>
        <div className="metric-card"><span>High-interest debt</span><strong>{money(health.metrics.highInterestDebt)}</strong><small>APR ≥ {data.householdPlan.highInterestDebtAprPct}% review line</small></div>
        <div className="metric-card"><span>Debt / assets</span><strong>{health.metrics.debtToAssetsPct.toFixed(1)}%</strong><small>Current balance sheet</small></div>
      </div>

      <section className="card page-card debt-priority-card">
        <div className="section-title-row"><div><span className="card-kicker">PAYOFF ANALYSIS</span><h2>Highest-APR-first sequence</h2></div><span className="small-muted">Interest-cost lens only</span></div>
        <div className="debt-priority-list">
          {debts.map((debt, index) => (
            <div className="debt-priority-row" key={debt.id}>
              <span className="debt-rank">{index + 1}</span>
              <span className="debt-icon"><CircleDollarSign size={18} /></span>
              <div className="debt-name"><strong>{debt.name}</strong><span>{debt.apr.toFixed(2)}% APR · minimum {money(debt.minimumPayment)}/mo</span></div>
              <div><span>Balance</span><strong>{money(debt.balance)}</strong></div>
              <div><span>Annualized interest</span><strong>{money(debt.annualizedInterest)}</strong></div>
            </div>
          ))}
        </div>
        <div className="formula-note"><strong>Why this order?</strong><span>Balances are sorted by APR descending. The Scenario Lab applies required payments first, then sends extra payment to the highest APR remaining balance.</span></div>
      </section>

      <section className="card page-card">
        <div className="section-title-row"><div><span className="card-kicker">EXPLAINABILITY</span><h2>Debt health calculation</h2></div></div>
        {health.components.filter((component) => component.key === "debt").map((component) => (
          <div className="debt-explain" key={component.key}>
            <strong>{component.score.toFixed(0)} / {component.maxScore}</strong>
            <div><p>{component.detail}</p><span>{component.calculation}</span><ul>{component.inputs.map((input) => <li key={input}>{input}</li>)}</ul></div>
          </div>
        ))}
      </section>
    </div>
  );
}
