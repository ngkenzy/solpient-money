import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  Gauge,
  PiggyBank,
  ShieldCheck,
  Target,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getCashFlowIntelligence } from "@/lib/cash-flow-intelligence";
import { buildFinancialHealthEngine } from "@/lib/financial-health-engine";
import { money } from "@/lib/finance";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function statusLabel(status: string) {
  if (status === "healthy") return "Healthy";
  if (status === "critical") return "Critical";
  return "Review";
}

function componentIcon(key: string) {
  if (key === "liquidity") return <WalletCards size={18} />;
  if (key === "cashflow") return <Banknote size={18} />;
  if (key === "debt") return <CreditCard size={18} />;
  if (key === "portfolio") return <Gauge size={18} />;
  if (key === "retirement") return <PiggyBank size={18} />;
  return <Target size={18} />;
}

export default async function HealthPage() {
  const context = await requireMoneyDataset();
  const cashFlow = await getCashFlowIntelligence();
  const health = buildFinancialHealthEngine(
    context.dataset,
    cashFlow
  );
  const m = health.metrics;

  return (
    <div className="page">
      <PageHeader
        eyebrow="V0.9.3 · FINANCIAL HEALTH ENGINE"
        title="One view of household financial health."
        description="Liquidity, cash flow, debt, portfolio structure, retirement trajectory, and tracked goals are combined into a transparent household score. Solpient Research is intentionally excluded from this score."
      />

      <section className="health-engine-hero card">
        <div className={"health-engine-score " + health.status}>
          <strong>{health.score}</strong>
          <span>/100</span>
        </div>
        <div className="health-engine-copy">
          <span className="card-kicker">HOUSEHOLD FINANCIAL HEALTH</span>
          <h2>{statusLabel(health.status)}</h2>
          <p>
            Every point is traceable to household data and visible formulas.
            This is a review framework, not a credit score or investment recommendation.
          </p>
        </div>
        <div className="health-engine-networth">
          <span>Net worth</span>
          <strong>{money(m.netWorth)}</strong>
          <small>
            {money(m.assets)} assets · {money(m.liabilities)} liabilities
          </small>
        </div>
      </section>

      <section className="health-engine-metrics">
        <div className="card health-engine-metric">
          <ShieldCheck size={18} />
          <span>Emergency reserve</span>
          <strong>{m.emergencyFundMonths.toFixed(1)} mo</strong>
          <small>
            target {context.dataset.householdPlan.emergencyFundTargetMonths} months
          </small>
        </div>
        <div className="card health-engine-metric">
          <Banknote size={18} />
          <span>Savings rate</span>
          <strong>{pct(m.savingsRate)}</strong>
          <small>{pct(m.incomeStabilityPct)} income stability</small>
        </div>
        <div className="card health-engine-metric">
          <CreditCard size={18} />
          <span>Debt service</span>
          <strong>{pct(m.debtServiceRatioPct)}</strong>
          <small>{money(m.highInterestDebt)} high-interest balance</small>
        </div>
        <div className="card health-engine-metric">
          <PiggyBank size={18} />
          <span>Retirement funding</span>
          <strong>{m.retirementFundingPct.toFixed(0)}%</strong>
          <small>
            projected {money(m.retirementProjectedAssets)}
          </small>
        </div>
      </section>

      <section className="health-engine-component-grid">
        {health.components.map((component) => (
          <section className="card health-engine-component" key={component.key}>
            <div className="health-engine-component-head">
              <span className={"health-engine-component-icon " + component.status}>
                {componentIcon(component.key)}
              </span>
              <div>
                <span>{component.label}</span>
                <strong>
                  {component.score.toFixed(0)} / {component.maxScore}
                </strong>
              </div>
              <span className={"health-engine-status " + component.status}>
                {statusLabel(component.status)}
              </span>
            </div>

            <div className="health-engine-bar">
              <span
                className={component.status}
                style={{
                  width: `${Math.min(
                    100,
                    (component.score / component.maxScore) * 100
                  )}%`,
                }}
              />
            </div>

            <p>{component.detail}</p>

            <details className="health-engine-details">
              <summary>Show calculation</summary>
              <div>
                <span>Formula</span>
                <p>{component.calculation}</p>
              </div>
              <ul>
                {component.inputs.map((input) => (
                  <li key={input}>{input}</li>
                ))}
              </ul>
            </details>

            <Link className="health-engine-link" href={component.href}>
              Open detail <ArrowRight size={13} />
            </Link>
          </section>
        ))}
      </section>

      <section className="health-engine-two-column">
        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">RESILIENCE</span>
              <h2>Balance-sheet and cash-flow capacity</h2>
            </div>
          </div>
          <div className="health-engine-facts">
            <div>
              <span>Bank cash</span>
              <strong>{money(m.bankCash)}</strong>
              <small>{m.emergencyFundMonths.toFixed(1)} months of spending</small>
            </div>
            <div>
              <span>Reserve gap</span>
              <strong>{money(m.reserveGap)}</strong>
              <small>against configured reserve target</small>
            </div>
            <div>
              <span>Debt / assets</span>
              <strong>{pct(m.debtToAssetsPct)}</strong>
              <small>{money(m.annualizedDebtInterest)} annualized interest</small>
            </div>
            <div>
              <span>Fixed-cost ratio</span>
              <strong>{pct(m.fixedCostRatioPct)}</strong>
              <small>recurring bills and subscriptions vs income</small>
            </div>
          </div>
        </section>

        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">LONG-TERM POSITION</span>
              <h2>Portfolio and retirement trajectory</h2>
            </div>
          </div>
          <div className="health-engine-facts">
            <div>
              <span>Invested assets</span>
              <strong>{money(m.investments)}</strong>
              <small>{pct(m.portfolioCashPct)} portfolio cash</small>
            </div>
            <div>
              <span>Largest direct stock</span>
              <strong>
                {m.largestStockTicker ?? "—"} {pct(m.largestStockPct)}
              </strong>
              <small>{pct(m.topThreeStockPct)} in top three stocks</small>
            </div>
            <div>
              <span>Retirement projection</span>
              <strong>{money(m.retirementProjectedAssets)}</strong>
              <small>
                target {money(m.retirementTargetAssets)} in {m.retirementYears} years
              </small>
            </div>
            <div>
              <span>Tracked goals</span>
              <strong>{m.averageGoalFundingPct.toFixed(0)}%</strong>
              <small>average capped funding ratio</small>
            </div>
          </div>
        </section>
      </section>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">WHAT DESERVES REVIEW</span>
            <h2>Health-engine attention queue</h2>
          </div>
          <span className="small-muted">{health.attention.length} current items</span>
        </div>

        <div className="health-engine-attention">
          {health.attention.map((item) => (
            <Link
              className={"health-engine-attention-row " + item.level}
              href={item.href}
              key={item.id}
            >
              <span className="health-engine-attention-icon">
                {item.level === "positive" ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <TriangleAlert size={16} />
                )}
              </span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
              <ArrowRight size={14} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
