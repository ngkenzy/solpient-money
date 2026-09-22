import PageHeader from "@/components/PageHeader";
import ScenarioLab from "@/components/ScenarioLab";
import { accounts, householdPlan } from "@/lib/demo-data";
import { getFinancialHealth, getDebtPriority } from "@/lib/intelligence";

export default function ScenarioLabPage() {
  const health = getFinancialHealth();
  const debts = getDebtPriority().map((debt) => ({
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
        description="Change one assumption at a time and see the deterministic consequence. Household values are synthetic demo data; this is not a forecast or personalized recommendation."
      />
      <ScenarioLab
        inputs={{
          currentAge: householdPlan.demoCurrentAge,
          defaultRetirementAge: householdPlan.targetRetirementAge,
          investedAssets: health.metrics.investments,
          bankCash: health.metrics.bankCash,
          propertyValue: health.metrics.propertyValue,
          monthlySavings: health.metrics.averageMonthlySavings,
          reserveTarget: health.metrics.reserveTarget,
          expectedAnnualReturnPct: householdPlan.expectedAnnualReturnPct,
          debts,
        }}
      />
      <section className="card page-card scenario-note">
        <span className="card-kicker">MODEL BOUNDARY</span>
        <p>
          V0.4 intentionally does not model taxes, Social Security, pensions, future property appreciation,
          changing interest rates, sequence-of-returns risk, or inflation. Those belong in a later retirement
          model. The current lab is designed to make the mechanics visible rather than create false precision.
        </p>
      </section>
    </div>
  );
}
