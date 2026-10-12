import Link from "next/link";
import {
  Activity, ArrowRight, BookOpen, CheckCircle2, CircleAlert,
  Clock3, Database, ExternalLink, GitPullRequest, Landmark,
  LockKeyhole, ShieldAlert, TrendingDown,
} from "lucide-react";
import { money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";
import { buildFundOverview } from "@/lib/fund-overview";
import { getFundResearchFeed } from "@/lib/fund-research";
import "./fund.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Fund Command Center",
  description: "Private portfolio oversight and investment research",
};

const REPO = "https://github.com/ngkenzy/personal-hedge-fund";
const RESEARCH = "https://github.com/ngkenzy/solpient-research";

const agents = [
  { name: "Muse", role: "Portfolio data & reconciliation", directory: "portfolio" },
  { name: "Gemini", role: "Screening & quantitative valuation", directory: "screener" },
  { name: "Claude", role: "Independent methodology audit", directory: "research" },
  { name: "Grok", role: "Company & market catalysts", directory: "research/companies" },
  { name: "Hark", role: "Risk challenge & downside cases", directory: "portfolio/risk-reports" },
  { name: "ChatGPT", role: "Investment committee synthesis", directory: "recommendations/investment-committee" },
];

function ratio(value: number) {
  return `${value.toFixed(1)}%`;
}

