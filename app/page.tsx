import Link from "next/link";
import {
  ArrowRight,
  Check,
  CreditCard,
  Gauge,
  Landmark,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import AllocationDonut from "@/components/AllocationDonut";
import InteractiveLineChart from "@/components/InteractiveLineChart";
import { allocation, dataAsOf, demoRefresh, holdings, netWorthSeries, transactions } from "@/lib/demo-data";
import { getFinancialSummary, getPortfolioInsights, getPortfolioMetrics, money } from "@/lib/finance";
import { loadResearchSnapshots, summarizeResearchCoverage } from "@/lib/research";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const summary = getFinancialSummary();
  const portfolio = getPortfolioMetrics();
  const directTickers = holdings.filter((holding) => holding.kind === "stock").map((holding) => holding.ticker);
  const research = await loadResearchSnapshots(directTickers);
  const researchSummary = summarizeResearchCoverage(holdings, research.snapshots);
  const insights = getPortfolioInsights(research.snapshots);
  const recent = transactions.slice(0, 5);
  const healthScore = 87;

  return (
    <div className="dashboard">
      <div className="welcome-row">
        <div>
          <div className="eyebrow">SOLPIENT MONEY <span className="demo-pill">DEMO MONEY DATA</span></div>
          <h1>Good evening, Phuoc.</h1>
          <p>Your household data is demo-only. Research intelligence is live from Solpient Research.</p>
        </div>
        <div className="asof">
          <strong>{dataAsOf}</strong>
          <span>Money refresh · {demoRefresh}</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="card networth-card">
          <div className="card-head">
            <div>
              <span className="card-kicker">NET WORTH</span>
              <div className="hero-value">{money(summary.netWorth)}</div>
              <div className="positive-row">
                <TrendingUp size={18} />
                <strong>+12.7%</strong>
                <span>illustrative year to date</span>
              </div>
            </div>
          </div>
          <InteractiveLineChart
            data={netWorthSeries}
            series={[{ key: "value", label: "Net worth", format: "currency" }]}
          />
        </section>

        <section className="card intelligence-card">
          <div className="score-head">
            <div>
              <span className="card-kicker">SOLPIENT INTELLIGENCE</span>
              <h2>Financial health</h2>
            </div>
            <strong className="health-score">{healthScore} <span>/ 100</span></strong>
          </div>
          <div className="health-track"><div className="health-fill" style={{ width: `${healthScore}%` }} /></div>
          <div className="health-list">
            {insights.slice(0, 4).map((item) => (
              <div className="health-row" key={item.title}>
                <span className={"health-icon " + (item.level === "good" ? "good" : "warn")}>
                  {item.level === "good" ? <Check size={13} /> : <TriangleAlert size={13} />}
                </span>
                <span className="health-label">{item.title}</span>
                <span className={"health-status " + (item.level === "good" ? "good" : "warn")}>
                  {item.level === "good" ? "Healthy" : "Review"}
                </span>
              </div>
            ))}
          </div>
          <Link className="attention-button" href="/insights">
            <span>Review portfolio intelligence</span>
            <ArrowRight size={17} />
          </Link>
        </section>

        <section className="card mini-card">
          <div className="mini-head">
            <div>
              <span className="card-kicker">ASSETS</span>
              <h3>{money(summary.assets)}</h3>
            </div>
            <span className="mini-positive">Demo household</span>
          </div>
          <div className="stacked assets-stack">
            <span className="seg inv" /><span className="seg cash" /><span className="seg prop" />
          </div>
          <div className="legend-list">
            <div><span className="dot navy" />Investments <strong>{money(summary.investments)}</strong><em>{Math.round(summary.investments / summary.assets * 100)}%</em></div>
            <div><span className="dot sky" />Cash <strong>{money(summary.cash)}</strong><em>{Math.round(summary.cash / summary.assets * 100)}%</em></div>
            <div><span className="dot green" />Property <strong>{money(485000)}</strong><em>{Math.round(485000 / summary.assets * 100)}%</em></div>
          </div>
        </section>

        <section className="card mini-card">
          <div className="mini-head">
            <div>
              <span className="card-kicker">LIABILITIES</span>
              <h3>{money(summary.liabilities)}</h3>
            </div>
            <span className="mini-negative">Debt declining</span>
          </div>
          <div className="stacked liability-stack">
            <span className="seg mortgage" /><span className="seg cards" />
          </div>
          <div className="legend-list">
            <div><span className="dot red" />Mortgage <strong>{money(142000)}</strong><em>85%</em></div>
            <div><span className="dot rose" />Other debt <strong>{money(25500)}</strong><em>15%</em></div>
          </div>
        </section>

        <section className="card transactions-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">RECENT ACTIVITY</span>
              <h2>Transactions</h2>
            </div>
            <Link className="text-button" href="/transactions">View all <ArrowRight size={15} /></Link>
          </div>
          <div className="transaction-list">
            {recent.map((tx) => (
              <div className="tx-row" key={tx.id}>
                <span className={"tx-icon " + (tx.amount > 0 ? "income" : "")}>
                  {tx.amount > 0 ? <Landmark size={17} /> : <CreditCard size={17} />}
                </span>
                <div className="tx-main">
                  <strong>{tx.merchant}</strong>
                  <span>{tx.category}</span>
                </div>
                <div className="tx-right">
                  <strong className={tx.amount > 0 ? "income-text" : ""}>
                    {tx.amount > 0 ? "+" : ""}{money(tx.amount, true)}
                  </strong>
                  <span>{tx.date}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card cashflow-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">CASH FLOW</span>
              <h2>September</h2>
            </div>
            <Link className="text-button" href="/cash-flow">Details <ArrowRight size={15} /></Link>
          </div>
          <div className="flow-row"><span>Income</span><strong>{money(summary.income)}</strong></div>
          <div className="flow-bar"><span className="income-bar" /></div>
          <div className="flow-row"><span>Spending</span><strong>{money(summary.spending)}</strong></div>
          <div className="flow-bar"><span className="spend-bar" /></div>
          <div className="cash-summary">
            <div><span>Saved</span><strong>{money(summary.savings)}</strong></div>
            <div><span>Savings rate</span><strong>{summary.savingsRate.toFixed(0)}%</strong></div>
          </div>
        </section>

        <section className="card investments-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">INVESTMENTS</span>
              <h2>{money(portfolio.total)}</h2>
            </div>
            <span className="mini-positive">+12.4% YTD</span>
          </div>
          <div className="investment-body">
            <AllocationDonut items={allocation} totalLabel={money(portfolio.total / 1000) + "K"} />
            <div className="allocation-list">
              {allocation.map((item) => (
                <div key={item.label}>
                  <span className={"dot " + item.tone} />
                  <span>{item.label}</span>
                  <strong>{item.value}%</strong>
                </div>
              ))}
            </div>
          </div>
          <Link className="text-button portfolio-link" href="/portfolio">View portfolio <ArrowRight size={15} /></Link>
        </section>

        <section className="card research-card live-research-card">
          <div className="research-icon"><ShieldCheck size={21} /></div>
          <div>
            <div className="research-live-line">
              <span className="card-kicker">SOLPIENT RESEARCH</span>
              <span className={"live-pill " + (research.connected ? "connected" : "disconnected")}>
                {research.connected ? "LIVE" : "UNAVAILABLE"}
              </span>
            </div>
            <h2>{researchSummary.coveragePct.toFixed(0)}% direct-stock value covered</h2>
            <p>
              {research.connected
                ? `${researchSummary.coveredCount} of ${researchSummary.totalDirectStockCount} direct-stock holdings match a latest published Research package. Weighted live Research score: ${researchSummary.weightedScore?.toFixed(0) ?? "—"}; evidence confidence: ${researchSummary.weightedEvidenceConfidence?.toFixed(0) ?? "—"}.`
                : "The live Research contract could not be reached. Money will not substitute synthetic Research values."}
            </p>
          </div>
          <Link className="research-button" href="/research">Open Research feed <ArrowRight size={16} /></Link>
        </section>
      </div>

      <section className="askbar">
        <span className="ask-icon"><Sparkles size={19} /></span>
        <div className="ask-copy">
          <strong>Ask Solpient about your finances...</strong>
          <span>Financial calculations stay deterministic; Research facts now come from the live published Research system.</span>
        </div>
        <div className="ask-prompts">
          <Link href="/retirement">Can I retire at 50?</Link>
          <Link href="/insights">What deserves attention?</Link>
          <Link href="/portfolio">How concentrated is my portfolio?</Link>
        </div>
        <Link className="ask-send" aria-label="Open Solpient Intelligence" href="/insights"><ArrowRight size={18} /></Link>
      </section>

      <div className="bottom-note">
        <Gauge size={15} />
        <span>Money account balances remain deterministic demo data. Solpient Research fields are live read-only data from the published Research system.</span>
      </div>
    </div>
  );
}
