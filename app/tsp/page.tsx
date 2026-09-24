import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Landmark,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { money } from "@/lib/finance";
import { getLatestTspOfficialImport } from "@/lib/tsp-official-data";
import TspCsvUploadForm from "./TspCsvUploadForm";
import TspFundPriceForm from "./TspFundPriceForm";

export const dynamic = "force-dynamic";

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function signedMoney(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${money(value, true)}`;
}

function units(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function fundPrice(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

function importedLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function TspPage() {
  const latest =
    await getLatestTspOfficialImport();

  const statement = latest?.statement ?? null;
  const liveFunds = latest?.funds ?? [];
  const currentValue = latest?.currentValue ?? 0;

  return (
    <div className="page tsp-csv-page">
      <PageHeader
        eyebrow="THRIFT SAVING PLAN"
        title="Thrift Saving Plan"
        description="Upload the fund-level CSV exported from TSP.gov. Solpient keeps the imported statement as the historical record, tracks only the funds in that file, and uses each fund's units and current fund price to calculate the live portfolio value."
      />

      <section className="card page-card tsp-csv-import-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              CSV IMPORT
            </span>
            <h2>
              Import the official fund export
            </h2>
          </div>
          <FileSpreadsheet size={20} />
        </div>

        <p className="tsp-csv-copy">
          Import any fund rows included in the TSP export. Solpient does not require a fixed G/F/C/S/I list; only funds present in the latest imported CSV are displayed.
        </p>

        <TspCsvUploadForm />

        <div className="bottom-note">
          <CheckCircle2 size={15} />
          <span>
            Uploading a newer CSV refreshes the imported fund list, units, imported prices, and statement details. Funds omitted from the new import are removed from the live Thrift Saving Plan portfolio.
          </span>
        </div>
      </section>

      {!statement ? (
        <section className="card page-card tsp-csv-empty">
          <FileSpreadsheet size={28} />
          <h2>No Thrift Saving Plan CSV imported yet</h2>
          <p>
            Upload your fund CSV above. Its funds will then appear here and the live portfolio value will flow into Investments, Accounts, and Net Worth.
          </p>
        </section>
      ) : (
        <>
          <div className="metric-grid four">
            <div className="metric-card">
              <span>Current plan value</span>
              <strong>
                {money(currentValue, true)}
              </strong>
              <small>
                Live units × current fund prices
              </small>
            </div>

            <div className="metric-card">
              <span>Imported closing value</span>
              <strong>
                {money(
                  statement.totals.closingBalance,
                  true
                )}
              </strong>
              <small>
                Statement through {statement.periodEnd}
              </small>
            </div>

            <div className="metric-card">
              <span>Gains / losses</span>
              <strong
                className={
                  statement.totals.gainsLosses >= 0
                    ? "positive-text"
                    : "negative-text"
                }
              >
                {signedMoney(
                  statement.totals.gainsLosses
                )}
              </strong>
              <small>Imported statement period</small>
            </div>

            <div className="metric-card">
              <span>Other activity</span>
              <strong
                className={
                  statement.totals.otherActivity >= 0
                    ? "positive-text"
                    : "negative-text"
                }
              >
                {signedMoney(
                  statement.totals.otherActivity
                )}
              </strong>
              <small>
                Contributions, transfers, and other activity
              </small>
            </div>
          </div>

          <section className="card page-card">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">
                  PLAN ACCOUNT
                </span>
                <h2>{statement.plan}</h2>
              </div>
              <span className="small-muted">
                Last imported {importedLabel(latest?.importedAt ?? null)}
              </span>
            </div>

            <div className="tsp-csv-account-meta">
              <div>
                <span>Date range</span>
                <strong>{statement.dateRange}</strong>
              </div>
              <div>
                <span>Source file</span>
                <strong>
                  {latest?.sourceFilename ?? "TSP CSV"}
                </strong>
              </div>
              <div>
                <span>Imported funds</span>
                <strong>{liveFunds.length}</strong>
              </div>
              <div>
                <span>Live portfolio</span>
                <strong>{money(currentValue, true)}</strong>
              </div>
            </div>

            <div className="tsp-csv-linked-grid">
              <Link
                href="/portfolio"
                className="tsp-csv-linked-card"
              >
                <WalletCards size={20} />
                <div>
                  <span>Investments</span>
                  <strong>
                    {money(currentValue, true)} included
                  </strong>
                  <small>
                    {liveFunds.length} imported fund holding
                    {liveFunds.length === 1 ? "" : "s"}
                  </small>
                </div>
                <ArrowRight size={16} />
              </Link>

              <Link
                href="/"
                className="tsp-csv-linked-card"
              >
                <Landmark size={20} />
                <div>
                  <span>Net Worth</span>
                  <strong>
                    Retirement account included
                  </strong>
                  <small>
                    The live plan value updates Net Worth and also appears under Accounts
                  </small>
                </div>
                <ArrowRight size={16} />
              </Link>
            </div>
          </section>

          <section className="card page-card">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">
                  FUND HOLDINGS
                </span>
                <h2>
                  Units, current price, value, and allocation
                </h2>
              </div>
              <TrendingUp size={19} />
            </div>

            <div className="tsp-csv-allocation-grid">
              {liveFunds.map((fund) => (
                <div
                  className="tsp-csv-allocation-card"
                  key={fund.ticker}
                >
                  <div className="tsp-csv-fund-title">
                    <span>{fund.fundCode}</span>
                    <div>
                      <strong>{fund.fundName}</strong>
                      <small>{fund.assetClass}</small>
                    </div>
                  </div>

                  <div className="tsp-csv-live-values">
                    <div>
                      <span>Units</span>
                      <strong>
                        {units(fund.liveUnits)}
                      </strong>
                    </div>
                    <div>
                      <span>Current value</span>
                      <strong>
                        {money(fund.liveValue, true)}
                      </strong>
                    </div>
                  </div>

                  <div className="tsp-csv-price-editor">
                    <span>Fund price</span>
                    <TspFundPriceForm
                      ticker={fund.ticker}
                      price={fund.liveFundPrice}
                    />
                    {fund.priceEdited ? (
                      <small>
                        Imported price: {fundPrice(fund.fundPrice)}
                      </small>
                    ) : (
                      <small>
                        Imported price is current
                      </small>
                    )}
                  </div>

                  <div className="tsp-csv-mix-row">
                    <span>Live mix</span>
                    <strong>
                      {pct(fund.liveMixPct)}
                    </strong>
                  </div>
                  <div className="tsp-csv-mix-track">
                    <i
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, fund.liveMixPct)
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="tsp-csv-mix-row">
                    <span>Future investments</span>
                    <strong>
                      {pct(
                        fund.futureInvestmentsPct
                      )}
                    </strong>
                  </div>
                  <div className="tsp-csv-mix-track future">
                    <i
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            fund.futureInvestmentsPct
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card page-card">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">
                  IMPORTED STATEMENT DETAIL
                </span>
                <h2>
                  All imported fund information
                </h2>
              </div>
              <span className="small-muted">
                {statement.dateRange}
              </span>
            </div>

            <p className="tsp-csv-copy">
              Imported closing values remain unchanged as statement history. Current values below are recalculated from imported units and your current editable fund prices.
            </p>

            <div className="tsp-csv-table-wrap">
              <div className="tsp-csv-table live">
                <div className="tsp-csv-table-row head">
                  <span>Fund</span>
                  <span>Asset class</span>
                  <span>Live mix</span>
                  <span>Future</span>
                  <span>Opening</span>
                  <span>Gains / losses</span>
                  <span>Other activity</span>
                  <span>Imported closing</span>
                  <span>Units</span>
                  <span>Current price</span>
                  <span>Current value</span>
                  <span>Fund return</span>
                </div>

                {liveFunds.map((fund) => (
                  <div
                    className="tsp-csv-table-row"
                    key={fund.ticker}
                  >
                    <span>
                      <strong>{fund.fundName}</strong>
                    </span>
                    <span>{fund.assetClass}</span>
                    <span>{pct(fund.liveMixPct)}</span>
                    <span>
                      {pct(
                        fund.futureInvestmentsPct
                      )}
                    </span>
                    <span>
                      {money(
                        fund.openingBalance,
                        true
                      )}
                    </span>
                    <span
                      className={
                        fund.gainsLosses >= 0
                          ? "positive-text"
                          : "negative-text"
                      }
                    >
                      {signedMoney(
                        fund.gainsLosses
                      )}
                    </span>
                    <span
                      className={
                        fund.otherActivity >= 0
                          ? "positive-text"
                          : "negative-text"
                      }
                    >
                      {signedMoney(
                        fund.otherActivity
                      )}
                    </span>
                    <span>
                      {money(
                        fund.closingBalance,
                        true
                      )}
                    </span>
                    <span>
                      <strong>{units(fund.liveUnits)}</strong>
                    </span>
                    <span>
                      {fundPrice(fund.liveFundPrice)}
                    </span>
                    <span>
                      <strong>
                        {money(fund.liveValue, true)}
                      </strong>
                    </span>
                    <span
                      className={
                        fund.fundReturnPct >= 0
                          ? "positive-text"
                          : "negative-text"
                      }
                    >
                      {fund.fundReturnPct >= 0 ? "+" : ""}
                      {pct(fund.fundReturnPct)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {statement.warnings.length ? (
            <section className="card page-card">
              <div className="section-title-row">
                <div>
                  <span className="card-kicker">
                    IMPORT NOTES
                  </span>
                  <h2>
                    Reconciliation warnings
                  </h2>
                </div>
              </div>
              <div className="tsp-csv-warning-list">
                {statement.warnings.map(
                  (warning) => (
                    <div key={warning}>
                      {warning}
                    </div>
                  )
                )}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
