import { CalendarClock, Plus, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";
import { createGoal, deleteGoal, updateGoal } from "./actions";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "No target date";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default async function GoalsPage() {
  const context = await requireMoneyDataset();
  const goals = context.dataset.householdGoals;

  return (
    <div className="page">
      <PageHeader
        eyebrow="V1.1 · GOALS"
        title="Give every goal an amount and a date."
        description="Target dates let the Financial Plan Engine calculate the monthly contribution required to stay on pace. Undated goals remain visible but Solpient will not invent a deadline for them."
      />

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">TRACKED GOALS</span>
            <h2>Funding status and planning metadata</h2>
          </div>
          <span className="small-muted">{goals.length} goals</span>
        </div>

        <div className="goal-plan-list">
          {goals.map((goal) => {
            const progress = Math.min(
              100,
              goal.target > 0 ? (goal.current / goal.target) * 100 : 0
            );

            return (
              <details className="goal-plan-row" key={goal.id}>
                <summary>
                  <div>
                    <strong>{goal.name}</strong>
                    <span>
                      {money(goal.current)} of {money(goal.target)} ·{" "}
                      {formatDate(goal.targetDate)}
                    </span>
                  </div>
                  <div>
                    <strong>{progress.toFixed(0)}%</strong>
                    <span>Priority {goal.priority}</span>
                  </div>
                </summary>

                <div className="goal-track">
                  <span style={{ width: `${progress}%` }} />
                </div>

                <form className="goal-edit-form" action={updateGoal}>
                  <input type="hidden" name="goal_id" value={goal.id} />
                  <label>
                    <span>Name</span>
                    <input name="name" defaultValue={goal.name} required />
                  </label>
                  <label>
                    <span>Current</span>
                    <input
                      name="current"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={goal.current}
                      required
                    />
                  </label>
                  <label>
                    <span>Target</span>
                    <input
                      name="target"
                      type="number"
                      min="0.01"
                      step="0.01"
                      defaultValue={goal.target}
                      required
                    />
                  </label>
                  <label>
                    <span>Target date</span>
                    <input
                      name="target_date"
                      type="date"
                      defaultValue={goal.targetDate ?? ""}
                    />
                  </label>
                  <label>
                    <span>Priority</span>
                    <input
                      name="priority"
                      type="number"
                      min="1"
                      max="10000"
                      step="1"
                      defaultValue={goal.priority}
                    />
                  </label>
                  <button className="data-submit" type="submit">
                    Save goal
                  </button>
                </form>

                <form className="goal-delete-form" action={deleteGoal}>
                  <input type="hidden" name="goal_id" value={goal.id} />
                  <button type="submit">
                    <Trash2 size={13} />
                    Delete goal
                  </button>
                </form>
              </details>
            );
          })}
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">NEW GOAL</span>
            <h2>Add another household objective</h2>
            <p className="empty-copy">
              Priority uses smaller numbers first. A target date is optional, but dated goals can be
              converted into a required monthly contribution by V1.1.
            </p>
          </div>
        </div>

        <form className="goal-create-form" action={createGoal}>
          <label>
            <span>Goal name</span>
            <input name="name" placeholder="Vehicle replacement" required />
          </label>
          <label>
            <span>Current</span>
            <input name="current" type="number" min="0" step="0.01" defaultValue="0" required />
          </label>
          <label>
            <span>Target</span>
            <input name="target" type="number" min="0.01" step="0.01" placeholder="25000" required />
          </label>
          <label>
            <span>Target date</span>
            <input name="target_date" type="date" />
          </label>
          <label>
            <span>Priority</span>
            <input name="priority" type="number" min="1" max="10000" step="1" defaultValue="100" />
          </label>
          <button className="data-submit" type="submit">
            <Plus size={13} />
            Add goal
          </button>
        </form>

        <div className="plan-note">
          <CalendarClock size={15} />
          <span>
            Goal edits automatically recalculate Financial Health and the V1.1 Plan
            context on the next page load.
          </span>
        </div>
      </section>
    </div>
  );
}
