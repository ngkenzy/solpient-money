import PageHeader from "@/components/PageHeader";
import ScenarioLab from "@/components/ScenarioLab";
import { getFinancialHealth, getDebtPriority } from "@/lib/intelligence";
import { requireMoneyDataset } from "@/lib/money-data";

export const dynamic = "force-dynamic";

export default async function ScenarioLabPage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const plan = data.householdPlan;
  const health = getFinancialHealth({}, data);
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
        eyebrow="SCENARIO LAB"
        title="Test choices before you make them."
        description="Change one assumption at a time and see the deterministic consequence. This is not a forecast or personalized recommendation."
      />
      <ScenarioLab
        inputs={{
          currentAge: plan.demoCurrentAge,
          defaultRetirementAge: plan.targetRetirementAge,
          investedAssets: health.metrics.investments,
          bankCash: health.metrics.bankCash,
          propertyValue: health.metrics.propertyValue,
          monthlySavings: health.metrics.averageMonthlySavings,
          reserveTarget: health.metrics.reserveTarget,
          expectedAnnualReturnPct: plan.expectedAnnualReturnPct,
          debts,
        }}
      />
      <section className="card page-card scenario-note">
        <span className="card-kicker">MODEL BOUNDARY</span>
        <p>V0.5 does not model taxes, Social Security, pensions, future property appreciation, changing interest rates, sequence-of-returns risk, or inflation. The lab is designed to make mechanics visible rather than create false precision.</p>
      </section>
    </div>
  );
}
