import InteractiveLineChart from "@/components/InteractiveLineChart";
import PageHeader from "@/components/PageHeader";
import { monthlyCashFlow } from "@/lib/demo-data";
import { getFinancialSummary, money } from "@/lib/finance";

export default function CashFlowPage() {
  const summary = getFinancialSummary();

  return (
    <div className="page">
      <PageHeader
        eyebrow="CASH FLOW"
        title="Income, spending, and savings."
        description="A deterministic household cash-flow view designed to explain the trend before adding bank synchronization."
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>September income</span><strong>{money(16800)}</strong><small>Illustrative monthly total</small></div>
        <div className="metric-card"><span>September spending</span><strong>{money(9200)}</strong><small>Illustrative monthly total</small></div>
        <div className="metric-card"><span>September saved</span><strong>{money(7600)}</strong><small>Income minus spending</small></div>
        <div className="metric-card"><span>Current filtered rate</span><strong>{summary.savingsRate.toFixed(0)}%</strong><small>Based on demo transaction set</small></div>
      </div>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">SIX-MONTH TREND</span><h2>Income vs spending</h2></div>
        </div>
        <InteractiveLineChart
          data={monthlyCashFlow}
          series={[
            { key: "income", label: "Income", format: "currency" },
            { key: "spending", label: "Spending", format: "currency" },
          ]}
          defaultRange="ALL"
          height={260}
        />
      </section>
    </div>
  );
}
