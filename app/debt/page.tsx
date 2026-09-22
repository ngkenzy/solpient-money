import PageHeader from "@/components/PageHeader";
import { accounts } from "@/lib/demo-data";
import { money } from "@/lib/finance";

export default function DebtPage() {
  const debts = accounts.filter((account) => account.type === "debt");
  const total = Math.abs(debts.reduce((sum, account) => sum + account.balance, 0));

  return (
    <div className="page">
      <PageHeader
        eyebrow="DEBT"
        title="Track what you owe and how fast it is falling."
        description="A simple liability view now; payoff sequencing and interest-cost modeling can be added after account synchronization."
      />
      <div className="metric-grid four">
        <div className="metric-card"><span>Total debt</span><strong>{money(total)}</strong><small>Demo liabilities</small></div>
        <div className="metric-card"><span>Debt accounts</span><strong>{debts.length}</strong><small>Across the household</small></div>
        <div className="metric-card"><span>Largest balance</span><strong>{money(Math.max(...debts.map((d) => Math.abs(d.balance))))}</strong><small>Mortgage</small></div>
        <div className="metric-card"><span>Status</span><strong>Declining</strong><small>All demo balances below start of year</small></div>
      </div>
      <section className="card page-card">
        <div className="data-table debt-table">
          <div className="table-row table-head-row"><span>Account</span><span>Institution</span><span>Balance</span><span>YTD balance change</span></div>
          {debts.map((debt) => (
            <div className="table-row" key={debt.id}>
              <strong>{debt.name}</strong>
              <span>{debt.institution}</span>
              <strong>{money(Math.abs(debt.balance))}</strong>
              <span className="positive-text">{debt.changeYtd.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
