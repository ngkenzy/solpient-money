import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { demoMoneyDataset } from "@/lib/demo-data";
import { findHolding, getPortfolioMetrics, money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return demoMoneyDataset.holdings.map((holding) => ({ ticker: holding.ticker.toLowerCase() }));
}

export default async function HoldingPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const holding = findHolding(ticker, data);
  if (!holding) notFound();

  const metrics = getPortfolioMetrics(data);
  const weight = metrics.total ? (holding.value / metrics.total) * 100 : 0;
  const unrealized = holding.value - holding.costBasis;
  const totalReturn = holding.costBasis ? (unrealized / holding.costBasis) * 100 : 0;

  return (
    <div className="page">
      <Link className="back-link" href="/portfolio"><ArrowLeft size={15} /> Back to portfolio</Link>
      <PageHeader
        eyebrow={holding.kind.toUpperCase()}
        title={`${holding.ticker} · ${holding.name}`}
        description={`Position data comes from ${context.source === "database" ? "the private Money database" : "demo mode"}.`}
      />

      <div className="metric-grid four">
        <div className="metric-card"><span>Position value</span><strong>{money(holding.value)}</strong><small>{weight.toFixed(1)}% of portfolio</small></div>
        <div className="metric-card"><span>Shares</span><strong>{holding.shares.toLocaleString("en-US", { maximumFractionDigits: 1 })}</strong><small>{context.source === "database" ? "Persisted position" : "Demo position"}</small></div>
        <div className="metric-card"><span>Unrealized P/L</span><strong className={unrealized >= 0 ? "positive-text" : "negative-text"}>{money(unrealized)}</strong><small>{totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(1)}% vs cost basis</small></div>
        <div className="metric-card"><span>YTD return</span><strong className={holding.ytdReturn >= 0 ? "positive-text" : "negative-text"}>{holding.ytdReturn >= 0 ? "+" : ""}{holding.ytdReturn.toFixed(1)}%</strong><small>Illustrative holding return</small></div>
      </div>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">POSITION DETAIL</span><h2>Cost basis</h2></div>
        </div>
        <div className="detail-list compact">
          <div><span>Cost basis</span><strong>{money(holding.costBasis)}</strong></div>
          <div><span>Current price</span><strong>{money(holding.price, true)}</strong></div>
          <div><span>Sector</span><strong>{holding.sector || "—"}</strong></div>
          <div><span>Source</span><strong>{holding.source === "file" ? "File import" : holding.source === "ofx_direct" ? "Direct OFX" : holding.source}</strong></div>
        </div>
      </section>
    </div>
  );
}
