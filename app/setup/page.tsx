import { Database, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getMoneyContext } from "@/lib/money-data";
import { createHouseholdWithDemoData } from "./actions";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const context = await getMoneyContext();

  if (!context.configured) {
    return (
      <div className="page">
        <section className="card setup-blocked">
          <Database size={26} />
          <div>
            <span className="card-kicker">SOLPIENT MONEY DATABASE</span>
            <h1>Dedicated Supabase project required</h1>
            <p>V0.5 is ready to connect, but the Money project environment variables are not configured. The current Supabase organization has reached its active free-project limit, so no personal financial data has been moved into another project.</p>
          </div>
        </section>
      </div>
    );
  }

  if (!context.authenticated) redirect("/login");
  if (context.household) redirect("/");

  return (
    <div className="page">
      <section className="setup-onboarding">
        <div>
          <span className="setup-shield"><ShieldCheck size={24} /></span>
          <div className="eyebrow">PRIVATE HOUSEHOLD SETUP</div>
          <h1>Create your Money household.</h1>
          <p>This creates a private household and imports the current synthetic demo model into your dedicated Money database. You can replace demo rows manually before Plaid is added.</p>
        </div>

        <form className="card setup-form" action={createHouseholdWithDemoData}>
          <label>
            <span>Household name</span>
            <input name="household_name" defaultValue="My Household" required maxLength={120} />
          </label>
          <div className="setup-points">
            <span>✓ Household-scoped RLS</span>
            <span>✓ Demo accounts and transactions</span>
            <span>✓ Demo holdings and goals</span>
            <span>✓ Planning assumptions and history</span>
          </div>
          <button className="primary-auth-button" type="submit">Create household & load demo data</button>
        </form>
      </section>
    </div>
  );
}
