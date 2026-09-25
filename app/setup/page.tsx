import { Database, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getMoneyContext } from "@/lib/money-data";
import { createHouseholdEmpty, createHouseholdWithDemoData } from "./actions";

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
            <h1>Local PostgreSQL setup required</h1>
            <p>Solpient Money is configured for local PostgreSQL. Run npm run local:setup to create the Docker database, apply the schema, and keep Money data on this Mac.</p>
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
          <p>Two ways to start. Explore first with realistic demo data you can delete anytime — or skip straight to importing your own bank and brokerage files.</p>
        </div>

        <form className="card setup-form" action={createHouseholdWithDemoData}>
          <label>
            <span>Household name</span>
            <input name="household_name" defaultValue="My Household" required maxLength={120} />
          </label>
          <div className="setup-points">
            <span>✓ Local PostgreSQL household</span>
            <span>✓ Demo accounts and transactions</span>
            <span>✓ Demo holdings and goals</span>
            <span>✓ Planning assumptions and history</span>
          </div>
          <button className="primary-auth-button" type="submit">Create household & explore demo data</button>
          <button className="text-button" type="submit" formAction={createHouseholdEmpty}>
            Skip demo — create empty household & import my files
          </button>
        </form>
      </section>
    </div>
  );
}
