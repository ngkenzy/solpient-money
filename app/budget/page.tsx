import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  PiggyBank,
  Plus,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/finance";
import { getBudgetOverview } from "@/lib/budget";
import { createBudget, deleteBudget, updateBudget } from "./actions";

export const dynamic = "force-dynamic";

function pctLabel(pct: number) {
  if (!Number.isFinite(pct)) return "—";
  return `${Math.round(pct)}%`;
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const overview = await getBudgetOverview(params.month ?? null);
  const {
    rows,
    months,
    monthLabels,
    selectedMonth,
    selectedLabel,
    observedCategories,
  } = overview;

  const monthIndex = months.indexOf(selectedMonth);
  const prevMonth = monthIndex >= 0 ? (months[monthIndex + 1] ?? null) : null;
  const nextMonth = monthIndex > 0 ? months[monthIndex - 1] : null;

  const overspent = rows
    .filter((row) => row.budgeted > 0 && row.actual > row.budgeted)
    .sort((a, b) => b.actual - b.budgeted - (a.actual - a.budgeted))
    .slice(0, 6);

  return (
    <div className="page">
      <PageHeader
        eyebrow="BUDGETING"
        title="Spend on purpose."
        description="Monthly category budgets compared against your categorized transactions. Actuals come from the same truth-engine categories as Cash Flow — transfers and duplicates are excluded."
      />

      <section className="card page-card">
        <div className="budget-month-bar">
          <div className="budget-month-nav">
            {prevMonth ? (
              <a
                className="text-button"
                href={`/budget?month=${prevMonth}`}
              >
                <ArrowLeft size={14} /> {monthLabels[prevMonth]}
              </a>
            ) : (
              <span />
            )}
            <strong>{selectedLabel}</strong>
            {nextMonth ? (
              <a
                className="text-button"
                href={`/budget?month=${nextMonth}`}
              >
                {monthLabels[nextMonth]} <ArrowRight size={14} />
              </a>
            ) : (
              <span />
            )}
          </div>
          <form className="budget-month-jump" method="get" action="/budget">
            <select name="month" defaultValue={selectedMonth}>
              {months.map((month) => (
                <option key={month} value={month}>
                  {monthLabels[month]}
                </option>
              ))}
            </select>
            <button className="data-submit" type="submit">
              View
            </button>
          </form>
        </div>
      </section>

      {rows.length ? (
        <>
          <div className="metric-grid budget-metric-grid">
            <div className="metric-card">
              <span>Budgeted</span>
              <strong>{money(overview.totalBudgeted)}</strong>
              <small>{selectedLabel}</small>
            </div>
            <div className="metric-card">
              <span>Spent</span>
              <strong>{money(overview.totalActual)}</strong>
              <small>
                {overview.totalBudgeted > 0
                  ? `${pctLabel((overview.totalActual / overview.totalBudgeted) * 100)} of budget`
                  : "No budget set"}
              </small>
            </div>
            <div className="metric-card">
              <span>Remaining</span>
              <strong
                className={
                  overview.totalRemaining < 0
                    ? "budget-negative"
                    : "budget-positive"
                }
              >
                {money(overview.totalRemaining)}
              </strong>
              <small>Across {rows.length} categories</small>
            </div>
          </div>

          {overspent.length ? (
            <section className="card page-card">
              <div className="section-title-row">
                <div>
                  <span className="card-kicker">OVER BUDGET</span>
                  <h2>Spending past the line</h2>
                </div>
              </div>
              <div className="cash-alert-list">
                {overspent.map((row) => {
                  const over = row.actual - row.budgeted;
                  return (
                    <div
                      className={`cash-alert-row ${over >= row.budgeted * 0.25 ? "high" : "watch"}`}
                      key={row.id}
                    >
                      <span className="cash-alert-icon">
                        <AlertTriangle size={15} />
                      </span>
                      <div>
                        <strong>{row.category} is over budget</strong>
                        <span>
                          {money(row.actual)} of {money(row.budgeted)} ·{" "}
                          {pctLabel(row.pct)} spent
                        </span>
                      </div>
                      <strong>{money(over)} over</strong>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="card page-card">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">CATEGORY BUDGETS</span>
                <h2>{selectedLabel} envelopes</h2>
                <p className="empty-copy">
                  Rollover categories carry unspent dollars into the next
                  month. Expand a row to change its amount.
                </p>
              </div>
            </div>

            <div className="budget-row-list">
              {rows.map((row) => (
                <details className="budget-row-card" key={row.id}>
                  <summary>
                    <div className="budget-row-main">
                      <div>
                        <strong>{row.category}</strong>
                        <span>
                          {row.rollover ? (
                            <em className="budget-rollover-badge">
                              Rollover
                              {row.rolloverAdded > 0
                                ? ` +${money(row.rolloverAdded)}`
                                : ""}
                            </em>
                          ) : null}
                        </span>
                      </div>
                      <div>
                        <span>Budgeted</span>
                        <strong>{money(row.budgeted)}</strong>
                      </div>
                      <div>
                        <span>Spent</span>
                        <strong>{money(row.actual)}</strong>
                      </div>
                      <div>
                        <span>Remaining</span>
                        <strong
                          className={
                            row.remaining < 0
                              ? "budget-negative"
                              : "budget-positive"
                          }
                        >
                          {money(row.remaining)}
                        </strong>
                      </div>
                      <div>
                        <span>{pctLabel(row.pct)}</span>
                      </div>
                    </div>
                    <div className="goal-track">
                      <span
                        className={row.pct > 100 ? "budget-bar-over" : ""}
                        style={{ width: `${Math.min(100, row.pct)}%` }}
                      />
                    </div>
                  </summary>

                  <form className="goal-edit-form" action={updateBudget}>
                    <input type="hidden" name="budget_id" value={row.id} />
                    <label>
                      <span>Monthly budget</span>
                      <input
                        name="monthly_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={row.baseBudget.toFixed(2)}
                        required
                      />
                    </label>
                    <label className="budget-check-label">
                      <input
                        type="checkbox"
                        name="rollover"
                        defaultChecked={row.rollover}
                      />
                      <span>Roll over unspent dollars to next month</span>
                    </label>
                    <button className="data-submit" type="submit">
                      Save budget
                    </button>
                  </form>

                  <form className="goal-delete-form" action={deleteBudget}>
                    <input type="hidden" name="budget_id" value={row.id} />
                    <button type="submit">
                      <Trash2 size={13} />
                      Delete budget
                    </button>
                  </form>
                </details>
              ))}
            </div>

            {overview.unbudgetedSpending > 0 ? (
              <div className="plan-note">
                <Wallet size={15} />
                <span>
                  {money(overview.unbudgetedSpending)} went to{" "}
                  {overview.unbudgetedCategories}{" "}
                  {overview.unbudgetedCategories === 1
                    ? "category"
                    : "categories"}{" "}
                  without a budget this month. Add a budget above to bring
                  it inside the plan.
                </span>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <section className="card page-card">
          <div className="cash-empty roomy">
            <PiggyBank size={29} />
            <strong>No budgets set yet</strong>
            <span>
              Set a monthly amount per spending category and Solpient will
              track actuals from your categorized transactions — no manual
              entry, no spreadsheets.
            </span>
          </div>
        </section>
      )}

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">NEW BUDGET</span>
            <h2>Add a category envelope</h2>
            <p className="empty-copy">
              The monthly amount repeats every month. Turn on rollover and
              unspent dollars carry forward instead of resetting.
            </p>
          </div>
        </div>

        <form className="goal-edit-form" action={createBudget}>
          <label>
            <span>Category</span>
            <input
              name="category"
              list="budget-category-options"
              placeholder="Groceries"
              required
              maxLength={80}
            />
            <datalist id="budget-category-options">
              {observedCategories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
          <label>
            <span>Monthly budget</span>
            <input
              name="monthly_amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="600"
              required
            />
          </label>
          <label className="budget-check-label">
            <input type="checkbox" name="rollover" />
            <span>Roll over unspent dollars to next month</span>
          </label>
          <button className="data-submit" type="submit">
            <Plus size={13} />
            Add budget
          </button>
        </form>

        <div className="plan-note">
          <ShieldCheck size={15} />
          <span>
            Budgets are planning targets only. Solpient never moves money —
            actuals are read from your imported transactions.
          </span>
        </div>
      </section>
    </div>
  );
}
