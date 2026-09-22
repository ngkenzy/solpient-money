import { CheckCircle2, TriangleAlert } from "lucide-react";
import AttentionFeed from "@/components/AttentionFeed";
import PageHeader from "@/components/PageHeader";
import { holdings } from "@/lib/demo-data";
import { getAttentionFeed, getFinancialHealth, getResearchAlerts } from "@/lib/intelligence";
import { loadResearchSnapshots } from "@/lib/research";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const tickers = holdings.filter((holding) => holding.kind === "stock").map((holding) => holding.ticker);
  const research = await loadResearchSnapshots(tickers);
  const health = getFinancialHealth(research.snapshots);
  const attention = getAttentionFeed(research.snapshots);
  const researchAlerts = getResearchAlerts(research.snapshots);

  return (
    <div className="page">
      <PageHeader
        eyebrow="SOLPIENT INTELLIGENCE"
        title="What deserves your attention."
        description="V0.4 combines deterministic household calculations with live published Solpient Research. Every flag exposes its inputs and calculation."
        action={<span className={"live-pill " + (research.connected ? "connected" : "disconnected")}>{research.connected ? "RESEARCH LIVE" : "RESEARCH UNAVAILABLE"}</span>}
      />

      <div className="health-overview">
        <section className="card health-score-card">
          <span className="card-kicker">FINANCIAL HEALTH</span>
          <strong>{health.score}<small>/100</small></strong>
          <div className="health-track large"><span style={{ width: `${health.score}%` }} /></div>
          <p>A transparent composite of liquidity, cash flow, debt, portfolio structure, Research confidence, and tracked goals.</p>
        </section>
        <section className="health-components">
          {health.components.map((component) => (
            <div className="card health-component-card" key={component.key}>
              <div>
                <span>{component.label}</span>
                <strong>{component.score.toFixed(0)} / {component.maxScore}</strong>
              </div>
              <p>{component.detail}</p>
              <details className="explain-details compact">
                <summary>Show calculation</summary>
                <div className="explain-grid">
                  <div><span>Formula</span><p>{component.calculation}</p></div>
                  <div className="explain-inputs"><span>Inputs</span><ul>{component.inputs.map((input) => <li key={input}>{input}</li>)}</ul></div>
                </div>
              </details>
            </div>
          ))}
        </section>
      </div>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">ATTENTION FEED</span><h2>Prioritized household review</h2></div>
          <span className="small-muted">{attention.length} current items</span>
        </div>
        <AttentionFeed items={attention} />
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">RESEARCH CHANGE ALERTS</span><h2>What changed in owned companies</h2></div>
          <span className="small-muted">{researchAlerts.length} matched signals</span>
        </div>
        {researchAlerts.length ? (
          <div className="research-alert-list">
            {researchAlerts.map((alert) => (
              <a className="research-alert-row" href={alert.href} key={alert.id}>
                <span className={"research-alert-icon " + alert.direction}>
                  {alert.direction === "weakened" ? <TriangleAlert size={16} /> : <CheckCircle2 size={16} />}
                </span>
                <div>
                  <strong>{alert.ticker} · {alert.title}</strong>
                  <span>{alert.summary}</span>
                </div>
                <span className="research-alert-meta">{alert.direction} · {alert.materiality}</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="empty-copy">No published Research changes currently match the direct-stock holdings.</p>
        )}
      </section>
    </div>
  );
}
