import Link from "next/link";
import { ArrowRight, Database, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { holdings } from "@/lib/demo-data";

export default function ResearchPage() {
  const covered = holdings.filter((holding) => holding.researchScore != null);

  return (
    <div className="page">
      <PageHeader
        eyebrow="RESEARCH CONNECTION"
        title="Money knows what you own. Research explains what it means."
        description="V0.2 proves the interface with synthetic scores. V0.3 should replace these values with controlled read-only data from Solpient Research."
      />
      <div className="research-architecture">
        <section className="card page-card architecture-card">
          <Database size={24} />
          <div><strong>Solpient Money</strong><span>Accounts · transactions · holdings · goals</span></div>
        </section>
        <span className="architecture-arrow">→</span>
        <section className="card page-card architecture-card">
          <ShieldCheck size={24} />
          <div><strong>Read-only Research interface</strong><span>Latest reviewed research only</span></div>
        </section>
        <span className="architecture-arrow">→</span>
        <section className="card page-card architecture-card">
          <strong>Portfolio Intelligence</strong>
          <span>Valuation · thesis · risks · changes</span>
        </section>
      </div>

      <section className="card page-card">
        <div className="section-title-row"><div><span className="card-kicker">DEMO COVERAGE</span><h2>Covered holdings</h2></div></div>
        <div className="research-holdings">
          {covered.map((holding) => (
            <Link href={`/portfolio/${holding.ticker.toLowerCase()}`} key={holding.ticker}>
              <div><strong>{holding.ticker}</strong><span>{holding.name}</span></div>
              <div><strong>{holding.researchScore}</strong><span>{holding.thesis}</span></div>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
