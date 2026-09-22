import InteractiveLineChart from "@/components/InteractiveLineChart";
import PageHeader from "@/components/PageHeader";
import { getFinancialSummary, money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

export default async function CashFlowPage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const summary = getFinancialSummary(data);
  const latest = data.monthlyCashFlow.at(-1) ?? { label: "Current", income: 0, spending: 0 };
  const saved = latest.income - latest.spending;
  const rate = latest.income > 0 ? (saved / latest.income) * 100 : 0;

  return (
    <div className="page">
      <PageHeader
        eyebrow="CASH FLOW"
        title="Income, spending, and savings."
        description="Cash flow is derived from the current MoneyDataset so the same analysis works with demo rows or authenticated persisted transactions."
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>{latest.label} income</span><strong>{money(latest.income)}</strong><small>Derived from transactions</small></div>
        <div className="metric-card"><span>{latest.label} spending</span><strong>{money(latest.spending)}</strong><small>Derived from expense transactions</small></div>
        <div className="metric-card"><span>{latest.label} saved</span><strong>{money(saved)}</strong><small>Income minus spending</small></div>
        <div className="metric-card"><span>Latest savings rate</span><strong>{rate.toFixed(0)}%</strong><small>All visible transactions: {summary.savingsRate.toFixed(0)}%</small></div>
      </div>

      <section className="card page-card">
        <div className="section-title-row"><div><span className="card-kicker">RECENT TREND</span><h2>Income vs spending</h2></div></div>
        <InteractiveLineChart
          data={data.monthlyCashFlow}
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
