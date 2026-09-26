import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { demoMoneyDataset } from "@/lib/demo-data";
import { findHolding, getPortfolioMetrics, money } from "@/lib/finance";
import { requireAuthenticatedMoneyUser } from "@/lib/money-auth";
import { requireMoneyDataset } from "@/lib/money-data";
import { saveTickerNote } from "./actions";

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

  let latestNote: { note: string; decided_at: string } | null = null;
  if (context.source === "database" && context.household) {
    const { supabase } = await requireAuthenticatedMoneyUser();
    const { data: noteRow } = await supabase
      .from("investment_decisions")
      .select("note, decided_at")
      .eq("household_id", context.household.id)
      .eq("ticker", holding.ticker.toUpperCase())
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (noteRow?.note) {
      latestNote = {
        note: String(noteRow.note),
        decided_at: String(noteRow.decided_at),
      };
    }
  }

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
          <div><span>Source</span><strong>{holding.source === "file" ? "File import" : holding.source}</strong></div>
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">POSITION NOTES</span><h2>Notes</h2></div>
        </div>
        {context.source === "database" ? (
          <>
            {latestNote ? (
              <div className="ticker-note-current">
                <p>{latestNote.note}</p>
                <small>
                  Last updated{" "}
                  {new Date(latestNote.decided_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </small>
              </div>
            ) : (
              <p className="small-muted">No notes yet. Record why you hold this position.</p>
            )}
            <form action={saveTickerNote.bind(null, ticker)} className="ticker-note-form">
              <label>
                <span>{latestNote ? "Update note" : "Add a note"}</span>
                <textarea
                  name="note"
                  rows={3}
                  maxLength={2000}
                  defaultValue={latestNote?.note ?? ""}
                  placeholder="Why do you hold this? What would change your mind?"
                />
              </label>
              <button className="primary-auth-button" type="submit">Save note</button>
            </form>
            <p className="small-muted">Notes record intent only. They never execute trades.</p>
          </>
        ) : (
          <p className="small-muted">Notes are saved per ticker when Money persistence is connected.</p>
        )}
      </section>
    </div>
  );
}
