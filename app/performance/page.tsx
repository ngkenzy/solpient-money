import InteractiveLineChart from "@/components/InteractiveLineChart";
import PageHeader from "@/components/PageHeader";
import { portfolioPerformance } from "@/lib/demo-data";

export default function PerformancePage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="PERFORMANCE"
        title="Measure the portfolio, not the noise."
        description="Illustrative total-return history against a broad-market benchmark. Live return calculation will later use transaction-aware account data."
      />
      <section className="card page-card">
        <div className="section-title-row">
          <div><span className="card-kicker">YTD TOTAL RETURN</span><h2>Portfolio vs benchmark</h2></div>
          <span className="mini-positive">Portfolio +12.4% · Benchmark +10.6%</span>
        </div>
        <InteractiveLineChart
          data={portfolioPerformance}
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
