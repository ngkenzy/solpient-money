import PageHeader from "@/components/PageHeader";

const goals = [
  { name: "Emergency reserve", current: 82, target: 90, unit: "$K" },
  { name: "Annual travel", current: 7, target: 12, unit: "$K" },
  { name: "Home projects", current: 18, target: 30, unit: "$K" },
];

export default function GoalsPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="GOALS"
        title="Give every dollar a job."
        description="Illustrative household goals with deterministic progress tracking. Live goals will later connect to account balances and cash-flow plans."
      />
      <section className="card page-card">
        <div className="goal-list">
          {goals.map((goal) => {
            const progress = Math.min(100, (goal.current / goal.target) * 100);
            return (
              <div className="goal-row" key={goal.name}>
                <div><strong>{goal.name}</strong><span>{goal.unit}{goal.current} of {goal.unit}{goal.target}</span></div>
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
