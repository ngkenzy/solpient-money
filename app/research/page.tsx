import Link from "next/link";
import { ArrowRight, Database, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";
import { formatResearchDate, loadResearchSnapshots } from "@/lib/research";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const context = await requireMoneyDataset();
  const tickers = context.dataset.holdings.filter((holding) => holding.kind === "stock").map((holding) => holding.ticker);
  const research = await loadResearchSnapshots(tickers);
  const covered = Object.values(research.snapshots).sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));

  return (
    <div className="page">
      <PageHeader
        eyebrow="RESEARCH CONNECTION"
        title="Money knows what you own. Research explains what it means."
        description="The Money holdings dataset is matched to the live read-only Solpient Research contract. Draft and review-workbench records remain inaccessible."
        action={<span className={"live-pill " + (research.connected ? "connected" : "disconnected")}>{research.connected ? "LIVE" : "UNAVAILABLE"}</span>}
      />

      <div className="research-architecture">
        <section className="card page-card architecture-card"><Database size={24} /><div><strong>Solpient Money</strong><span>{context.source === "database" ? "Private household database" : "Demo household dataset"}</span></div></section>
        <span className="architecture-arrow">→</span>
        <section className="card page-card architecture-card live-contract"><ShieldCheck size={24} /><div><strong>money_research_snapshots_v1</strong><span>Security-invoker · read-only · published research</span></div></section>
        <span className="architecture-arrow">→</span>
        <section className="card page-card architecture-card"><strong>Portfolio Intelligence</strong><span>Scores · valuation · thesis · evidence · risks · changes</span></section>
      </div>

      {!research.connected ? <section className="card page-card error-card"><strong>Live Research unavailable</strong><p>{research.error ?? "The Research read contract could not be reached."}</p></section> : null}

      <section className="card page-card">
        <div className="section-title-row"><div><span className="card-kicker">LIVE PUBLISHED COVERAGE</span><h2>Portfolio companies</h2></div><span className="small-muted">{covered.length} live matches</span></div>
        <div className="research-holdings v03">
          {covered.map((snapshot) => (
            <Link href={`/portfolio/${snapshot.ticker.toLowerCase()}`} key={snapshot.ticker}>
              <div><strong>{snapshot.ticker}</strong><span>{snapshot.company_name} · Research v{snapshot.research_version}</span></div>
              <div><strong>{snapshot.overall_score?.toFixed(0) ?? "—"}</strong><span>Research score</span></div>
              <div><strong>{snapshot.base_value != null ? money(snapshot.base_value, true) : "—"}</strong><span>Base fair value</span></div>
              <div><strong>{snapshot.evidence_confidence_score?.toFixed(1) ?? "—"}</strong><span>Evidence confidence</span></div>
              <div><strong className={"thesis-text " + snapshot.thesis_health}>{snapshot.thesis_health}</strong><span>Thesis health</span></div>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row"><div><span className="card-kicker">DATA CONTRACT</span><h2>What “live” means</h2></div></div>
        <div className="contract-facts">
          <div><strong>Published package</strong><span>Score, valuation, thesis, risks, and what-changed are frozen to the latest published Research run.</span></div>
          <div><strong>Current evidence layer</strong><span>Evidence confidence and coverage readiness come from current Research engines and carry separate timestamps.</span></div>
          <div><strong>Private Money boundary</strong><span>Research never receives household accounts, transactions, debt, goals, or auth data.</span></div>
          <div><strong>Failure behavior</strong><span>If Research is unavailable, Money displays unavailable rather than reverting to synthetic Research values.</span></div>
        </div>
        {covered[0] ? <p className="contract-asof">Newest Research evidence snapshot shown: {formatResearchDate(covered[0].evidence_confidence_as_of)}</p> : null}
      </section>
    </div>
  );
}
