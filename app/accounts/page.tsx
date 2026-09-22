import Link from "next/link";
import { ArrowRight, ArrowUpRight, Landmark, WalletCards } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { accounts } from "@/lib/demo-data";
import { getFinancialSummary, money } from "@/lib/finance";
import { getFinancialHealth } from "@/lib/intelligence";

const groups = [
  { type: "cash", label: "Cash" },
  { type: "investment", label: "Brokerage" },
  { type: "retirement", label: "Retirement" },
  { type: "property", label: "Property" },
  { type: "debt", label: "Liabilities" },
] as const;

export default function AccountsPage() {
  const summary = getFinancialSummary();
  const health = getFinancialHealth();
  const m = health.metrics;

  return (
    <div className="page">
      <PageHeader
        eyebrow="ACCOUNTS"
        title="The household balance sheet."
        description="A consolidated synthetic view of what the household owns, owes, and can access quickly. Live aggregation comes later through the dedicated Money data layer."
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Net worth</span><strong>{money(summary.netWorth)}</strong><small>Assets minus liabilities</small></div>
        <div className="metric-card"><span>Invested assets</span><strong>{money(m.investments)}</strong><small>Across demo holdings</small></div>
        <div className="metric-card"><span>Property</span><strong>{money(m.propertyValue)}</strong><small>Manual demo asset</small></div>
        <div className="metric-card"><span>Liabilities</span><strong>{money(summary.liabilities)}</strong><small>{m.debtToAssetsPct.toFixed(1)}% of assets</small></div>
      </div>

      <div className="balance-intelligence-grid">
        <section className="card page-card balance-sheet-card">
          <div className="section-title-row">
            <div><span className="card-kicker">BALANCE SHEET</span><h2>Where net worth sits</h2></div>
          </div>
          <div className="balance-sheet-list">
            <div><span>Investments</span><strong>{money(m.investments)}</strong><div><i style={{ width: `${Math.min(100, m.investments / m.assets * 100)}%` }} /></div></div>
            <div><span>Property</span><strong>{money(m.propertyValue)}</strong><div><i style={{ width: `${Math.min(100, m.propertyValue / m.assets * 100)}%` }} /></div></div>
            <div><span>Bank cash</span><strong>{money(m.bankCash)}</strong><div><i style={{ width: `${Math.min(100, m.bankCash / m.assets * 100)}%` }} /></div></div>
            <div className="liability"><span>Liabilities</span><strong>-{money(m.liabilities)}</strong><div><i style={{ width: `${Math.min(100, m.liabilities / m.assets * 100)}%` }} /></div></div>
          </div>
        </section>

        <section className="card page-card cash-intelligence-card">
          <div className="section-title-row">
            <div><span className="card-kicker">CASH INTELLIGENCE</span><h2>{m.emergencyFundMonths.toFixed(1)} months of spending</h2></div>
          </div>
          <div className="cash-intelligence-numbers">
            <div><span>Bank cash</span><strong>{money(m.bankCash)}</strong></div>
            <div><span>Demo reserve target</span><strong>{money(m.reserveTarget)}</strong></div>
            <div><span>Above target</span><strong>{money(m.excessBankCash)}</strong></div>
          </div>
          <p>Cash above the reserve target is not automatically “excess.” It may belong to near-term spending, goals, debt, or investing. Solpient surfaces the amount so the household can decide its purpose.</p>
          <Link className="research-button" href="/scenario-lab">Test cash scenarios <ArrowRight size={15} /></Link>
        </section>
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
