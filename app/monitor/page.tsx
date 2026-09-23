import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleGauge,
  CreditCard,
  Goal,
  PiggyBank,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import InteractiveLineChart from "@/components/InteractiveLineChart";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/finance";
import { getPlanMonitoring } from "@/lib/plan-monitor-engine";
import {
  refreshPlanMonitoring,
  resetPlanMonitoringBaseline,
} from "./actions";

export const dynamic = "force-dynamic";

function signedMoney(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${money(value)}`;
}

function signedMonths(value: number | null) {
  if (value == null) return "—";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${value} mo`;
}

function signalIcon(level: string) {
  if (level === "positive") return <CheckCircle2 size={16} />;
  return <TriangleAlert size={16} />;
}

function categoryIcon(category: string) {
  if (category === "debt") return <CreditCard size={16} />;
  if (category === "goal") return <Goal size={16} />;
  if (category === "retirement") return <PiggyBank size={16} />;
  if (category === "reserve") return <ShieldCheck size={16} />;
  if (category === "spending" || category === "surplus") {
    return <Wallet size={16} />;
  }
  return <Activity size={16} />;
}

export default async function MonitorPage() {
  const report = await getPlanMonitoring();
  const historyData = report.history.map((row) => ({
    label: row.month.slice(0, 7),
    surplus: row.plannedSurplus,
    debt: row.debtAllocation,
    goals: row.goalAllocation,
    retirement: row.retirementAllocation,
  }));

  return (
    <div className="page">
      <PageHeader
        eyebrow="V1.2 · CONTINUOUS PLAN MONITORING"
        title="Know when reality moves the plan."
        description="Solpient saves a monthly V1.1 plan baseline, compares reconciled transactions and current plan outputs against it, and surfaces only material behavior or schedule drift."
        action={
          <form action={refreshPlanMonitoring}>
            <button className="research-button" type="submit">
              Refresh monitoring <RefreshCw size={14} />
            </button>
          </form>
        }
      />

      <section className="card monitor-hero">
        <div className={"monitor-score " + (report.materialSignalCount ? "watch" : "healthy")}>
          <strong>{report.alignmentScore}</strong>
          <span>/100</span>
        </div>
        <div className="monitor-hero-copy">
          <span className="card-kicker">PLAN ALIGNMENT</span>
          <h2>
            {report.materialSignalCount
              ? `${report.materialSignalCount} material change${report.materialSignalCount === 1 ? "" : "s"}`
              : "On track"}
          </h2>
          <p>
            {report.monthLabel} is {report.progressPct.toFixed(0)}% complete. The saved
            baseline remains fixed unless you explicitly reset it.
          </p>
        </div>
        <div className="monitor-month-progress">
          <span>Month progress</span>
          <strong>
            Day {report.dayOfMonth} / {report.daysInMonth}
          </strong>
          <div>
            <span style={{ width: `${Math.min(100, report.progressPct)}%` }} />
          </div>
          <small>
            Baseline captured{" "}
            {new Date(report.baselineCapturedAt).toLocaleDateString("en-US")}
          </small>
        </div>
      </section>

      <section className="monitor-metric-grid">
        <div className="card monitor-metric">
          <Wallet size={18} />
          <span>Projected spending</span>
          <strong>{money(report.pace.spending.projectedMonthEnd)}</strong>
          <small>
            {signedMoney(report.pace.spending.projectedVariance)} vs{" "}
            {money(report.pace.spending.plannedMonth)} baseline
          </small>
        </div>
        <div className="card monitor-metric">
          <Activity size={18} />
          <span>Projected surplus</span>
          <strong>{money(report.pace.surplus.projectedMonthEnd)}</strong>
          <small>
            {signedMoney(report.pace.surplus.projectedVariance)} vs baseline
          </small>
        </div>
        <div className="card monitor-metric">
          <CreditCard size={18} />
          <span>Debt payoff drift</span>
          <strong>{signedMonths(report.drift.debtPayoffDeltaMonths)}</strong>
          <small>
            current {report.currentPlan.debtPayoffMonths ?? "—"} mo · baseline{" "}
            {report.baselinePlan.debtPayoffMonths ?? "—"} mo
          </small>
        </div>
        <div className="card monitor-metric">
          <PiggyBank size={18} />
          <span>Retirement requirement</span>
          <strong>{money(report.currentPlan.retirementRequiredMonthly)}/mo</strong>
          <small>
            {signedMoney(report.drift.retirementRequiredMonthlyDelta)} vs baseline
          </small>
        </div>
      </section>

      <section className="monitor-two-column">
        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">MATERIAL CHANGES</span>
              <h2>What deserves attention</h2>
              <p className="empty-copy">
                V1.2 ignores small fluctuations and highlights only changes that cross explicit
                dollar, percentage, or schedule thresholds.
              </p>
            </div>
          </div>

          <div className="monitor-signal-list">
            {report.signals.map((signal) => (
              <Link
                href={signal.href}
                className={"monitor-signal-row " + signal.level}
                key={signal.id}
              >
                <span className="monitor-signal-icon">
                  {signalIcon(signal.level)}
                </span>
                <span className="monitor-category-icon">
                  {categoryIcon(signal.category)}
                </span>
                <div>
                  <strong>{signal.title}</strong>
                  <span>{signal.detail}</span>
                </div>
                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </section>

        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">PLAN DRIFT</span>
              <h2>How the waterfall moved</h2>
            </div>
          </div>

          <div className="monitor-drift-list">
            <div>
              <span>Monthly surplus</span>
              <strong>{signedMoney(report.drift.monthlySurplusDelta)}</strong>
              <small>
                current {money(report.currentPlan.monthlySurplus)} · baseline{" "}
                {money(report.baselinePlan.monthlySurplus)}
              </small>
            </div>
            <div>
              <span>Reserve allocation</span>
              <strong>{signedMoney(report.drift.reserveAllocationDelta)}</strong>
              <small>
                current {money(report.currentPlan.reserveAllocation)}/mo
              </small>
            </div>
            <div>
              <span>Extra debt allocation</span>
              <strong>{signedMoney(report.drift.debtAllocationDelta)}</strong>
              <small>
                current {money(report.currentPlan.debtAllocation)}/mo
              </small>
            </div>
            <div>
              <span>Goal allocation</span>
              <strong>{signedMoney(report.drift.goalAllocationDelta)}</strong>
              <small>
                current {money(report.currentPlan.goalAllocation)}/mo
              </small>
            </div>
            <div>
              <span>Retirement allocation</span>
              <strong>{signedMoney(report.drift.retirementAllocationDelta)}</strong>
              <small>
                current {money(report.currentPlan.retirementAllocation)}/mo
              </small>
            </div>
            <div>
              <span>Flexible remainder</span>
              <strong>{signedMoney(report.drift.flexibleAllocationDelta)}</strong>
              <small>
                current {money(report.currentPlan.flexibleMonthly)}/mo
              </small>
            </div>
          </div>
        </section>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">GOAL MONITOR</span>
            <h2>Required monthly pace</h2>
            <p className="empty-copy">
              Goal drift changes only when the saved amount, target amount, date, or available plan
              capacity changes.
            </p>
          </div>
        </div>

        <div className="monitor-goal-list">
          {report.drift.goals.map((goal) => (
            <div className="monitor-goal-row" key={goal.id}>
              <div>
                <strong>{goal.name}</strong>
                <span>{goal.status.replaceAll("_", " ")}</span>
              </div>
              <div>
                <span>Baseline required</span>
                <strong>
                  {goal.baselineRequiredMonthly == null
                    ? "—"
                    : `${money(goal.baselineRequiredMonthly)}/mo`}
                </strong>
              </div>
              <div>
                <span>Current required</span>
                <strong>
                  {goal.currentRequiredMonthly == null
                    ? "—"
                    : `${money(goal.currentRequiredMonthly)}/mo`}
                </strong>
              </div>
              <div>
                <span>Change</span>
                <strong>
                  {goal.requiredMonthlyDelta == null
                    ? "—"
                    : signedMoney(goal.requiredMonthlyDelta)}
                </strong>
              </div>
            </div>
          ))}

          {!report.drift.goals.length ? (
            <div className="monitor-empty">
              <Goal size={24} />
              <strong>No active dated-goal drift to display</strong>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">MONTHLY BASELINE HISTORY</span>
            <h2>How the plan itself changes over time</h2>
            <p className="empty-copy">
              One baseline is stored per month. This history becomes more useful as additional
              monthly cycles accumulate.
            </p>
          </div>
        </div>

        {historyData.length > 1 ? (
          <InteractiveLineChart
            data={historyData}
            series={[
              { key: "surplus", label: "Planned surplus", format: "currency" },
              { key: "debt", label: "Extra debt", format: "currency" },
              { key: "goals", label: "Goals", format: "currency" },
            ]}
            defaultRange="ALL"
            height={250}
          />
        ) : (
          <div className="monitor-empty roomy">
            <CalendarClock size={26} />
            <strong>{report.monthLabel} is the first stored baseline</strong>
            <span>
              Future months will add comparison history automatically when monitoring is opened.
            </span>
          </div>
        )}
      </section>

      <section className="card monitor-baseline-control">
        <div>
          <span className="card-kicker">BASELINE CONTROL</span>
          <h2>Reset only after an intentional plan change.</h2>
          <p>
            Normal transactions do not rewrite the saved baseline. Resetting captures the current
            V1.1 plan as the new {report.monthLabel} reference point.
          </p>
        </div>
        <form action={resetPlanMonitoringBaseline}>
          <button type="submit">
            <RotateCcw size={14} />
            Reset monthly baseline
          </button>
        </form>
        <span>
          Reset count this month: <strong>{report.baselineResetCount}</strong>
        </span>
      </section>

      <section className="monitor-method-note">
        <CircleGauge size={15} />
        <span>
          Alignment starts at 100. Watch signals subtract 10 points and critical signals subtract
          22. Current-month pace is ignored until at least 20% of the month has elapsed. The score
          is a monitoring aid, not a credit score or investment recommendation.
        </span>
      </section>
    </div>
  );
}