export default async function FundPage() {
  const context = await requireMoneyDataset();
  const fund = buildFundOverview(context.dataset);
  const research = await getFundResearchFeed();
  const isDemo = context.source !== "database";
  const hasHoldings = fund.positions.length > 0;
  const researchLinked = research.state === "published" || research.state === "research-pending";
  const biggest = fund.biggestStock;

  return (
    <div className="fund-page">
      <div className="fund-topline">
        <span><Landmark size={15} /> SOLPIENT / PRIVATE CAPITAL</span>
        <span className="fund-top-status"><LockKeyhole size={13} /> Local-first · Research only · No trading</span>
      </div>

      <header className="fund-heading">
        <div>
          <p className="fund-kicker">FUND OPERATIONS · OVERVIEW</p>
          <h1>Your investment command center.</h1>
          <p>One view of holdings, concentration, research and investment decisions. Evidence first; final decisions stay with you.</p>
        </div>
        <Link href="/portfolio" className="fund-action">
          Open full portfolio <ArrowRight size={17} />
        </Link>
      </header>

      {isDemo ? (
        <div className="fund-notice" role="status">
          <CircleAlert size={18} />
          <span><strong>Demo data.</strong> Values below are illustrative and do not represent your actual investments. Connect your local database before using the dashboard for decisions.</span>
          <Link href="/connect">Import data <ArrowRight size={14} /></Link>
        </div>
      ) : null}

      {!hasHoldings ? (
        <div className="fund-notice" role="status">
          <Database size={18} />
          <span><strong>No holdings found.</strong> Add or import holdings in Solpient Money. The fund overview intentionally does not substitute an older GitHub snapshot for current positions.</span>
          <Link href="/connect">Import <ArrowRight size={14} /></Link>
        </div>
      ) : null}

      <div className="fund-hero">
        <div className="fund-hero-main">
          <span className="fund-inverse-label">TRACKED INVESTED HOLDINGS</span>
          <div className="fund-total">{money(fund.investedValue)}</div>
          <p>Sum of positive-value holdings in the current Money dataset. Account balances are <strong>not</strong> added again.</p>
          <div className="fund-hero-foot">
            <span>{fund.positions.length} distinct tickers</span>
            <span>{isDemo ? "DEMONSTRATION" : "LOCAL DATABASE"}</span>
          </div>
        </div>
        <div className="fund-hero-aside">
          <div className="fund-inverse-label">CONCENTRATION STRESS TEST</div>
          {biggest ? (
            <>
              <h2>{biggest.ticker} · 30% decline</h2>
              <div className="fund-stress">−{money(fund.biggestStockDown30Loss)}</div>
              <div className="fund-stress-sub">−{ratio(fund.biggestStockDown30PortfolioPct)} of tracked holdings, all else unchanged</div>
              <p>This is a single-position sensitivity—not a loss prediction. It excludes correlated declines and taxes.</p>
            </>
          ) : (
            <p>No individual stocks are present to stress-test.</p>
          )}
        </div>
      </div>

      <section className="fund-stat-grid" aria-label="Fund exposure statistics">
        <article className="fund-stat">
          <span>Direct stocks</span>
          <strong>{money(fund.directStockValue)}</strong>
          <small>Inside tracked holdings</small>
        </article>
        <article className="fund-stat">
          <span>Largest single stock</span>
          <strong>{biggest ? ratio(biggest.weightPct) : "—"}</strong>
          <small>{biggest?.ticker ?? "No stocks"} · of invested holdings</small>
        </article>
        <article className="fund-stat">
          <span>Top five direct stocks</span>
          <strong>{biggest ? ratio(fund.topFiveDirectStockPct) : "—"}</strong>
          <small>Of direct-stock sleeve, not the entire fund</small>
        </article>
        <article className="fund-stat">
          <span>Cash-like holdings</span>
          <strong>{money(fund.cashLikeHoldings)}</strong>
          <small>Excludes separate bank accounts</small>
        </article>
      </section>

      <div className="fund-two-col">
        <section className="fund-panel">
          <div className="fund-panel-title">
            <div>
              <span className="fund-kicker">RISK OVERSIGHT</span>
              <h2>Portfolio guardrails</h2>
            </div>
            <Link href="/portfolio-intelligence" className="fund-inline-link">Detailed risk <ArrowRight size={14} /></Link>
          </div>
          <div className="fund-risk-line">
            <div><span>Single-stock review line</span><strong>{ratio(fund.singleStockReviewPct)}</strong></div>
            <div><span>Top-three direct-stock line</span><strong>{ratio(fund.topThreeReviewPct)}</strong></div>
            <div><span>Current top-three / all holdings</span><strong>{ratio(fund.topThreeStockWeightPct)}</strong></div>
          </div>
          {fund.concentrationAlerts.length ? (
            <div className="fund-alerts" role="status">
              {fund.concentrationAlerts.map((alert) => (
                <div key={alert}><ShieldAlert size={18} /><p>{alert}</p></div>
              ))}
            </div>
          ) : (
            <div className="fund-ok"><CheckCircle2 size={17} /> No size thresholds breached by current direct-stock holdings.</div>
          )}
          <p className="fund-fineprint">These are review thresholds, not mandated sell levels. ETFs and index-fund look-through exposure are not included in single-company concentration.</p>
        </section>

        <section className="fund-panel">
          <div className="fund-panel-title">
            <div>
              <span className="fund-kicker">PORTFOLIO CONSTRUCTION</span>
              <h2>Allocation by holding type</h2>
            </div>
            <Activity size={18} />
          </div>
          <div className="fund-sleeves">
            {fund.sleeves.map((sleeve) => (
              <div className="fund-sleeve" key={sleeve.kind}>
                <div><span>{sleeve.label}</span><strong>{ratio(sleeve.weightPct)}</strong></div>
                <div className="fund-track"><div style={{ width: `${Math.min(100, sleeve.weightPct)}%` }} /></div>
                <small>{money(sleeve.value)}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="fund-panel">
        <div className="fund-panel-title">
          <div>
            <span className="fund-kicker">POSITION MONITOR</span>
            <h2>Largest holdings</h2>
          </div>
          <Link href="/portfolio" className="fund-inline-link">All holdings <ArrowRight size={14} /></Link>
        </div>
        <div className="fund-position-scroll">
          <table className="fund-table">
            <thead><tr><th scope="col">Security</th><th scope="col">Type</th><th scope="col">Market value</th><th scope="col">Weight</th><th scope="col">Direct-stock share</th></tr></thead>
            <tbody>
              {fund.positions.slice(0, 10).map((position) => (
                <tr key={position.ticker}>
                  <td><Link href={`/portfolio/${position.ticker.toLowerCase()}`}><strong>{position.ticker}</strong><small>{position.name}</small></Link></td>
                  <td>{position.kind.toUpperCase()}</td>
                  <td>{money(position.value)}</td>
                  <td><div className="fund-table-weight"><span>{ratio(position.weightPct)}</span><div><i style={{ width: `${Math.min(100, position.weightPct)}%` }} /></div></div></td>
                  <td>{position.kind === "stock" ? ratio(position.shareOfDirectStocksPct) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!hasHoldings ? <p className="fund-empty">Import holdings to populate this table.</p> : null}
        </div>
      </section>

      <div className="fund-two-col fund-research-grid">
        <section className="fund-panel">
          <div className="fund-panel-title">
            <div>
              <span className="fund-kicker">CANONICAL RECOMMENDATIONS</span>
              <h2>Solpient Top 10</h2>
            </div>
            <span className={`fund-research-pill ${research.state === "published" ? "published" : ""}`}>
              {research.state === "published" ? "PUBLISHED" : researchLinked ? "RESEARCH PENDING" : "NOT SYNCED"}
            </span>
          </div>
          {research.candidates.length ? (
            <div className="fund-candidates">
              {research.candidates.map((item) => (
                <div key={item.rank}>
                  <span>{String(item.rank).padStart(2, "0")}</span>
                  <strong>{item.ticker}</strong>
                  <small>{item.detail}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="fund-research-empty">
              <BookOpen size={24} />
              <strong>{researchLinked ? "The official ranking is not published yet." : "Connect your private research repository."}</strong>
              <p>{researchLinked
                ? "Your investment committee requires fresh valuations, an independent audit, source evidence, and downside reviews before publishing a ranking."
                : "Set SOLPIENT_FUND_REPO_DIR to the path of your local personal-hedge-fund clone. The app will read canonical research files without GitHub credentials."}</p>
            </div>
          )}
          <div className="fund-panel-footer">
            {research.lastUpdated ? <span><Clock3 size={13} /> Direction updated {research.lastUpdated}</span> : <span>Local read-only bridge</span>}
            <a href={`${REPO}/blob/main/recommendations/top-10/CURRENT.md`} target="_blank" rel="noopener noreferrer">Official list <ExternalLink size={13} /></a>
          </div>
        </section>

        <section className="fund-panel">
          <div className="fund-panel-title">
            <div>
              <span className="fund-kicker">RESEARCH &amp; DECISIONS</span>
              <h2>Investment committee</h2>
            </div>
            <GitPullRequest size={18} />
          </div>
          {research.focus.length ? (
            <div className="fund-priorities">
              <strong>Current priorities · {research.lastUpdated ?? "local repository"}</strong>
              {research.focus.map((focus) => <p key={focus}>{focus}</p>)}
            </div>
          ) : (
            <div className="fund-research-empty compact">
              <p>Connect the local private Git clone to surface the direction file. Reviews and approvals remain recorded in GitHub.</p>
            </div>
          )}
          <div className="fund-quick-links">
            <a href={`${REPO}/pulls`} target="_blank" rel="noopener noreferrer">Reviews / PRs <ExternalLink size={13} /></a>
            <a href={`${REPO}/tree/main/decisions`} target="_blank" rel="noopener noreferrer">Decision log <ExternalLink size={13} /></a>
            <a href={RESEARCH} target="_blank" rel="noopener noreferrer">Research engine <ExternalLink size={13} /></a>
          </div>
        </section>
      </div>

      <section className="fund-panel fund-agent-panel">
        <div className="fund-panel-title">
          <div>
            <span className="fund-kicker">AI INVESTMENT TEAM</span>
            <h2>Assigned research lanes</h2>
            <p>Roles come from your fund governance. These cards do not imply that agents are running or that work has been reviewed.</p>
          </div>
          <a href={`${REPO}/blob/main/AGENT_ROLES.md`} target="_blank" rel="noopener noreferrer" className="fund-inline-link">Team rules <ExternalLink size={13} /></a>
        </div>
        <div className="fund-agent-grid">
          {agents.map((agent) => (
            <a key={agent.name} href={`${REPO}/tree/main/${agent.directory}`} target="_blank" rel="noopener noreferrer">
              <div className="fund-agent-avatar">{agent.name[0]}</div>
              <strong>{agent.name}</strong>
              <span>{agent.role}</span>
              <small>Browse research <ArrowRight size={12} /></small>
            </a>
          ))}
        </div>
      </section>

      <footer className="fund-footer">
        <div><Database size={15} /><span>Holdings: {isDemo ? "demo dataset" : "local Money database"} · Research: {researchLinked ? "local private Git clone" : "not synced"}</span></div>
        <p>Important: This view does not determine account ownership or reconcile outside positions automatically. Confirm your sister’s holdings are excluded from imports. TSP balances and cash accounts are not automatically added to the holdings total. No verified time-weighted returns or live market quotes are claimed. No trades are executed.</p>
        <Link href="/data-health">Check data quality <ArrowRight size={13} /></Link>
      </footer>
    </div>
  );
}
