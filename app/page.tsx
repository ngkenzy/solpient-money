import Link from "next/link";
import {
  ArrowRight,
  Check,
  CreditCard,
  Gauge,
  Landmark,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Upload,
} from "lucide-react";
import AllocationDonut from "@/components/AllocationDonut";
import EmptyState from "@/components/EmptyState";
import InteractiveLineChart from "@/components/InteractiveLineChart";
import { getCashFlowIntelligence } from "@/lib/cash-flow-intelligence";
import { dataAsOf, demoRefresh } from "@/lib/demo-data";
import { getFinancialSummary, getPortfolioMetrics, money } from "@/lib/finance";
import { getFinancialHealth } from "@/lib/intelligence";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const summary = getFinancialSummary(data);
  const portfolio = getPortfolioMetrics(data);
  const health = getFinancialHealth(data);
  const cashIntel = await getCashFlowIntelligence();
  const spendingAlerts = cashIntel.alerts.slice(0, 4);
  const recent = data.transactions.slice(0, 5);
  const latestCashFlow = data.monthlyCashFlow.at(-1) ?? { label: "Current", income: 0, spending: 0 };
  const latestSaved = latestCashFlow.income - latestCashFlow.spending;
  const latestSavingsRate = latestCashFlow.income > 0 ? (latestSaved / latestCashFlow.income) * 100 : 0;
  const debtAccounts = data.accounts
    .filter((account) => account.type === "debt")
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  const primaryDebt = debtAccounts[0];
  const otherDebt = debtAccounts.slice(1).reduce((sum, account) => sum + Math.abs(account.balance), 0);
  const healthScore = health.score;
  const healthMax = health.components.reduce((sum, item) => sum + item.maxScore, 0);
  const persistent = context.source === "database";

  return (
    <div className="dashboard">
      <div className="welcome-row">
        <div>
          <div className="eyebrow">
            SOLPIENT MONEY
            <span className={"demo-pill " + (persistent ? "persistent" : "")}>
              {persistent ? "DATABASE" : "DEMO DATA"}
            </span>
          </div>
          <h1>{persistent ? context.household?.name ?? "Your household" : "Good evening, Phuoc."}</h1>
          <p>
            {persistent
              ? "Household financial data is private and persistent."
              : "Household data is demo-only until the local Money database is connected."}
          </p>
        </div>
        <div className="asof">
          <strong>{persistent ? "Authenticated household" : dataAsOf}</strong>
          <span>{persistent ? "Private local database" : `Money refresh · ${demoRefresh}`}</span>
        </div>
      </div>

      {!data.accounts.length && !data.holdings.length && !data.transactions.length ? (
        <EmptyState
          icon={Upload}
          title="Welcome to Solpient Money"
          copy="Import your first bank or brokerage file and this dashboard comes alive — net worth, cash flow, budgets, and investments."
          actionHref="/connect"
          actionLabel="Import your first file"
        />
      ) : null}

      <div className="dashboard-grid">
        <section className="card networth-card">
          <div className="card-head">
            <div>
              <span className="card-kicker">NET WORTH</span>
              <div className="hero-value">{money(summary.netWorth)}</div>
              <div className="positive-row">
                <TrendingUp size={18} />
                <strong>{persistent ? "Persistent" : "+12.7%"}</strong>
                <span>{persistent ? "household balance sheet" : "illustrative year to date"}</span>
              </div>
            </div>
          </div>
          <InteractiveLineChart
            data={data.netWorthSeries}
            series={[{ key: "value", label: "Net worth", format: "currency" }]}
          />
        </section>

        <section className="card intelligence-card">
          <div className="score-head">
            <div>
              <span className="card-kicker">SOLPIENT INTELLIGENCE</span>
              <h2>Financial health</h2>
            </div>
            <strong className="health-score">{healthScore} <span>/ {healthMax}</span></strong>
          </div>
          <div className="health-track"><div className="health-fill" style={{ width: `${healthMax ? (healthScore / healthMax) * 100 : 0}%` }} /></div>
          <div className="health-list">
            {health.components.slice(0, 4).map((item) => (
              <div className="health-row" key={item.key}>
                <span className={"health-icon " + (item.status === "healthy" ? "good" : "warn")}>
                  {item.status === "healthy" ? <Check size={13} /> : <TriangleAlert size={13} />}
                </span>
                <span className="health-label">{item.label}</span>
                <span className={"health-status " + (item.status === "healthy" ? "good" : "warn")}>
                  {item.status === "healthy" ? "Healthy" : "Review"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card mini-card">
          <div className="mini-head">
            <div><span className="card-kicker">ASSETS</span><h3>{money(summary.assets)}</h3></div>
            <span className="mini-positive">{persistent ? "Persisted" : "Demo household"}</span>
          </div>
          <div className="stacked assets-stack">
            <span className="seg inv" /><span className="seg cash" /><span className="seg prop" />
          </div>
          <div className="legend-list">
            <div><span className="dot navy" />Investments <strong>{money(summary.investments)}</strong><em>{summary.assets ? Math.round(summary.investments / summary.assets * 100) : 0}%</em></div>
            <div><span className="dot sky" />Cash <strong>{money(summary.cash)}</strong><em>{summary.assets ? Math.round(summary.cash / summary.assets * 100) : 0}%</em></div>
            <div><span className="dot green" />Property <strong>{money(health.metrics.propertyValue)}</strong><em>{summary.assets ? Math.round(health.metrics.propertyValue / summary.assets * 100) : 0}%</em></div>
          </div>
        </section>

        <section className="card mini-card">
          <div className="mini-head">
            <div><span className="card-kicker">LIABILITIES</span><h3>{money(summary.liabilities)}</h3></div>
            <span className="mini-negative">{debtAccounts.length} debt account{debtAccounts.length === 1 ? "" : "s"}</span>
          </div>
          <div className="stacked liability-stack">
            <span className="seg mortgage" /><span className="seg cards" />
          </div>
          <div className="legend-list">
            <div><span className="dot red" />{primaryDebt?.name ?? "Debt"} <strong>{money(Math.abs(primaryDebt?.balance ?? 0))}</strong><em>{summary.liabilities ? Math.round(Math.abs(primaryDebt?.balance ?? 0) / summary.liabilities * 100) : 0}%</em></div>
            <div><span className="dot rose" />Other debt <strong>{money(otherDebt)}</strong><em>{summary.liabilities ? Math.round(otherDebt / summary.liabilities * 100) : 0}%</em></div>
          </div>
        </section>

        <section className="card transactions-card">
          <div className="section-title-row">
            <div><span className="card-kicker">RECENT ACTIVITY</span><h2>Transactions</h2></div>
            <Link className="text-button" href="/transactions">View all <ArrowRight size={15} /></Link>
          </div>
          <div className="transaction-list">
            {recent.map((tx) => (
              <div className="tx-row" key={tx.id}>
                <span className={"tx-icon " + (tx.amount > 0 ? "income" : "")}>
                  {tx.amount > 0 ? <Landmark size={17} /> : <CreditCard size={17} />}
                </span>
                <div className="tx-main"><strong>{tx.merchant}</strong><span>{tx.category}</span></div>
                <div className="tx-right">
                  <strong className={tx.amount > 0 ? "income-text" : ""}>{tx.amount > 0 ? "+" : ""}{money(tx.amount, true)}</strong>
                  <span>{tx.date}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card cashflow-card">
          <div className="section-title-row">
            <div><span className="card-kicker">CASH FLOW</span><h2>{latestCashFlow.label}</h2></div>
            <Link className="text-button" href="/cash-flow">Details <ArrowRight size={15} /></Link>
          </div>
          <div className="flow-row"><span>Income</span><strong>{money(latestCashFlow.income)}</strong></div>
          <div className="flow-bar"><span className="income-bar" /></div>
          <div className="flow-row"><span>Spending</span><strong>{money(latestCashFlow.spending)}</strong></div>
          <div className="flow-bar"><span className="spend-bar" /></div>
          <div className="cash-summary">
            <div><span>Saved</span><strong>{money(latestSaved)}</strong></div>
            <div><span>Savings rate</span><strong>{latestSavingsRate.toFixed(0)}%</strong></div>
          </div>
        </section>

        <section className="card investments-card">
          <div className="section-title-row">
            <div><span className="card-kicker">INVESTMENTS</span><h2>{money(portfolio.total)}</h2></div>
            <span className="mini-positive">{data.holdings.length} holdings</span>
          </div>
          <div className="investment-body">
            <AllocationDonut items={data.allocation} totalLabel={money(portfolio.total / 1000) + "K"} />
            <div className="allocation-list">
              {data.allocation.map((item) => (
                <div key={item.label}><span className={"dot " + item.tone} /><span>{item.label}</span><strong>{item.value}%</strong></div>
              ))}
            </div>
          </div>
          <Link className="text-button portfolio-link" href="/portfolio">View portfolio <ArrowRight size={15} /></Link>
        </section>

      </div>

      <section className="card homepage-attention">
        <div className="section-title-row">
          <div><span className="card-kicker">WORTH A LOOK</span><h2>Spending alerts</h2></div>
          <Link className="text-button" href="/cash-flow">Details <ArrowRight size={15} /></Link>
        </div>
        {spendingAlerts.length ? (
          <div className="cash-alert-list">
            {spendingAlerts.map((alert) => (
              <div className={`cash-alert-row ${alert.level}`} key={alert.id}>
                <span className="cash-alert-icon">
                  <TriangleAlert size={15} />
                </span>
                <div>
                  <strong>{alert.title}</strong>
                  <span>
                    {alert.detail}
                    {alert.date ? ` · ${alert.date}` : ""}
                  </span>
                </div>
                <strong>{money(alert.amount)} above baseline</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="cash-empty roomy">
            <ShieldCheck size={29} />
            <strong>No unusual spending signals</strong>
            <span>
              Solpient compared recent category and merchant spending with your own history.
            </span>
          </div>
        )}
      </section>

      <div className="bottom-note">
        <Gauge size={15} />
        <span>{persistent ? "Household data is persistent in PostgreSQL on this Mac." : "Money is in demo mode until local PostgreSQL is initialized."}</span>
      </div>
    </div>
  );
}
