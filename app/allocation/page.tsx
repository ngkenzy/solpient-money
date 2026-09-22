import AllocationDonut from "@/components/AllocationDonut";
import PageHeader from "@/components/PageHeader";
import { allocation, holdings } from "@/lib/demo-data";
import { getPortfolioMetrics, money } from "@/lib/finance";

export default function AllocationPage() {
  const metrics = getPortfolioMetrics();
  const bySector = Object.entries(
    holdings.reduce<Record<string, number>>((acc, holding) => {
      acc[holding.sector] = (acc[holding.sector] ?? 0) + holding.value;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="ALLOCATION"
        title="See where portfolio risk actually lives."
        description="Asset-class and exposure views calculated directly from the deterministic V0.2 holding set."
      />
      <div className="allocation-page-grid">
        <section className="card page-card allocation-center">
          <AllocationDonut items={allocation} totalLabel="$864K" />
          <div className="allocation-list roomy">
            {allocation.map((item) => (
              <div key={item.label}><span className={"dot " + item.tone} /><span>{item.label}</span><strong>{item.value}%</strong></div>
            ))}
          </div>
        </section>
        <section className="card page-card">
          <div className="section-title-row"><div><span className="card-kicker">EXPOSURES</span><h2>By sector / sleeve</h2></div></div>
          <div className="bar-list">
            {bySector.map(([sector, value]) => {
              const weight = (value / metrics.total) * 100;
              return (
                <div className="bar-item" key={sector}>
                  <div><span>{sector}</span><strong>{weight.toFixed(1)}% · {money(value)}</strong></div>
                  <div className="bar-track"><span style={{ width: `${weight}%` }} /></div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
