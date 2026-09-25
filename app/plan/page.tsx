import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  Goal,
  PiggyBank,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getCashFlowIntelligence } from "@/lib/cash-flow-intelligence";
import {
  buildHouseholdFinancialPlan,
  type PlanLineKind,
} from "@/lib/financial-plan-engine";
import { money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";
import { updatePlanPolicy } from "./actions";

export const dynamic = "force-dynamic";

function lineIcon(kind: PlanLineKind) {
  if (kind === "reserve") return <ShieldCheck size={17} />;
  if (kind === "high_interest_debt") return <CreditCard size={17} />;
  if (kind === "goal") return <Goal size={17} />;
  if (kind === "retirement") return <PiggyBank size={17} />;
  return <Wallet size={17} />;
}

function lineHref(kind: PlanLineKind) {
  if (kind === "reserve") return "/accounts";
  if (kind === "high_interest_debt") return "/plan#debt-payoff";
  if (kind === "goal") return "/goals";
  if (kind === "retirement") return "/plan#plan-lines";
  return "/cash-flow";
}

function statusLabel(status: string) {
  if (status === "on_track") return "On track";
  if (status === "complete") return "Complete";
  if (status === "unfunded") return "Unfunded";
  return "Fund";
}

function formatDate(value: string | null) {
  if (!value) return "No target date";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function payoffLabel(months: number | null) {
  if (months === 0) return "Paid";
  if (months == null) return "Beyond model";
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder ? `${years} yr ${remainder} mo` : `${years} yr`;
}

export default async function PlanPage() {
  const context = await requireMoneyDataset();
  const cashFlow = await getCashFlowIntelligence();
  const plan = buildHouseholdFinancialPlan(
    context.dataset,
    cashFlow
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="FINANCIAL PLAN"
        title="Give the next dollar a job."
        description="Solpient converts the observed monthly surplus into a transparent household plan: reserve catch-up, high-interest debt, dated goals, retirement funding, then flexible cash. Each dollar is allocated once."
        action={
          <div className="plan-header-actions">
            <Link className="research-button" href="/monitor">
              Monitor plan <ArrowRight size={14} />
            </Link>
          </div>
        }
      />

      <section className="card plan-hero">
        <span className="plan-hero-icon">
          <CircleDollarSign size={26} />
        </span>
        <div>
          <span className="card-kicker">MONTHLY PLAN</span>
          <h2>{money(plan.monthlySurplus)} available surplus</h2>
          <p>
            Based on {money(plan.monthlyIncome)} average income less{" "}
            {money(plan.monthlySpending)} average spending.
          </p>
        </div>
        <div className="plan-hero-allocation">
          <span>Assigned to measurable priorities</span>
          <strong>{money(plan.allocatedMonthly)}</strong>
          <small>{money(plan.flexibleMonthly)} remains flexible</small>
        </div>
      </section>

      <section className="plan-metric-grid">
        <div className="card plan-metric">
          <ShieldCheck size={18} />
          <span>Reserve</span>
          <strong>{money(plan.reserveAllocation)}/mo</strong>
          <small>12-month catch-up policy</small>
        </div>
        <div className="card plan-metric">
          <CreditCard size={18} />
          <span>Extra debt</span>
          <strong>{money(plan.debtAllocation)}/mo</strong>
          <small>{money(plan.debtInterestSaved)} modeled interest saved</small>
        </div>
        <div className="card plan-metric">
          <Goal size={18} />
          <span>Dated goals</span>
          <strong>{money(plan.goalAllocation)}/mo</strong>
          <small>deadline-based required contributions</small>
        </div>
        <div className="card plan-metric">
          <PiggyBank size={18} />
          <span>Retirement</span>
          <strong>{money(plan.retirementAllocation)}/mo</strong>
          <small>
            required {money(plan.retirementRequiredMonthly)}/mo under current assumptions
          </small>
        </div>
      </section>

      <section className="card page-card" id="plan-lines">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">PRIORITY WATERFALL</span>
            <h2>Where the monthly surplus goes</h2>
            <p className="empty-copy">
              Priority determines sequence, but each measurable target receives only the amount its
              current rule requires. Remaining surplus then flows to the next line.
            </p>
          </div>
          <span className="small-muted">As of {plan.asOf}</span>
        </div>

        <div className="plan-line-list">
          {plan.planLines.map((line) => (
            <article className="plan-line" key={line.id}>
              <span className={"plan-line-rank " + line.status}>{line.priority}</span>
              <span className={"plan-line-icon " + line.kind}>
                {lineIcon(line.kind)}
              </span>
              <div className="plan-line-main">
                <div className="plan-line-title">
                  <strong>{line.title}</strong>
                  <span className={"plan-line-status " + line.status}>
                    {statusLabel(line.status)}
                  </span>
                </div>
                <span>
                  {line.target != null
                    ? `${money(line.current)} current · ${money(line.target)} target`
                    : "No fixed target"}
                  {line.targetDate ? ` · ${formatDate(line.targetDate)}` : ""}
                </span>
                <p>{line.why}</p>
                <details>
                  <summary>What changes this?</summary>
                  <span>{line.changesWhen}</span>
                </details>
              </div>
              <div className="plan-line-money">
                <strong>{money(line.monthlyAllocation)}/mo</strong>
                <span>
                  {line.estimatedCompletionMonths == null
                    ? "No completion estimate"
                    : line.estimatedCompletionMonths === 0
                      ? "Target satisfied"
                      : `~${payoffLabel(line.estimatedCompletionMonths)}`}
                </span>
                <Link href={lineHref(line.kind)}>
                  Open detail <ArrowRight size={12} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="plan-two-column">
        <section className="card page-card" id="debt-payoff">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">DEBT PAYOFF PLAN</span>
              <h2>Minimums roll forward automatically</h2>
              <p className="empty-copy">
                When a debt is paid off, its old minimum payment remains inside the household debt
                budget and rolls to the highest-APR remaining balance.
              </p>
            </div>
          </div>

          <div className="plan-debt-list">
            {plan.debtSchedule.map((debt, index) => (
              <div className="plan-debt-row" key={debt.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{debt.name}</strong>
                  <small>
                    {debt.apr.toFixed(2)}% APR · {money(debt.minimumPayment)} minimum
                  </small>
                </div>
                <div>
                  <span>Starting balance</span>
                  <strong>{money(debt.startingBalance)}</strong>
                </div>
                <div>
                  <span>Modeled payoff</span>
                  <strong>{payoffLabel(debt.payoffMonth)}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="plan-note">
            <CreditCard size={15} />
            <span>
              With the plan allocation, all tracked debt is modeled at{" "}
              {payoffLabel(plan.debtPayoffMonths)} versus{" "}
              {payoffLabel(plan.baselineDebtPayoffMonths)} using only the current minimum-payment
              budget.
            </span>
          </div>
        </section>

        <section className="card page-card" id="goal-funding">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">GOAL FUNDING</span>
              <h2>Deadlines become monthly requirements</h2>
              <p className="empty-copy">
                Solpient does not invent a monthly requirement for an undated goal.
              </p>
            </div>
            <Link className="text-button" href="/goals">
              Manage goals <ArrowRight size={14} />
            </Link>
          </div>

          <div className="plan-goal-list">
            {plan.goals.map((goal) => (
              <div className="plan-goal-row" key={goal.id}>
                <div>
                  <strong>{goal.name}</strong>
                  <span>
                    {money(goal.current)} / {money(goal.target)} ·{" "}
                    {formatDate(goal.targetDate)}
                  </span>
                </div>
                <div>
                  <span>Required</span>
                  <strong>
                    {goal.requiredMonthly == null
                      ? "—"
                      : `${money(goal.requiredMonthly)}/mo`}
                  </strong>
                </div>
                <div>
                  <span>Planned</span>
                  <strong>{money(goal.plannedMonthly)}/mo</strong>
                </div>
                <span
                  className={
                    "plan-goal-state " +
                    (goal.onTrack === true
                      ? "good"
                      : goal.onTrack === false
                        ? "warn"
                        : "neutral")
                  }
                >
                  {goal.onTrack === true
                    ? "On track"
                    : goal.onTrack === false
                      ? "Funding gap"
                      : "Needs date"}
                </span>
              </div>
            ))}

            {!plan.goals.length ? (
              <div className="plan-empty">
                <CalendarClock size={24} />
                <strong>No unfunded non-reserve goals</strong>
              </div>
            ) : null}
          </div>
        </section>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">HOUSEHOLD POLICY</span>
            <h2>The rules behind the plan</h2>
            <p className="empty-copy">
              Household assumptions are editable. Engine policies such as the 12-month reserve
              catch-up and high-interest payoff horizon remain explicit system rules.
            </p>
          </div>
        </div>

        <div className="plan-policy-grid">
          {plan.policies.map((policy) => (
            <div key={policy.label}>
              <span>{policy.label}</span>
              <strong>{policy.value}</strong>
              <small>{policy.source}</small>
            </div>
          ))}
        </div>

        <form className="plan-policy-form" action={updatePlanPolicy}>
          <label>
            <span>Emergency reserve months</span>
            <input
              name="emergency_fund_target_months"
              type="number"
              min="0"
              max="60"
              step="0.5"
              defaultValue={context.dataset.householdPlan.emergencyFundTargetMonths}
              required
            />
          </label>
          <label>
            <span>High-interest APR threshold</span>
            <input
              name="high_interest_debt_apr_pct"
              type="number"
              min="0"
              max="100"
              step="0.1"
              defaultValue={context.dataset.householdPlan.highInterestDebtAprPct}
              required
            />
          </label>
          <label>
            <span>Target retirement age</span>
            <input
              name="target_retirement_age"
              type="number"
              min="19"
              max="100"
              step="1"
              defaultValue={context.dataset.householdPlan.targetRetirementAge}
              required
            />
          </label>
          <label>
            <span>Expected annual return %</span>
            <input
              name="expected_annual_return_pct"
              type="number"
              min="-50"
              max="50"
              step="0.1"
              defaultValue={context.dataset.householdPlan.expectedAnnualReturnPct}
              required
            />
          </label>
          <label>
            <span>Retirement target</span>
            <input
              name="target_retirement_assets"
              type="number"
              min="0"
              step="1000"
              defaultValue={context.dataset.householdPlan.targetRetirementAssets}
              required
            />
          </label>
          <button className="data-submit" type="submit">
            Save household policy
          </button>
        </form>
      </section>
    </div>
  );
}
