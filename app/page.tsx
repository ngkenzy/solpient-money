import {
  ArrowRight,
  BarChart3,
  Bell,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Gauge,
  Goal,
  Home,
  Landmark,
  LineChart,
  List,
  PiggyBank,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import {
  allocation,
  healthItems,
  netWorthSeries,
  transactions,
} from "@/lib/demo-data";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) < 1000 ? 2 : 0,
  }).format(value);
}

function SidebarItem({
  icon: Icon,
  label,
  active = false,
  badge,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button className={"side-item" + (active ? " active" : "")}>
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
      {badge ? <span className="side-badge">{badge}</span> : null}
    </button>
  );
}

function NetWorthChart() {
  const width = 760;
  const height = 180;
  const pad = 10;
  const min = Math.min(...netWorthSeries) - 30;
  const max = Math.max(...netWorthSeries) + 20;
  const points = netWorthSeries
    .map((value, index) => {
      const x = pad + (index / (netWorthSeries.length - 1)) * (width - pad * 2);
      const y = height - pad - ((value - min) / (max - min)) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const area = `${pad},${height - pad} ${points} ${width - pad},${height - pad}`;

  return (
    <div className="chart-wrap" aria-label="Demo net worth history chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <defs>
          <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1="10" x2="750" y1="45" y2="45" className="chart-grid" />
        <line x1="10" x2="750" y1="95" y2="95" className="chart-grid" />
        <line x1="10" x2="750" y1="145" y2="145" className="chart-grid" />
        <polygon points={area} fill="url(#netWorthFill)" />
        <polyline
          points={points}
          fill="none"
          stroke="#1769e0"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="chart-months">
        <span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span>
      </div>
    </div>
  );
}

function DonutChart() {
  let cursor = 0;
  const stops = allocation
    .map((item) => {
      const start = cursor;
      cursor += item.value;
      return `var(--${item.tone}) ${start}% ${cursor}%`;
    })
    .join(", ");

  return (
    <div className="donut" style={{ background: `conic-gradient(${stops})` }}>
      <div className="donut-hole">
        <strong>$930K</strong>
        <span>Total</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">SOLPIENT</div>
          <div className="brand-subtitle">YOUR FINANCIAL INTELLIGENCE</div>
        </div>

        <nav className="side-nav">
          <SidebarItem icon={Home} label="Overview" active />
          <SidebarItem icon={WalletCards} label="Accounts" />
          <SidebarItem icon={List} label="Transactions" />
          <SidebarItem icon={CircleDollarSign} label="Cash Flow" />

          <div className="nav-divider" />
          <div className="nav-label">INVEST</div>
          <SidebarItem icon={BriefcaseBusiness} label="Portfolio" />
          <SidebarItem icon={LineChart} label="Performance" />
          <SidebarItem icon={BarChart3} label="Allocation" />

          <div className="nav-divider" />
          <div className="nav-label">PLAN</div>
          <SidebarItem icon={PiggyBank} label="Retirement" />
          <SidebarItem icon={Goal} label="Goals" />
          <SidebarItem icon={CreditCard} label="Debt" />

          <div className="nav-divider" />
          <div className="nav-label">INTELLIGENCE</div>
          <SidebarItem icon={BrainCircuit} label="Insights" badge="3" />
          <SidebarItem icon={Building2} label="Research" />
        </nav>

        <div className="sidebar-footer">
          <div className="mountain-mark" />
          <p>A CLEARER<br />FINANCIAL FUTURE</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="product-switch">
            <span>Research</span>
            <span className="selected">Money</span>
          </div>

          <div className="top-actions">
            <div className="searchbox">
              <Search size={16} />
              <span>Search...</span>
            </div>
            <button className="icon-button" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <div className="profile">
              <span className="avatar">PN</span>
              <span>Phuoc Nguyen</span>
              <ChevronDown size={15} />
            </div>
          </div>
        </header>

        <div className="dashboard">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">SOLPIENT MONEY <span className="demo-pill">DEMO DATA</span></div>
              <h1>Good evening, Phuoc.</h1>
              <p>Here&apos;s your complete financial picture.</p>
            </div>
            <div className="asof">
              <strong>September 21, 2026</strong>
              <span>Last demo refresh · 4:00 PM ET</span>
            </div>
          </div>

          <div className="dashboard-grid">
            <section className="card networth-card">
              <div className="card-head">
                <div>
                  <span className="card-kicker">NET WORTH</span>
                  <div className="hero-value">$1,284,350</div>
                  <div className="positive-row">
                    <TrendingUp size={18} />
                    <strong>+8.4%</strong>
                    <span>+$99,420 year to date</span>
                  </div>
                </div>
                <div className="periods">
                  <button>1M</button><button>3M</button><button className="period-active">YTD</button><button>1Y</button><button>5Y</button><button>ALL</button>
                </div>
              </div>
              <NetWorthChart />
            </section>

            <section className="card intelligence-card">
              <div className="score-head">
                <div>
                  <span className="card-kicker">SOLPIENT INTELLIGENCE</span>
                  <h2>Financial health</h2>
                </div>
                <strong className="health-score">87 <span>/ 100</span></strong>
              </div>
              <div className="health-track"><div className="health-fill" /></div>
              <div className="health-list">
                {healthItems.map((item) => (
                  <div className="health-row" key={item.label}>
                    <span className={"health-icon " + item.level}>
                      {item.level === "good" ? <Check size={13} /> : <TriangleAlert size={13} />}
                    </span>
                    <span className="health-label">{item.label}</span>
                    <span className={"health-status " + item.level}>{item.status}</span>
                  </div>
                ))}
              </div>
              <button className="attention-button">
                <span>3 things need your attention</span>
                <ArrowRight size={17} />
              </button>
            </section>

            <section className="card mini-card">
              <div className="mini-head">
                <div>
                  <span className="card-kicker">ASSETS</span>
                  <h3>$1,402,350</h3>
                </div>
                <span className="mini-positive">+8.2% YTD</span>
              </div>
              <div className="stacked assets-stack">
                <span className="seg inv" /><span className="seg cash" /><span className="seg prop" />
              </div>
              <div className="legend-list">
                <div><span className="dot navy" />Investments <strong>$930,420</strong><em>66%</em></div>
                <div><span className="dot sky" />Cash <strong>$67,400</strong><em>5%</em></div>
                <div><span className="dot green" />Property <strong>$404,530</strong><em>29%</em></div>
              </div>
            </section>

            <section className="card mini-card">
              <div className="mini-head">
                <div>
                  <span className="card-kicker">LIABILITIES</span>
                  <h3>$118,000</h3>
                </div>
                <span className="mini-negative">-7.4% YTD</span>
              </div>
              <div className="stacked liability-stack">
                <span className="seg mortgage" /><span className="seg cards" />
              </div>
              <div className="legend-list">
                <div><span className="dot red" />Mortgage <strong>$108,000</strong><em>92%</em></div>
                <div><span className="dot rose" />Credit Cards <strong>$10,000</strong><em>8%</em></div>
              </div>
            </section>

            <section className="card transactions-card">
              <div className="section-title-row">
                <div>
                  <span className="card-kicker">RECENT ACTIVITY</span>
                  <h2>Transactions</h2>
                </div>
                <button className="text-button">View all <ArrowRight size={15} /></button>
              </div>
              <div className="transaction-list">
                {transactions.map((tx) => (
                  <div className="tx-row" key={tx.merchant}>
                    <span className={"tx-icon " + (tx.amount > 0 ? "income" : "")}>
                      {tx.amount > 0 ? <Landmark size={17} /> : <CreditCard size={17} />}
                    </span>
                    <div className="tx-main">
                      <strong>{tx.merchant}</strong>
                      <span>{tx.category}</span>
                    </div>
                    <div className="tx-right">
                      <strong className={tx.amount > 0 ? "income-text" : ""}>{tx.amount > 0 ? "+" : ""}{money(tx.amount)}</strong>
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
                <span className="small-muted">Demo household</span>
              </div>
              <div className="flow-row"><span>Income</span><strong>$14,250</strong></div>
              <div className="flow-bar"><span className="income-bar" /></div>
              <div className="flow-row"><span>Spending</span><strong>$8,140</strong></div>
              <div className="flow-bar"><span className="spend-bar" /></div>
              <div className="cash-summary">
                <div><span>Saved</span><strong>$6,110</strong></div>
                <div><span>Savings rate</span><strong>43%</strong></div>
              </div>
            </section>

            <section className="card investments-card">
              <div className="section-title-row">
                <div>
                  <span className="card-kicker">INVESTMENTS</span>
                  <h2>$930,420</h2>
                </div>
                <span className="mini-positive">+12.4% YTD</span>
              </div>
              <div className="investment-body">
                <DonutChart />
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
              <button className="text-button portfolio-link">View portfolio <ArrowRight size={15} /></button>
            </section>

            <section className="card research-card">
              <div className="research-icon"><ShieldCheck size={21} /></div>
              <div>
                <span className="card-kicker">SOLPIENT RESEARCH</span>
                <h2>Portfolio research coverage</h2>
                <p>Three demo holdings have new research updates. Money will eventually read valuation, thesis health, risk, and evidence directly from Solpient Research.</p>
              </div>
              <button className="research-button">Review updates <ArrowRight size={16} /></button>
            </section>
          </div>

          <section className="askbar">
            <span className="ask-icon"><Sparkles size={19} /></span>
            <div className="ask-copy">
              <strong>Ask Solpient about your finances...</strong>
              <span>Financial calculations stay deterministic; AI explains the results.</span>
            </div>
            <div className="ask-prompts">
              <button>Can I retire at 50?</button>
              <button>Why did my net worth change?</button>
              <button>How concentrated is my portfolio?</button>
            </div>
            <button className="ask-send" aria-label="Open Solpient Intelligence"><ArrowRight size={18} /></button>
          </section>

          <div className="bottom-note">
            <Gauge size={15} />
            <span>V0.1 uses deterministic demo data only. No bank credentials or live financial accounts are connected.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
