import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { demoMoneyDataset } from "@/lib/demo-data";
import { findHolding, getPortfolioMetrics, money } from "@/lib/finance";\nimport { requireMoneyDataset } from "@/lib/money-data";
import { formatResearchDate, loadResearchSnapshots } from "@/lib/research";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return demoMoneyDataset.holdings.map((holding) => ({ ticker: holding.ticker.toLowerCase() }));
}

function score(value: number | null) {
  return value == null ? "—" : value.toFixed(0);
}

export default async function HoldingPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const holding = findHolding(ticker);
  if (!holding) notFound();

  const metrics = getPortfolioMetrics(data);
  const weight = (holding.value / metrics.total) * 100;
  const unrealized = holding.value - holding.costBasis;
  const totalReturn = holding.costBasis ? (unrealized / holding.costBasis) * 100 : 0;

  const research = await loadResearchSnapshots([holding.ticker]);
  const snapshot = research.snapshots[holding.ticker];

  return (
    <div className="page">
      <Link className="back-link" href="/portfolio"><ArrowLeft size={15} /> Back to portfolio</Link>
      <PageHeader
        eyebrow={holding.kind.toUpperCase()}
        title={`${holding.ticker} · ${holding.name}`}
        description={
          snapshot
            ? `Position data comes from ${context.source === "database" ? "the private Money database" : "demo mode"}. Research is live from published Solpient Research version ${snapshot.research_version}.`
            : `Position data comes from ${context.source === "database" ? "the private Money database" : "demo mode"}. No published Solpient company Research package is available for this holding.`
        }
        action={
          <span className={"live-pill " + (snapshot ? "connected" : research.connected ? "neutral" : "disconnected")}>
            {snapshot ? "LIVE RESEARCH" : research.connected ? "NO COVERAGE" : "RESEARCH UNAVAILABLE"}
          </span>
        }
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Position value</span><strong>{money(holding.value)}</strong><small>{weight.toFixed(1)}% of portfolio</small></div>
        <div className="metric-card"><span>Shares</span><strong>{holding.shares.toLocaleString("en-US", { maximumFractionDigits: 1 })}</strong><small>{context.source === "database" ? "Persisted position" : "Demo position"}</small></div>
        <div className="metric-card"><span>Unrealized P/L</span><strong className={unrealized >= 0 ? "positive-text" : "negative-text"}>{money(unrealized)}</strong><small>{totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(1)}% vs cost basis</small></div>
        <div className="metric-card"><span>YTD return</span><strong className={holding.ytdReturn >= 0 ? "positive-text" : "negative-text"}>{holding.ytdReturn >= 0 ? "+" : ""}{holding.ytdReturn.toFixed(1)}%</strong><small>Illustrative holding return</small></div>
      </div>

      {!snapshot ? (
        <section className="card page-card empty-research-state">
          <ShieldCheck size={24} />
          <div>
            <span className="card-kicker">SOLPIENT RESEARCH</span>
            <h2>{research.connected ? "No published company coverage" : "Research connection unavailable"}</h2>
            <p>
              {research.connected
                ? "This holding does not currently map to a published company Research package. Money is not substituting a synthetic score."
                : research.error ?? "The live Research read contract could not be reached."}
            </p>
          </div>
        </section>
      ) : (
        <>
          <div className="research-metric-grid">
            <section className="card research-score-hero">
              <span className="card-kicker">SOLPIENT RESEARCH SCORE</span>
              <strong>{score(snapshot.overall_score)}</strong>
              <small>Latest published Research version {snapshot.research_version}</small>
            </section>
            <section className="card research-mini-metric">
              <span>Base fair value</span>
              <strong>{snapshot.base_value != null ? money(snapshot.base_value, true) : "—"}</strong>
              <small>
                Research price {snapshot.price_at_research != null ? money(snapshot.price_at_research, true) : "—"}
                {snapshot.base_value_gap_pct != null ? ` · ${snapshot.base_value_gap_pct >= 0 ? "+" : ""}${snapshot.base_value_gap_pct.toFixed(1)}%` : ""}
              </small>
            </section>
            <section className="card research-mini-metric">
              <span>Thesis health</span>
              <strong className={"thesis-text " + snapshot.thesis_health}>{snapshot.thesis_health.replace("_", " ")}</strong>
              <small>{snapshot.thesis_strengthened_count} strengthened · {snapshot.thesis_weakened_count} weakened · {snapshot.thesis_monitor_count} monitor</small>
            </section>
            <section className="card research-mini-metric">
              <span>Evidence confidence</span>
              <strong>{snapshot.evidence_confidence_score?.toFixed(1) ?? "—"}</strong>
              <small>Current ranking layer · {formatResearchDate(snapshot.evidence_confidence_as_of)}</small>
            </section>
          </div>

          <section className="card page-card">
            <div className="section-title-row">
              <div><span className="card-kicker">PUBLISHED RESEARCH</span><h2>Thesis and evidence context</h2></div>
              <span className="small-muted">{snapshot.standard_version ?? "Research standard"} · {snapshot.standard_status ?? "—"}</span>
            </div>
            <p className="research-summary-copy">{snapshot.research_summary ?? "No published summary available."}</p>
            <div className="research-provenance-grid">
              <div><span>Research version</span><strong>v{snapshot.research_version}</strong></div>
              <div><span>Researched</span><strong>{formatResearchDate(snapshot.researched_at)}</strong></div>
              <div><span>Data cutoff</span><strong>{formatResearchDate(snapshot.data_cutoff_at)}</strong></div>
              <div><span>Research completeness</span><strong>{snapshot.completeness_pct?.toFixed(1) ?? "—"}%</strong></div>
              <div><span>Coverage readiness</span><strong>{snapshot.current_decision_readiness_pct?.toFixed(1) ?? "—"}%</strong></div>
              <div><span>Coverage as of</span><strong>{formatResearchDate(snapshot.coverage_as_of_date)}</strong></div>
            </div>
          </section>

          <div className="holding-layout">
            <section className="card page-card">
              <div className="section-title-row">
                <div><span className="card-kicker">SCORECARD</span><h2>Research dimensions</h2></div>
              </div>
              <div className="score-dimension-grid">
                <div><span>Business quality</span><strong>{score(snapshot.quality_score)}</strong></div>
                <div><span>Growth</span><strong>{score(snapshot.growth_score)}</strong></div>
                <div><span>Valuation</span><strong>{score(snapshot.valuation_score)}</strong></div>
                <div><span>Financial strength</span><strong>{score(snapshot.financial_strength_score)}</strong></div>
                <div><span>Moat</span><strong>{score(snapshot.moat_score)}</strong></div>
                <div><span>Thesis integrity</span><strong>{score(snapshot.thesis_integrity_score)}</strong></div>
              </div>
            </section>

            <section className="card page-card">
              <div className="section-title-row">
                <div><span className="card-kicker">VALUATION</span><h2>Published scenarios</h2></div>
              </div>
              <div className="valuation-scenario-grid">
                <div className="bear"><span>Bear</span><strong>{snapshot.bear_value != null ? money(snapshot.bear_value, true) : "—"}</strong></div>
                <div className="base"><span>Base</span><strong>{snapshot.base_value != null ? money(snapshot.base_value, true) : "—"}</strong></div>
                <div className="bull"><span>Bull</span><strong>{snapshot.bull_value != null ? money(snapshot.bull_value, true) : "—"}</strong></div>
              </div>
              <div className="detail-list compact">
                <div><span>25% margin-of-safety price</span><strong>{snapshot.mos_25_price != null ? money(snapshot.mos_25_price, true) : "—"}</strong></div>
                <div><span>35% margin-of-safety price</span><strong>{snapshot.mos_35_price != null ? money(snapshot.mos_35_price, true) : "—"}</strong></div>
                <div><span>50% margin-of-safety price</span><strong>{snapshot.mos_50_price != null ? money(snapshot.mos_50_price, true) : "—"}</strong></div>
              </div>
            </section>
          </div>

          <section className="card page-card">
            <div className="section-title-row">
              <div><span className="card-kicker">THESIS HEALTH</span><h2>Tracked conditions</h2></div>
              <span className={"thesis-pill " + snapshot.thesis_health}>{snapshot.thesis_health.replace("_", " ")}</span>
            </div>
            <div className="thesis-variable-list">
              {snapshot.thesis_variables.map((item, index) => (
                <div className="thesis-variable-row" key={item.variable_name ?? index}>
                  <span className={"signal-dot " + (item.status ?? "unknown")} />
                  <div>
                    <strong>{item.variable_name ?? "Tracked thesis condition"}</strong>
                    <span>{item.observed_value ?? item.expectation ?? "Evidence pending."}</span>
                  </div>
                  <span className={"status-word " + (item.status ?? "unknown")}>{item.status ?? "unknown"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card page-card">
            <div className="section-title-row">
              <div><span className="card-kicker">RISK REGISTER</span><h2>Published risks</h2></div>
              <span className="small-muted">{snapshot.risks.length} tracked</span>
            </div>
            <div className="risk-grid">
              {snapshot.risks.map((risk, index) => (
                <article className="risk-card" key={risk.risk_key ?? risk.title ?? index}>
                  <div className="risk-card-head">
                    <CircleAlert size={17} />
                    <strong>{risk.title ?? "Research risk"}</strong>
                    <span className={"risk-severity " + (risk.severity ?? "unknown")}>{risk.severity ?? "—"}</span>
                  </div>
                  {risk.description ? <p>{risk.description}</p> : null}
                  {risk.evidence ? <small><b>Evidence:</b> {risk.evidence}</small> : null}
                  {risk.thesis_breaker ? <small><b>Breaker:</b> {risk.thesis_breaker}</small> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="card page-card">
            <div className="section-title-row">
              <div><span className="card-kicker">WHAT CHANGED</span><h2>Published version changes</h2></div>
              <span className="small-muted">{snapshot.what_changed.length} recorded</span>
            </div>
            {snapshot.what_changed.length ? (
              <div className="change-list">
                {snapshot.what_changed.map((change, index) => (
                  <div className="change-row" key={`${change.label ?? "change"}-${index}`}>
                    <span className={"change-direction " + (change.direction ?? "unchanged")}>
                      {change.direction === "weakened" ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                    </span>
                    <div>
                      <strong>{change.label ?? change.category ?? "Research change"}</strong>
                      <span>{change.summary ?? change.new_text ?? "Published research changed."}</span>
                    </div>
                    <span className="change-materiality">{change.materiality ?? "—"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No published version-to-version changes are recorded for this latest research run.</p>
            )}
          </section>

          <section className="card holding-cta">
            <div>
              <span className="card-kicker">LIVE RESEARCH CONTRACT</span>
              <h2>Money is reading the published Research system directly</h2>
              <p>Published score, valuation, thesis, risks, and change history come from the latest published run. Evidence confidence and coverage are current Research-system metrics and carry their own as-of dates.</p>
            </div>
            <Link className="research-button" href="/research">Research feed <ArrowRight size={16} /></Link>
          </section>
        </>
      )}
    </div>
  );
}
