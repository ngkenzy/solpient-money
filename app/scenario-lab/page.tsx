import PageHeader from "@/components/PageHeader";
import ScenarioLab from "@/components/ScenarioLab";
import { getCashFlowIntelligence } from "@/lib/cash-flow-intelligence";
import { buildFinancialHealthEngine } from "@/lib/financial-health-engine";
import { getDebtPriority } from "@/lib/intelligence";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export default async function ScenarioLabPage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const plan = data.householdPlan;
  const cashFlow = await getCashFlowIntelligence();
  const health = buildFinancialHealthEngine(data, cashFlow);

  const monthlyIncome = average(
    cashFlow.monthly.map((month) => month.income)
  );
  const monthlySpending = average(
    cashFlow.monthly.map((month) => month.spending)
  );

  const debts = getDebtPriority(data).map((debt) => ({
    id: debt.id,
    name: debt.name,
    balance: debt.balance,
    apr: debt.apr,
    minimumPayment: debt.minimumPayment,
  }));

  return (
    <div className="page">
      <PageHeader
        eyebrow="V0.9.4 · FORECAST & SCENARIO ENGINE"
        title="See the mechanics before making a financial choice."
        description="Forecast the next 12 months, stress household assumptions, compare the same surplus kept in cash versus invested versus sent to debt, and inspect every modeling boundary."
      />

      <ScenarioLab
        inputs={{
          investedAssets: health.metrics.investments,
          bankCash: health.metrics.bankCash,
          propertyValue: health.metrics.propertyValue,
          monthlyIncome,
          monthlySpending,
          reserveTarget: health.metrics.reserveTarget,
          expectedAnnualReturnPct: plan.expectedAnnualReturnPct,
          debts,
        }}
      />

      <section className="card page-card scenario-note">
        <span className="card-kicker">MODEL BOUNDARY</span>
        <p>
          V0.9.4 is deterministic scenario analysis, not a prediction engine. It holds property
          value constant and does not model taxes, inflation, Social Security, pensions, future
          borrowing, changing interest rates, or the sequence of real market returns. Return bands
          are assumption ranges, not probabilities.
        </p>
      </section>
    </div>
  );
}
