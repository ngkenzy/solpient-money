import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { holdings } from "@/lib/demo-data";
import { findHolding, getPortfolioMetrics, money } from "@/lib/finance";

export function generateStaticParams() {
  return holdings.map((holding) => ({ ticker: holding.ticker.toLowerCase() }));
}

export default async function HoldingPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const holding = findHolding(ticker);
  if (!holding) notFound();

  const metrics = getPortfolioMetrics();
  const weight = (holding.value / metrics.total) * 100;
  const unrealized = holding.value - holding.costBasis;
  const totalReturn = holding.costBasis ? (unrealized / holding.costBasis) * 100 : 0;
  const fairValueGap =
    holding.fairValue && holding.price
      ? ((holding.fairValue / holding.price) - 1) * 100
      : null;

  return (
    <div className="page">
      <Link className="back-link" href="/portfolio"><ArrowLeft size={15} /> Back to portfolio</Link>
      <PageHeader
        eyebrow={holding.kind.toUpperCase()}
        title={`${holding.ticker} · ${holding.name}`}
        description="Position-level demo analytics. Company research fields are placeholders until the controlled Solpient Research integration is added."
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Position value</span><strong>{money(holding.value)}</strong><small>{weight.toFixed(1)}% of portfolio</small></div>
        <div className="metric-card"><span>Shares</span><strong>{holding.shares.toLocaleString("en-US", { maximumFractionDigits: 1 })}</strong><small>Demo position</small></div>
        <div className="metric-card"><span>Unrealized P/L</span><strong className={unrealized >= 0 ? "positive-text" : "negative-text"}>{money(unrealized)}</strong><small>{totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(1)}% vs cost basis</small></div>
        <div className="metric-card"><span>YTD return</span><strong className={holding.ytdReturn >= 0 ? "positive-text" : "negative-text"}>{holding.ytdReturn >= 0 ? "+" : ""}{holding.ytdReturn.toFixed(1)}%</strong><small>Illustrative return</small></div>
      </div>

      <div className="holding-layout">
        <section className="card page-card">
          <div className="section-title-row">
            <div><span className="card-kicker">POSITION</span><h2>What you own</h2></div>
          </div>
          <div className="detail-list">
            <div><span>Price</span><strong>{money(holding.price, true)}</strong></div>
            <div><span>Cost basis</span><strong>{money(holding.costBasis)}</strong></div>
            <div><span>Market value</span><strong>{money(holding.value)}</strong></div>
            <div><span>Sector / exposure</span><strong>{holding.sector}</strong></div>
            <div><span>Portfolio weight</span><strong>{weight.toFixed(1)}%</strong></div>
            <div><span>Day change</span><strong className={holding.dayChange >= 0 ? "positive-text" : "negative-text"}>{holding.dayChange >= 0 ? "+" : ""}{holding.dayChange.toFixed(1)}%</strong></div>
          </div>
        </section>

        <section className="card page-card research-detail">
          <div className="research-icon"><ShieldCheck size={22} /></div>
          <div>
            <span className="card-kicker">SOLPIENT RESEARCH</span>
            <h2>{holding.researchScore ? `Demo score ${holding.researchScore} / 100` : "Not individually scored"}</h2>
            {holding.researchScore ? (
              <>
                <div className="detail-list compact">
                  <div><span>Thesis status</span><strong>{holding.thesis}</strong></div>
                  <div><span>Demo fair value</span><strong>{holding.fairValue ? money(holding.fairValue, true) : "—"}</strong></div>
                  <div><span>Price vs fair value</span><strong className={fairValueGap != null && fairValueGap >= 0 ? "positive-text" : "negative-text"}>{fairValueGap != null ? `${fairValueGap >= 0 ? "+" : ""}${fairValueGap.toFixed(1)}%` : "—"}</strong></div>
                </div>
                <p className="research-disclaimer">These are synthetic V0.2 values used to prove the Money ↔ Research interface. They are not live research conclusions.</p>
              </>
            ) : (
              <p className="research-disclaimer">Broad funds and cash positions do not receive company-level Solpient scores.</p>
            )}
          </div>
        </section>
      </div>

      {holding.researchScore ? (
        <section className="card holding-cta">
          <div><span className="card-kicker">NEXT INTEGRATION</span><h2>Open the real Solpient Research package</h2><p>V0.3 will replace these placeholders with read-only latest research, valuation, thesis status, evidence confidence, and change history.</p></div>
          <Link className="research-button" href="/research">Research connection <ArrowRight size={16} /></Link>
        </section>
      ) : null}
    </div>
  );
}
