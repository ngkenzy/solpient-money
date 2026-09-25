import Link from "next/link";
import { ArrowLeft, LineChart } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import InteractiveLineChart from "@/components/InteractiveLineChart";
import PageHeader from "@/components/PageHeader";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const latest = data.portfolioPerformance.at(-1) ?? { portfolio: 0, benchmark: 0 };

  if (!data.holdings.length) {
    return (
      <div className="page">
        <Link className="back-link" href="/portfolio"><ArrowLeft size={15} /> Back to portfolio</Link>
        <PageHeader
          eyebrow="PERFORMANCE"
          title="Measure the portfolio, not the noise."
          description="Track total return against your benchmark over time."
        />
        <EmptyState
          icon={LineChart}
          title="No holdings yet"
          copy="Import a brokerage CSV and Solpient starts tracking your portfolio against its benchmark."
          actionHref="/connect"
          actionLabel="Import holdings"
        />
      </div>
    );
  }

  return (
    <div className="page">
      <Link className="back-link" href="/portfolio"><ArrowLeft size={15} /> Back to portfolio</Link>
      <PageHeader
        eyebrow="PERFORMANCE"
        title="Measure the portfolio, not the noise."
        description="Performance history now comes through the shared MoneyDataset adapter. V0.5 stores snapshot history separately from holdings."
      />
      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">TOTAL RETURN</span><h2>Portfolio vs benchmark</h2></div>
          <span className="mini-positive">Portfolio {latest.portfolio >= 0 ? "+" : ""}{latest.portfolio.toFixed(1)}% · Benchmark {latest.benchmark >= 0 ? "+" : ""}{latest.benchmark.toFixed(1)}%</span>
        </div>
        <InteractiveLineChart
          data={data.portfolioPerformance}
          series={[
            { key: "portfolio", label: "Portfolio", format: "percent" },
            { key: "benchmark", label: "Benchmark", format: "percent" },
          ]}
          height={300}
        />
      </section>
    </div>
  );
}
