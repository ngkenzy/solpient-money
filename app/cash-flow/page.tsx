import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import InteractiveLineChart from "@/components/InteractiveLineChart";
import PageHeader from "@/components/PageHeader";
import { getCashFlowIntelligence } from "@/lib/cash-flow-intelligence";
import { money } from "@/lib/finance";

export const dynamic = "force-dynamic";

function pct(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(0)}%`;
}

function signedPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "New";
  return `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
}

function cadenceLabel(value: string) {
  if (value === "biweekly") return "Every 2 weeks";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function CashFlowPage() {
  const intelligence = await getCashFlowIntelligence();
  const { health } = intelligence;
  const recurringExpenses = intelligence.recurring.filter(
    (item) => item.kind !== "income"
  );
  const recurringIncome = intelligence.recurring.filter(
    (item) => item.kind === "income"
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="V0.9.2 · CASH-FLOW INTELLIGENCE"
        title="Understand where the money really goes."
        description="Reconciled transactions are converted into recurring income, fixed obligations, subscriptions, category trends, savings rates, and unusual-spending signals. Transfers and confirmed duplicates are excluded."
      />

      <section className="cash-intel-hero card">
        <div className="cash-intel-hero-icon">
          <CircleDollarSign size={27} />
        </div>
        <div>
          <span className="card-kicker">{health.latestMonth.toUpperCase()} CASH POSITION</span>
          <h2>{money(health.latestSaved)} saved</h2>
          <p>
            {money(health.latestIncome)} income · {money(health.latestSpending)} spending ·{" "}
            {pct(health.latestSavingsRate)} savings rate
          </p>
        </div>
        <div className="cash-intel-health">
          <span>Trailing savings rate</span>
          <strong>{pct(health.trailingSavingsRate)}</strong>
          <small>{health.monthsObserved} months observed</small>
        </div>
      </section>

      <section className="cash-intel-metric-grid">
        <div className="card cash-intel-metric">
          <CalendarClock size={18} />
          <span>Recurring income</span>
          <strong>{money(health.recurringIncomeMonthly)}</strong>
          <small>estimated monthly equivalent</small>
        </div>
        <div className="card cash-intel-metric">
          <Repeat2 size={18} />
          <span>Recurring bills</span>
          <strong>{money(health.recurringBillsMonthly)}</strong>
          <small>{pct(health.fixedCostRatioPct)} of recurring/latest income</small>
        </div>
        <div className="card cash-intel-metric">
          <Sparkles size={18} />
          <span>Subscriptions</span>
          <strong>{money(health.subscriptionsMonthly)}</strong>
          <small>stable monthly recurring charges</small>
        </div>
        <div className="card cash-intel-metric">
          <Wallet size={18} />
          <span>Discretionary spend</span>
          <strong>{money(health.discretionarySpending)}</strong>
          <small>latest spending less recurring obligations</small>
        </div>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">12-MONTH TREND</span>
            <h2>Income vs spending</h2>
            <p className="empty-copy">
              Internal transfers and reconciled duplicate transactions do not count as income or spending.
            </p>
          </div>
          <div className="cash-stability-pill">
            <ShieldCheck size={14} />
            Income stability {pct(health.incomeStabilityPct)}
          </div>
        </div>
        <InteractiveLineChart
          data={intelligence.monthly}
          series={[
            { key: "income", label: "Income", format: "currency" },
            { key: "spending", label: "Spending", format: "currency" },
          ]}
          defaultRange="ALL"
          height={270}
        />
      </section>

      <section className="cash-intel-two-column">
        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">RECURRING MONEY</span>
              <h2>Income and obligations detected</h2>
              <p className="empty-copy">
                Repetition requires multiple observations with consistent timing and amounts.
              </p>
            </div>
          </div>

          <div className="cash-recurring-list">
            {[...recurringIncome, ...recurringExpenses].slice(0, 16).map((item) => (
              <div className="cash-recurring-row" key={item.key}>
                <span className={`cash-recurring-icon ${item.kind}`}>
                  {item.kind === "income" ? (
                    <ArrowUpRight size={15} />
                  ) : item.kind === "subscription" ? (
                    <Sparkles size={15} />
                  ) : (
                    <ArrowDownRight size={15} />
                  )}
                </span>
                <div>
                  <strong>{item.merchant}</strong>
                  <span>
                    {item.category} · {cadenceLabel(item.cadence)} · {item.occurrences} observations
                  </span>
                </div>
                <div className="cash-recurring-amount">
                  <strong>{money(item.monthlyEquivalent)}/mo</strong>
                  <span>{item.amountVariationPct.toFixed(0)}% amount variation</span>
                </div>
              </div>
            ))}

            {!intelligence.recurring.length ? (
              <div className="cash-empty">
                <Repeat2 size={25} />
                <strong>Not enough repeated transactions yet</strong>
                <span>Recurring patterns appear after at least two consistent observations.</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">{health.latestMonth.toUpperCase()} SPENDING</span>
              <h2>Where spending is concentrated</h2>
            </div>
          </div>

          <div className="cash-category-list">
            {intelligence.categories.slice(0, 10).map((category) => (
              <div className="cash-category-row" key={category.category}>
                <div>
                  <strong>{category.category}</strong>
                  <span>
                    {category.sharePct.toFixed(0)}% of spending ·{" "}
                    <em className={(category.changePct ?? 0) > 25 ? "up" : ""}>
                      {signedPct(category.changePct)} vs recent avg
                    </em>
                  </span>
                </div>
                <strong>{money(category.amount)}</strong>
                <div className="cash-category-track">
                  <span style={{ width: `${Math.min(100, category.sharePct)}%` }} />
                </div>
              </div>
            ))}

            {!intelligence.categories.length ? (
              <div className="cash-empty">
                <Wallet size={25} />
                <strong>No expense categories available</strong>
              </div>
            ) : null}
          </div>
        </section>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">SPENDING WATCH</span>
            <h2>Changes worth reviewing</h2>
            <p className="empty-copy">
              Deterministic flags compare current behavior with your own recent history rather than generic spending limits.
            </p>
          </div>
          <span className={"cash-alert-count" + (intelligence.alerts.length ? " active" : "")}>
            {intelligence.alerts.length} signals
          </span>
        </div>

        {intelligence.alerts.length ? (
          <div className="cash-alert-list">
            {intelligence.alerts.map((alert) => (
              <div className={`cash-alert-row ${alert.level}`} key={alert.id}>
                <span className="cash-alert-icon">
                  <AlertTriangle size={15} />
                </span>
                <div>
                  <strong>{alert.title}</strong>
                  <span>
                    {alert.detail}
                    {alert.date ? ` · ${alert.date}` : ""}
                  </span>
                </div>
                <strong>{money(alert.amount)} above baseline</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="cash-empty roomy">
            <ShieldCheck size={29} />
            <strong>No unusual spending signals in the latest month</strong>
            <span>
              Solpient compared current category and merchant spending with available household history.
            </span>
          </div>
        )}
      </section>

      <section className="cash-method-note">
        <ShieldCheck size={15} />
        <span>
          Based on {intelligence.transactionCount} reconciled income/expense transactions. Recurring detection uses cadence and amount consistency; unusual spending uses your own historical baselines.
        </span>
      </section>
    </div>
  );
}
