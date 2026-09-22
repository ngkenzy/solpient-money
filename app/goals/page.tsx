import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const context = await requireMoneyDataset();
  const goals = context.dataset.householdGoals;

  return (
    <div className="page">
      <PageHeader
        eyebrow="GOALS"
        title="Give every dollar a job."
        description={context.source === "database" ? "Persisted household goals feed the same planning score used by Solpient Financial Health." : "Demo goals feed the planning score until persistence is connected."}
      />
      <section className="card page-card">
        <div className="goal-list">
          {goals.map((goal) => {
            const progress = Math.min(100, goal.target > 0 ? (goal.current / goal.target) * 100 : 0);
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
