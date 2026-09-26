import Link from "next/link";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Database, LogOut, PlusCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import DataBackupActions from "@/components/DataBackupActions";
import { requireMoneyDataset } from "@/lib/money-data";
import { money } from "@/lib/finance";
import {
  addAccount,
  addGoal,
  addHolding,
  addTransaction,
  saveHousing,
  updateAccount,
  updatePlanning,
} from "./actions";

type BackupHealth =
  | { state: "healthy"; date: Date }
  | { state: "stale"; date: Date }
  | { state: "never" }
  | { state: "unknown" };

async function getBackupHealth(): Promise<BackupHealth> {
  try {
    const dir = path.join(process.cwd(), "backups");
    const files = (await readdir(dir)).filter(
      (name) => name.startsWith("solpient-money-") && name.endsWith(".sql.gz.enc")
    );
    if (!files.length) return { state: "never" };
    const withMtime = await Promise.all(
      files.map(async (name) => ({
        name,
        mtime: (await stat(path.join(dir, name))).mtimeMs,
      }))
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);
    const latest = withMtime[0];
    const ageDays = (Date.now() - latest.mtime) / 86_400_000;
    return ageDays > 30
      ? { state: "stale", date: new Date(latest.mtime) }
      : { state: "healthy", date: new Date(latest.mtime) };
  } catch {
    return { state: "unknown" };
  }
}

function formatBackupDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const context = await requireMoneyDataset();
  const data = context.dataset;
  const persistent = context.source === "database";
  const backup = persistent ? await getBackupHealth() : null;

  const propertyAccounts = data.accounts.filter((a) => a.type === "property");
  const debtAccounts = data.accounts.filter((a) => a.type === "debt");
  const homeAccount = propertyAccounts[0] ?? null;
  const mortgageAccount =
    debtAccounts.find((a) => /mortgage|home\s*loan/i.test(a.name)) ?? null;
  const homeEquity =
    homeAccount != null
      ? homeAccount.balance - Math.abs(mortgageAccount?.balance ?? 0)
      : null;

  return (
    <div className="page">
      <PageHeader
        eyebrow="MONEY DATA"
        title={persistent ? context.household?.name ?? "Household data" : "Demo data mode"}
        description={
          persistent
            ? "Household data is read from your private PostgreSQL database on this Mac. Manual entry is always available."
            : "The local Money database is not configured yet. Run npm run local:setup, then this app reads your private PostgreSQL on this Mac — demo controls are shown until then."
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
          <strong>{persistent ? "Private household database active" : "Local database not configured"}</strong>
          <span>
            {persistent
              ? `${data.accounts.length} accounts · ${data.transactions.length} transactions · ${data.holdings.length} holdings · ${data.householdGoals.length} goals`
              : "No personal financial data leaves this Mac."}
          </span>
        </div>
      </section>

      {backup ? (
        <section className="card page-card data-backup-card">
          <div className="data-status-card">
          {backup.state === "healthy" ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
          <div>
            <strong>
              {backup.state === "healthy" && `Last backup ${formatBackupDate(backup.date)}`}
              {backup.state === "stale" && `Last backup ${formatBackupDate(backup.date)} — stale`}
              {backup.state === "never" && "No backups yet"}
              {backup.state === "unknown" && "Backup status unknown"}
            </strong>
            <span>
              {backup.state === "healthy" && "Your encrypted backup is current. Local-first means you own the backup — keep a copy off this Mac."}
              {backup.state === "stale" && "Over 30 days since your last backup. Create a fresh encrypted backup below."}
              {backup.state === "never" && "This Mac holds the only copy of your data. Create your first encrypted backup below."}
              {backup.state === "unknown" && "Could not read the backups directory."}
            </span>
          </div>
          {backup.state === "stale" || backup.state === "never" ? (
            <span className="live-pill disconnected">BACKUP NEEDED</span>
          ) : null}
          </div>
          <DataBackupActions />
        </section>
      ) : null}

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
              <input name="balance" type="number" step="0.01" placeholder="Balance" required />
              <select name="owner_scope" defaultValue="Household">
                <option>Household</option><option>Primary</option><option>Joint</option>
              </select>
              <input name="last_four" maxLength={8} placeholder="Last four / label" />
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
              <div><span className="card-kicker">HOUSING</span><h2>Home value & mortgage</h2></div>
            </div>
            <p className="small-muted">Both sides of your house in one place: what it&rsquo;s worth and what you still owe. Saving updates the matching property and debt accounts below — and your net worth everywhere.</p>
            <form className="housing-form" action={saveHousing}>
              <label><span>Home account</span>
                <select name="home_account_id" defaultValue={homeAccount?.id ?? "new"}>
                  {propertyAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {money(a.balance)}</option>
                  ))}
                  <option value="new">New home account</option>
                </select>
              </label>
              <label><span>Mortgage account</span>
                <select name="mortgage_account_id" defaultValue={mortgageAccount?.id ?? "new"}>
                  <option value="none">No mortgage</option>
                  {debtAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {money(a.balance)}</option>
                  ))}
                  <option value="new">New mortgage account</option>
                </select>
              </label>
              <label><span>Home value</span>
                <input name="home_value" type="number" min="0" step="0.01" defaultValue={homeAccount?.balance ?? ""} placeholder="What it's worth" required />
              </label>
              <label><span>Mortgage owed</span>
                <input name="mortgage_balance" type="number" min="0" step="0.01" defaultValue={mortgageAccount ? Math.abs(mortgageAccount.balance) : ""} placeholder="Amount still owed" />
              </label>
              <label><span>Lender</span>
                <input name="lender" defaultValue={mortgageAccount?.institution ?? homeAccount?.institution ?? ""} placeholder="Bank / servicer" />
              </label>
              <label><span>Mortgage APR %</span>
                <input name="mortgage_apr" type="number" min="0" step="0.01" defaultValue={mortgageAccount?.apr ?? ""} placeholder="Rate" />
              </label>
              <label><span>Monthly payment</span>
                <input name="mortgage_payment" type="number" min="0" step="0.01" defaultValue={mortgageAccount?.minimumPayment ?? ""} placeholder="PITI or P&I" />
              </label>
              <button className="data-submit">Save housing</button>
            </form>
            {homeEquity !== null ? (
              <p className="housing-equity">Home equity <strong>{money(homeEquity)}</strong> <span className="small-muted">— value minus owed, counted in your net worth.</span></p>
            ) : null}
          </section>

          {data.accounts.length ? (
            <section className="card page-card">
              <div className="section-title-row">
                <div><span className="card-kicker">ACCOUNTS</span><h2>All accounts</h2></div>
              </div>
              <p className="small-muted">Tweak any account inline and save its row. Debt balances are stored negative.</p>
              <div className="accounts-editor">
                <div className="accounts-editor-head" aria-hidden="true">
                  <span>Account</span><span>Type</span><span>Balance</span><span>Institution</span><span>Debt details</span><span></span>
                </div>
                {data.accounts.map((account) => (
                  <form className="accounts-editor-row" action={updateAccount} key={account.id}>
                    <input type="hidden" name="id" value={account.id} />
                    <input name="name" defaultValue={account.name} required aria-label={`${account.name} name`} />
                    <span className="account-type-badge">{account.type}</span>
                    <input name="balance" type="number" step="0.01" defaultValue={account.balance} required aria-label={`${account.name} balance`} />
                    <input name="institution" defaultValue={account.institution} placeholder="Institution" aria-label={`${account.name} institution`} />
                    {account.type === "debt" ? (
                      <span className="split-inputs">
                        <input name="apr" type="number" step="0.01" defaultValue={account.apr ?? ""} placeholder="APR %" aria-label={`${account.name} APR`} />
                        <input name="minimum_payment" type="number" step="0.01" defaultValue={account.minimumPayment ?? ""} placeholder="Min payment" aria-label={`${account.name} minimum payment`} />
                      </span>
                    ) : (
                      <span className="accounts-editor-na">—</span>
                    )}
                    <button className="data-submit">Save</button>
                  </form>
                ))}
              </div>
            </section>
          ) : null}

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
          <span className="card-kicker">NEXT STEP</span>
          <h2>Run the local database setup.</h2>
          <p className="empty-copy">From the app folder, run <strong>npm run local:setup</strong> to start PostgreSQL in Docker, apply the schema, and keep all Money data on this Mac. Then the login and onboarding flow becomes active.</p>
        </section>
      )}
    </div>
  );
}
