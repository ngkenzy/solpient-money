import PageHeader from "@/components/PageHeader";
import { householdGoals } from "@/lib/demo-data";
import { money } from "@/lib/finance";

export default function GoalsPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="GOALS"
        title="Give every dollar a job."
        description="Tracked synthetic household goals now feed the same V0.4 planning score used by Solpient Financial Health."
      />
      <section className="card page-card">
        <div className="goal-list">
          {householdGoals.map((goal) => {
            const progress = Math.min(100, (goal.current / goal.target) * 100);
            return (
              <div className="goal-row" key={goal.id}>
                <div><strong>{goal.name}</strong><span>{money(goal.current)} of {money(goal.target)}</span></div>
                <strong>{progress.toFixed(0)}%</strong>
                <div className="goal-track"><span style={{ width: `${progress}%` }} /></div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
