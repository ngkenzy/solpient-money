import Link from "next/link";
import { Database, LogOut, PlusCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { requireMoneyDataset } from "@/lib/money-data";
import { money } from "@/lib/finance";
import {
  addAccount,
  addGoal,
  addHolding,
  addTransaction,
  updatePlanning,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const persistent = context.source === "database";

  return (
    <div className="page">
      <PageHeader
        eyebrow="MONEY DATA"
        title={persistent ? context.household?.name ?? "Household data" : "Demo data mode"}
        description={
          persistent
            ? "Authenticated household data is being read from the dedicated Solpient Money database. Manual entry is available before Plaid."
            : "The dedicated Money Supabase project is not connected yet. The application is running against deterministic demo data and persistence controls are disabled."
        }
        action={
          persistent ? (
            <Link className="research-button" href="/logout"><LogOut size={14} /> Sign out</Link>
          ) : (
            <span className="live-pill disconnected">DATABASE NOT CONNECTED</span>
          )
        }
      />

      <section className="card page-card data-status-card">
        <Database size={22} />
        <div>
          <strong>{persistent ? "Private household database active" : "Persistence pending Supabase project slot"}</strong>
          <span>
            {persistent
              ? `${data.accounts.length} accounts · ${data.transactions.length} transactions · ${data.holdings.length} holdings · ${data.householdGoals.length} goals`
              : "No personal financial data has been stored in Solpient Research or another database."}
          </span>
        </div>
      </section>

      {persistent ? (
        <>
          <div className="data-form-grid">
            <form className="card data-form" action={addAccount}>
              <div className="data-form-title"><PlusCircle size={17} /><strong>Add account</strong></div>
              <input name="name" placeholder="Account name" required />
              <input name="institution" placeholder="Institution" />
              <select name="account_type" defaultValue="cash">
                <option value="cash">Cash</option>
                <option value="investment">Investment</option>
                <option value="retirement">Retirement</option>
                <option value="property">Property</option>
                <option value="debt">Debt</option>
              </select>
              <input name="balance" type="number" step="0.01" placeholder="Balance (debt may be negative)" required />
              <select name="owner_scope" defaultValue="Household">
                <option>Household</option><option>Primary</option><option>Joint</option>
              </select>
              <input name="last_four" maxLength={8} placeholder="Last four / label" />
              <div className="split-inputs">
                <input name="apr" type="number" step="0.01" placeholder="APR % if debt" />
                <input name="minimum_payment" type="number" step="0.01" placeholder="Minimum payment" />
              </div>
              <button className="data-submit">Add account</button>
            </form>

            <form className="card data-form" action={addTransaction}>
              <div className="data-form-title"><PlusCircle size={17} /><strong>Add transaction</strong></div>
              <input name="posted_at" type="date" required />
              <input name="merchant" placeholder="Merchant / description" required />
              <input name="category" placeholder="Category" />
              <select name="account_id" defaultValue="">
                <option value="">Unassigned account</option>
                {data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <select name="transaction_type" defaultValue="expense">
                <option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option>
              </select>
              <input name="amount" type="number" min="0" step="0.01" placeholder="Positive amount" required />
              <button className="data-submit">Add transaction</button>
            </form>

            <form className="card data-form" action={addHolding}>
              <div className="data-form-title"><PlusCircle size={17} /><strong>Add holding</strong></div>
              <div className="split-inputs">
                <input name="ticker" placeholder="Ticker" required />
                <select name="holding_kind" defaultValue="stock">
                  <option value="stock">Stock</option><option value="etf">ETF</option><option value="bond">Bond</option><option value="cash">Cash</option>
                </select>
              </div>
              <input name="name" placeholder="Security name" required />
              <select name="account_id" defaultValue="">
                <option value="">Unassigned account</option>
                {data.accounts.filter((account) => ["investment","retirement"].includes(account.type)).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <div className="split-inputs">
                <input name="shares" type="number" step="0.0001" placeholder="Shares" required />
                <input name="price" type="number" step="0.01" placeholder="Price" required />
              </div>
              <div className="split-inputs">
                <input name="cost_basis" type="number" step="0.01" placeholder="Cost basis" required />
                <input name="market_value" type="number" step="0.01" placeholder="Market value" required />
              </div>
              <div className="split-inputs">
                <input name="day_change" type="number" step="0.01" placeholder="Day %" />
                <input name="ytd_return" type="number" step="0.01" placeholder="YTD %" />
              </div>
              <input name="sector" placeholder="Sector / exposure" />
              <button className="data-submit">Add holding</button>
            </form>

            <form className="card data-form" action={addGoal}>
              <div className="data-form-title"><PlusCircle size={17} /><strong>Add goal</strong></div>
              <input name="name" placeholder="Goal name" required />
              <div className="split-inputs">
                <input name="current" type="number" min="0" step="0.01" placeholder="Current" required />
                <input name="target" type="number" min="0.01" step="0.01" placeholder="Target" required />
              </div>
              <input name="priority" type="number" defaultValue="100" placeholder="Priority" />
              <button className="data-submit">Add goal</button>
            </form>
          </div>

          <section className="card page-card">
            <div className="section-title-row">
              <div><span className="card-kicker">PLANNING ASSUMPTIONS</span><h2>Persist the rules behind your intelligence</h2></div>
            </div>
            <form className="planning-form" action={updatePlanning}>
              <label><span>Current age</span><input name="current_age" type="number" defaultValue={data.householdPlan.demoCurrentAge} /></label>
              <label><span>Target retirement age</span><input name="target_retirement_age" type="number" defaultValue={data.householdPlan.targetRetirementAge} /></label>
              <label><span>Emergency fund months</span><input name="emergency_fund_target_months" type="number" step="0.1" defaultValue={data.householdPlan.emergencyFundTargetMonths} /></label>
              <label><span>Expected return %</span><input name="expected_annual_return_pct" type="number" step="0.1" defaultValue={data.householdPlan.expectedAnnualReturnPct} /></label>
              <label><span>Retirement asset target</span><input name="target_retirement_assets" type="number" step="1000" defaultValue={data.householdPlan.targetRetirementAssets} /></label>
              <label><span>Single stock review %</span><input name="single_stock_review_pct" type="number" step="0.1" defaultValue={data.householdPlan.singleStockReviewPct} /></label>
              <label><span>Top three review %</span><input name="top_three_stock_review_pct" type="number" step="0.1" defaultValue={data.householdPlan.topThreeStockReviewPct} /></label>
              <label><span>Portfolio cash review %</span><input name="portfolio_cash_review_pct" type="number" step="0.1" defaultValue={data.householdPlan.portfolioCashReviewPct} /></label>
              <label><span>High-interest debt APR %</span><input name="high_interest_debt_apr_pct" type="number" step="0.1" defaultValue={data.householdPlan.highInterestDebtAprPct} /></label>
              <button className="data-submit">Save assumptions</button>
            </form>
          </section>

          <section className="card page-card">
            <div className="section-title-row"><div><span className="card-kicker">CURRENT PERSISTED MODEL</span><h2>Quick verification</h2></div></div>
            <div className="data-summary-grid">
              <div><span>Accounts</span><strong>{data.accounts.length}</strong></div>
              <div><span>Transactions</span><strong>{data.transactions.length}</strong></div>
              <div><span>Holdings</span><strong>{data.holdings.length}</strong></div>
              <div><span>Goals</span><strong>{data.householdGoals.length}</strong></div>
              <div><span>Cash</span><strong>{money(data.accounts.filter((a) => a.type === "cash").reduce((s,a) => s+a.balance,0))}</strong></div>
            </div>
          </section>
        </>
      ) : (
        <section className="card page-card">
          <span className="card-kicker">NEXT ACCOUNT STEP</span>
          <h2>Free one Supabase project slot or upgrade Nexus.</h2>
          <p className="empty-copy">Once a project slot is available, create the dedicated Solpient Money project, apply the committed migration, set the two Money environment variables, and the login/onboarding flow becomes active.</p>
        </section>
      )}
    </div>
  );
}
