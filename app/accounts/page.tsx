import { ArrowUpRight, Landmark, WalletCards } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { accounts } from "@/lib/demo-data";
import { getFinancialSummary, money } from "@/lib/finance";

const groups = [
  { type: "cash", label: "Cash" },
  { type: "investment", label: "Brokerage" },
  { type: "retirement", label: "Retirement" },
  { type: "property", label: "Property" },
  { type: "debt", label: "Liabilities" },
] as const;

export default function AccountsPage() {
  const summary = getFinancialSummary();

  return (
    <div className="page">
      <PageHeader
        eyebrow="ACCOUNTS"
        title="Everything in one place."
        description="A consolidated demo view of assets and liabilities. Live aggregation comes later through a dedicated Money data layer."
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Net worth</span><strong>{money(summary.netWorth)}</strong><small>Assets minus liabilities</small></div>
        <div className="metric-card"><span>Total assets</span><strong>{money(summary.assets)}</strong><small>Across demo accounts</small></div>
        <div className="metric-card"><span>Liabilities</span><strong>{money(summary.liabilities)}</strong><small>Outstanding balances</small></div>
        <div className="metric-card"><span>Cash</span><strong>{money(summary.cash)}</strong><small>Liquid demo balances</small></div>
      </div>

      <div className="account-groups">
        {groups.map((group) => {
          const items = accounts.filter((account) => account.type === group.type);
          const total = items.reduce((sum, account) => sum + account.balance, 0);
          if (!items.length) return null;
          return (
            <section className="card account-group" key={group.type}>
              <div className="section-title-row">
                <div>
                  <span className="card-kicker">{group.label.toUpperCase()}</span>
                  <h2>{money(Math.abs(total))}</h2>
                </div>
                <span className="account-count">{items.length} account{items.length === 1 ? "" : "s"}</span>
              </div>
              <div className="account-list">
                {items.map((account) => (
                  <div className="account-row" key={account.id}>
                    <span className="account-icon">{account.type === "cash" ? <Landmark size={18} /> : <WalletCards size={18} />}</span>
                    <div className="account-main">
                      <strong>{account.name}</strong>
                      <span>{account.institution} · •••• {account.lastFour}</span>
                    </div>
                    <span className="account-owner">{account.owner}</span>
                    <div className="account-balance">
                      <strong>{money(Math.abs(account.balance))}</strong>
                      <span className={account.changeYtd >= 0 ? "positive-text" : "negative-text"}>
                        {account.changeYtd >= 0 ? "+" : ""}{account.changeYtd.toFixed(1)}% YTD
                      </span>
                    </div>
                    <ArrowUpRight size={16} className="row-arrow" />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
