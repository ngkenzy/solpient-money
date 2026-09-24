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

  return (
    <div className="page tsp-csv-page">
      <PageHeader
        eyebrow="MILITARY TSP"
        title="Upload your TSP CSV. Solpient does the rest."
        description="Import the fund-level CSV exported from TSP.gov. Solpient stores the statement details, updates your TSP retirement account, adds each TSP fund to Investments, and includes the account balance in Net Worth."
      />

      <section className="card page-card tsp-csv-import-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              TSP CSV IMPORT
            </span>
            <h2>
              Import the official fund export
            </h2>
          </div>
          <FileSpreadsheet size={20} />
        </div>

        <p className="tsp-csv-copy">
          Use the CSV with columns such as Fund Name, Current Mix, Future Investments, Opening Balance, Gains/Losses, Closing Balance, Units, Fund Price, and Fund Return.
        </p>

        <TspCsvUploadForm />

        <div className="bottom-note">
          <CheckCircle2 size={15} />
          <span>
            Uploading a newer TSP CSV updates the same retirement account and fund holdings. The raw CSV is not stored; Solpient retains the parsed statement data and file fingerprint.
          </span>
        </div>
      </section>

      {!statement ? (
        <section className="card page-card tsp-csv-empty">
          <FileSpreadsheet size={28} />
          <h2>No TSP CSV imported yet</h2>
          <p>
            Upload your TSP fund CSV above. Your TSP value will then appear in Investments, Accounts, and Net Worth automatically.
          </p>
        </section>
      ) : (
        <>
          <div className="metric-grid four">
            <div className="metric-card">
              <span>Current TSP value</span>
              <strong>
                {money(
                  statement.totals.closingBalance,
                  true
                )}
              </strong>
              <small>
                Through {statement.periodEnd}
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
              <small>
                Exported TSP period
              </small>
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

            <div className="metric-card">
              <span>Opening balance</span>
              <strong>
                {money(
                  statement.totals.openingBalance,
                  true
                )}
              </strong>
              <small>
                {statement.periodStart}
              </small>
            </div>
          </div>

          <section className="card page-card">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">
                  IMPORTED ACCOUNT
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
                <span>Funds</span>
                <strong>
                  {statement.funds.length}
                </strong>
              </div>
              <div>
                <span>Current mix</span>
                <strong>
                  {pct(
                    statement.totals.currentMixPct
                  )}
                </strong>
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
                    {money(
                      statement.totals.closingBalance,
                      true
                    )}{" "}
                    included
                  </strong>
                  <small>
                    {statement.funds.length} TSP fund holding
                    {statement.funds.length === 1
                      ? ""
                      : "s"}
                  </small>
                </div>
                <ArrowRight size={16} />
              </Link>

              <Link
                href="/accounts"
                className="tsp-csv-linked-card"
              >
                <Landmark size={20} />
                <div>
                  <span>Net Worth</span>
                  <strong>
                    TSP retirement account included
                  </strong>
                  <small>
                    Account balance updates with each CSV import
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
                  ALLOCATION
                </span>
                <h2>
                  Current mix vs future investments
                </h2>
              </div>
              <TrendingUp size={19} />
            </div>

            <div className="tsp-csv-allocation-grid">
              {statement.funds.map((fund) => (
                <div
                  className="tsp-csv-allocation-card"
                  key={fund.fundCode}
                >
                  <div className="tsp-csv-fund-title">
                    <span>{fund.fundCode}</span>
                    <div>
                      <strong>{fund.fundName}</strong>
                      <small>{fund.assetClass}</small>
                    </div>
                  </div>

                  <div className="tsp-csv-mix-row">
                    <span>Current</span>
                    <strong>
                      {pct(fund.currentMixPct)}
                    </strong>
                  </div>
                  <div className="tsp-csv-mix-track">
                    <i
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            fund.currentMixPct
                          )
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="tsp-csv-mix-row">
                    <span>Future</span>
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

                  <div className="tsp-csv-allocation-value">
                    <span>Closing value</span>
                    <strong>
                      {money(
                        fund.closingBalance,
                        true
                      )}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card page-card">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">
                  TSP CSV DETAIL
                </span>
                <h2>
                  Everything in the imported fund rows
                </h2>
              </div>
              <span className="small-muted">
                {statement.dateRange}
              </span>
            </div>

            <div className="tsp-csv-table-wrap">
              <div className="tsp-csv-table">
                <div className="tsp-csv-table-row head">
                  <span>Fund</span>
                  <span>Asset class</span>
                  <span>Current mix</span>
                  <span>Future</span>
                  <span>Opening</span>
                  <span>Gains / losses</span>
                  <span>Other activity</span>
                  <span>Closing</span>
                  <span>Units</span>
                  <span>Fund price</span>
                  <span>Fund return</span>
                </div>

                {statement.funds.map((fund) => (
                  <div
                    className="tsp-csv-table-row"
                    key={fund.fundCode}
                  >
                    <span>
                      <strong>
                        {fund.fundName}
                      </strong>
                    </span>
                    <span>{fund.assetClass}</span>
                    <span>
                      {pct(fund.currentMixPct)}
                    </span>
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
                      <strong>
                        {money(
                          fund.closingBalance,
                          true
                        )}
                      </strong>
                    </span>
                    <span>{units(fund.units)}</span>
                    <span>
                      {fundPrice(
                        fund.fundPrice
                      )}
                    </span>
                    <span
                      className={
                        fund.fundReturnPct >= 0
                          ? "positive-text"
                          : "negative-text"
                      }
                    >
                      {fund.fundReturnPct >= 0
                        ? "+"
                        : ""}
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
