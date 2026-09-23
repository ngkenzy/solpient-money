import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  CircleAlert,
  Flag,
  Gauge,
  Landmark,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import InteractiveLineChart from "@/components/InteractiveLineChart";
import { money } from "@/lib/finance";
import { getTspTracker } from "@/lib/tsp-tracker";
import { localCalendarDateKey } from "@/lib/local-calendar-date";
import {
  saveTspProfile,
  saveTspSnapshot,
  syncTspPricesNow,
} from "./actions";

export const dynamic = "force-dynamic";

function pct(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function signalIcon(
  level: "critical" | "watch" | "positive" | "info"
) {
  if (level === "critical") return <ShieldAlert size={17} />;
  if (level === "watch") return <CircleAlert size={17} />;
  return <CheckCircle2 size={17} />;
}

function contributionStatus(tracker: Awaited<ReturnType<typeof getTspTracker>>) {
  if (!tracker.profile) return "Setup needed";
  if (tracker.projectedExcess > 0) return "Review pace";
  if (tracker.brsMatchingEligible && !tracker.fullMatchReached) {
    return "Below full BRS match";
  }
  return "On track";
}

export default async function TspPage() {
  const tracker = await getTspTracker();
  const profile = tracker.profile;
  const snapshot = tracker.snapshot;

  const historyChart = [...tracker.history]
    .reverse()
    .map((item) => ({
      label: item.date,
      balance: item.totalBalance,
      employee: item.employeeContribYtd,
      service:
        item.serviceAutoYtd +
        item.serviceMatchYtd,
    }));

  const snapshotDefaultDate =
    localCalendarDateKey(new Date());

  return (
    <div className="page tsp-page">
      <PageHeader
        eyebrow="V1.7.5 · MILITARY TSP TRACKER"
        title="Track the TSP the way a service member actually needs it."
        description="Monitor Traditional and Roth balances, G/F/C/S/I/L allocation, annual IRS limits, outside-plan deferrals, BRS matching, and whether your current contribution pace is likely to max too early."
        action={
          <form action={syncTspPricesNow}>
            <button
              className="research-button"
              type="submit"
              disabled={!profile || !snapshot}
            >
              <RefreshCw size={14} />
              Sync prices now
            </button>
          </form>
        }
      />

      <div className="metric-grid four">
        <div className="metric-card">
          <span>Official TSP snapshot</span>
          <strong>
            {snapshot
              ? money(snapshot.totalBalance)
              : "—"}
          </strong>
          <small>
            {snapshot
              ? `Account snapshot · ${snapshot.date} · rev ${snapshot.revision}`
              : "Traditional + Roth"}
          </small>
        </div>
        <div className="metric-card">
          <span>Estimated current value</span>
          <strong>
            {tracker.estimatedCurrentValue == null
              ? "—"
              : money(tracker.estimatedCurrentValue)}
          </strong>
          <small>
            {tracker.mixedPriceDates
              ? "Withheld · owned funds have different official price dates"
              : tracker.latestPriceDate
                ? `Official price date · ${tracker.latestPriceDate}`
                : "Sync official TSP share prices"}
          </small>
        </div>
        <div className="metric-card">
          <span>Limit used</span>
          <strong>
            {pct(
              tracker.employeeLimitUsedPct,
              0
            )}
          </strong>
          <small>
            {money(
              tracker.remainingEmployeeLimit
            )}{" "}
            remaining
          </small>
        </div>
        <div className="metric-card">
          <span>BRS / pace status</span>
          <strong className={
            tracker.projectedExcess > 0 ||
            (tracker.brsMatchingEligible &&
              !tracker.fullMatchReached)
              ? "negative-text"
              : "positive-text"
          }>
            {contributionStatus(tracker)}
          </strong>
          <small>
            {pct(
              tracker.totalContributionPct
            )}{" "}
            of basic pay elected
          </small>
        </div>
      </div>

      {snapshot ? (
        <section className="card page-card tsp-live-estimate-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                DAILY SHARE-PRICE ESTIMATE
              </span>
              <h2>
                Official snapshot vs latest published TSP prices
              </h2>
            </div>
            <span className="small-muted">
              {tracker.mixedPriceDates
                ? `Official dates vary · ${tracker.oldestPriceDate ?? "—"} to ${tracker.newestPriceDate ?? "—"}`
                : tracker.latestPriceDate
                  ? `Official price date ${tracker.latestPriceDate}`
                  : "Not synced"}
            </span>
          </div>

          <div className="tsp-estimate-summary">
            <div>
              <span>Official snapshot</span>
              <strong>{money(snapshot.totalBalance)}</strong>
              <small>
                {snapshot.date} · revision {snapshot.revision}
              </small>
            </div>
            <div>
              <span>Estimated current value</span>
              <strong>
                {tracker.estimatedCurrentValue == null
                  ? "—"
                  : money(tracker.estimatedCurrentValue)}
              </strong>
              <small>
                {tracker.mixedPriceDates
                  ? "Withheld until all owned funds share one official as-of date"
                  : tracker.latestPriceDate
                    ? `Using official TSP share prices dated ${tracker.latestPriceDate}`
                    : "Sync required"}
              </small>
            </div>
            <div>
              <span>Estimated change</span>
              <strong
                className={
                  (tracker.estimatedChange ?? 0) >= 0
                    ? "positive-text"
                    : "negative-text"
                }
              >
                {tracker.estimatedChange == null
                  ? "—"
                  : `${tracker.estimatedChange >= 0 ? "+" : "-"}${money(
                      Math.abs(tracker.estimatedChange)
                    )}`}
              </strong>
              <small>
                {tracker.estimatedChangePct == null
                  ? "Since official snapshot"
                  : `${tracker.estimatedChangePct >= 0 ? "+" : ""}${tracker.estimatedChangePct.toFixed(
                      2
                    )}% since snapshot`}
              </small>
            </div>
          </div>

          {tracker.estimatedFunds.length ? (
            <div className="tsp-live-fund-list">
              {tracker.estimatedFunds.map((fund) => (
                <div
                  className="tsp-live-fund-row"
                  key={fund.fundCode}
                >
                  <span className="tsp-fund-code">
                    {fund.fundCode}
                  </span>
                  <div>
                    <strong>{fund.fundName}</strong>
                    <span>
                      {fund.shares == null
                        ? "Shares not inferred yet"
                        : `${fund.shares.toLocaleString("en-US", {
                            maximumFractionDigits: 4,
                          })} shares`}
                    </span>
                  </div>
                  <div>
                    <span>Snapshot price</span>
                    <strong>
                      {fund.snapshotSharePrice == null
                        ? "—"
                        : `${fund.snapshotSharePrice.toFixed(4)}`}
                    </strong>
                    <small>{fund.snapshotPriceDate ?? "—"}</small>
                  </div>
                  <div>
                    <span>Latest official TSP share price</span>
                    <strong>
                      {fund.latestSharePrice == null
                        ? "—"
                        : `${fund.latestSharePrice.toFixed(4)}`}
                    </strong>
                    <small>
                      Official price date · {fund.latestPriceDate ?? "—"}
                    </small>
                  </div>
                  <div>
                    <span>Estimated value</span>
                    <strong>
                      {fund.estimatedCurrentValue == null
                        ? "—"
                        : money(fund.estimatedCurrentValue)}
                    </strong>
                    <small>
                      {fund.estimatedChangePct == null
                        ? "—"
                        : `${fund.estimatedChangePct >= 0 ? "+" : ""}${fund.estimatedChangePct.toFixed(
                            2
                          )}%`}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="bottom-note tsp-price-note">
            <RefreshCw size={15} />
            <span>
              Per-fund estimated value = inferred fund shares × that fund&apos;s latest official TSP share price.
              If owned funds have different official price dates, Solpient withholds the combined estimate. Your official TSP snapshot is never overwritten.
            </span>
          </div>
        </section>
      ) : null}

      <div className="tsp-top-grid">
        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                CONTRIBUTION PACE
              </span>
              <h2>
                Max the account without losing sight of the match
              </h2>
            </div>
            <Gauge size={18} />
          </div>

          <div className="tsp-progress">
            <div>
              <span
                style={{
                  width: `${Math.min(
                    100,
                    tracker.employeeLimitUsedPct
                  )}%`,
                }}
              />
            </div>
            <p>
              {snapshot
                ? `${money(
                    snapshot.employeeContribYtd
                  )} TSP employee contributions + ${money(
                    profile?.externalDeferralsYtd ?? 0
                  )} outside-plan deferrals`
                : "Add a snapshot to track year-to-date employee contributions."}
            </p>
          </div>

          <div className="tsp-stat-grid">
            <div>
              <span>Monthly elected</span>
              <strong>
                {money(
                  tracker.monthlyElectedContribution
                )}
              </strong>
            </div>
            <div>
              <span>Monthly needed to max</span>
              <strong>
                {tracker.monthlyNeededToMax == null
                  ? "—"
                  : money(
                      tracker.monthlyNeededToMax
                    )}
              </strong>
            </div>
            <div>
              <span>Est. basic-pay % to max</span>
              <strong>
                {tracker.suggestedBasicPayPctToMax ==
                null
                  ? "—"
                  : pct(
                      tracker.suggestedBasicPayPctToMax
                    )}
              </strong>
            </div>
            <div>
              <span>Projected employee deferrals</span>
              <strong>
                {money(
                  tracker.projectedEmployeeDeferrals
                )}
              </strong>
            </div>
          </div>

          {tracker.maxEarlyRisk ? (
            <div className="tsp-callout watch">
              <Flag size={17} />
              <div>
                <strong>
                  Possible early max-out
                </strong>
                <span>
                  At the current estimated pace,
                  you may reach the annual employee
                  limit before the final months of
                  the year. Review the payroll
                  election if BRS matching applies.
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                BRS MATCH
              </span>
              <h2>
                Service contribution visibility
              </h2>
            </div>
            <BadgeDollarSign
              size={18}
            />
          </div>

          <div className="tsp-brs-grid">
            <div>
              <span>
                Member contribution
              </span>
              <strong>
                {pct(
                  tracker.totalContributionPct
                )}
              </strong>
            </div>
            <div>
              <span>
                Service automatic
              </span>
              <strong>
                {pct(
                  tracker.brsAutomaticPct
                )}
              </strong>
            </div>
            <div>
              <span>
                Service match
              </span>
              <strong>
                {pct(
                  tracker.brsMatchPct
                )}
              </strong>
            </div>
            <div>
              <span>
                Total service %
              </span>
              <strong>
                {pct(
                  tracker.brsGovernmentPct
                )}
              </strong>
            </div>
          </div>

          <div className="tsp-brs-summary">
            <strong>
              {profile?.retirementSystem ===
              "brs"
                ? tracker.brsMatchingEligible
                  ? tracker.fullMatchReached
                    ? "Full BRS match threshold reached"
                    : "Below full BRS match threshold"
                  : "BRS profile — matching currently outside tracker eligibility window"
                : profile?.retirementSystem ===
                    "legacy"
                  ? "Legacy retirement profile — no BRS match modeled"
                  : "Choose retirement system to enable BRS logic"}
            </strong>
            <span>
              Estimated monthly service
              contribution:{" "}
              {money(
                tracker.projectedMonthlyGovernmentContribution
              )}
            </span>
          </div>
        </section>
      </div>

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              FUND ALLOCATION
            </span>
            <h2>
              Current TSP investment mix
            </h2>
          </div>
          <div className="tsp-fund-price-date">
            <Landmark size={18} />
            <span>
              {tracker.mixedPriceDates
                ? "Official fund price dates vary"
                : tracker.latestPriceDate
                  ? `Official price date · ${tracker.latestPriceDate}`
                  : "Official prices not synced"}
            </span>
          </div>
        </div>

        {tracker.funds.length ? (
          <div className="tsp-fund-list">
            {tracker.funds.map((fund) => {
              const priced = tracker.estimatedFunds.find(
                (item) => item.fundCode === fund.code
              );

              return (
                <div
                  className="tsp-fund-row"
                  key={fund.code}
                >
                  <span className="tsp-fund-code">
                    {fund.code}
                  </span>

                  <div className="tsp-fund-main">
                    <strong>{fund.name}</strong>
                    <div className="tsp-fund-track">
                      <span
                        style={{
                          width: `${Math.min(
                            100,
                            fund.allocationPct
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="tsp-fund-metric">
                    <span>Allocation</span>
                    <strong>{pct(fund.allocationPct)}</strong>
                  </div>

                  <div className="tsp-fund-metric">
                    <span>Snapshot balance</span>
                    <strong>{money(fund.balance)}</strong>
                  </div>

                  <div className="tsp-fund-metric">
                    <span>Estimated fund value</span>
                    <strong>
                      {priced?.estimatedCurrentValue == null
                        ? "—"
                        : money(priced.estimatedCurrentValue)}
                    </strong>
                  </div>

                  <div className="tsp-fund-market-data">
                    <div>
                      <span>Latest official TSP share price</span>
                      <strong>
                        {priced?.latestSharePrice == null
                          ? "—"
                          : `${priced.latestSharePrice.toFixed(4)}`}
                      </strong>
                    </div>
                    <div>
                      <span>Official price date</span>
                      <strong>{priced?.latestPriceDate ?? "—"}</strong>
                    </div>
                    <div>
                      <span>Inferred shares</span>
                      <strong>
                        {priced?.shares == null
                          ? "—"
                          : priced.shares.toLocaleString("en-US", {
                              maximumFractionDigits: 4,
                            })}
                      </strong>
                    </div>
                    <div>
                      <span>Change vs snapshot</span>
                      <strong>
                        {priced?.estimatedChangePct == null
                          ? "—"
                          : `${priced.estimatedChangePct >= 0 ? "+" : ""}${priced.estimatedChangePct.toFixed(
                              2
                            )}%`}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="action-empty">
            <Landmark size={24} />
            <strong>
              No TSP fund allocation saved.
            </strong>
            <span>
              Add G/F/C/S/I or a Lifecycle
              fund in the snapshot form below.
            </span>
          </div>
        )}
      </section>

      {historyChart.length ? (
        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                TSP HISTORY
              </span>
              <h2>
                Balance and contribution history
              </h2>
            </div>
          </div>
          <InteractiveLineChart
            data={historyChart}
            series={[
              {
                key: "balance",
                label: "TSP balance",
                format: "currency",
              },
              {
                key: "employee",
                label: "Employee YTD",
                format: "currency",
              },
              {
                key: "service",
                label: "Service YTD",
                format: "currency",
              },
            ]}
            defaultRange="ALL"
            height={245}
          />
        </section>
      ) : null}

      <section className="card page-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">
              TSP REVIEW
            </span>
            <h2>
              What deserves attention
            </h2>
          </div>
        </div>

        <div className="portfolio-signal-list">
          {tracker.signals.map(
            (signal) => (
              <div
                className={`portfolio-signal-row portfolio-signal-${signal.level}`}
                key={
                  signal.id
                }
              >
                <span className="portfolio-signal-icon">
                  {signalIcon(
                    signal.level
                  )}
                </span>
                <div>
                  <strong>
                    {signal.title}
                  </strong>
                  <span>
                    {signal.detail}
                  </span>
                </div>
                <span className="portfolio-signal-label">
                  {signal.level}
                </span>
                <ArrowRight
                  size={15}
                />
              </div>
            )
          )}
        </div>
      </section>

      <div className="tsp-forms-grid">
        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                MILITARY PROFILE
              </span>
              <h2>
                Pay, BRS, and contribution settings
              </h2>
            </div>
          </div>

          <form
            action={saveTspProfile}
            className="tsp-form"
          >
            <label>
              <span>Retirement system</span>
              <select
                name="retirementSystem"
                defaultValue={
                  profile?.retirementSystem ??
                  "unknown"
                }
              >
                <option value="brs">
                  Blended Retirement System
                </option>
                <option value="legacy">
                  Legacy / High-3
                </option>
                <option value="unknown">
                  Not sure
                </option>
              </select>
            </label>

            <label>
              <span>Component</span>
              <select
                name="serviceComponent"
                defaultValue={
                  profile?.serviceComponent ??
                  "active"
                }
              >
                <option value="active">
                  Active / AGR
                </option>
                <option value="reserve">
                  Reserve
                </option>
                <option value="guard">
                  National Guard
                </option>
                <option value="other">
                  Other Uniformed Service
                </option>
              </select>
            </label>

            <label>
              <span>Service entry / PEBD</span>
              <input
                type="date"
                name="serviceEntryDate"
                defaultValue={
                  profile?.serviceEntryDate ??
                  ""
                }
              />
            </label>

            <label>
              <span>Age at end of 2026</span>
              <input
                type="number"
                min="18"
                max="80"
                name="ageAtYearEnd"
                defaultValue={
                  profile?.ageAtYearEnd ??
                  ""
                }
              />
            </label>

            <label>
              <span>Annual basic pay</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="annualBasicPay"
                defaultValue={
                  profile?.annualBasicPay ??
                  ""
                }
              />
            </label>

            <label>
              <span>Traditional % of basic pay</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                name="traditionalContributionPct"
                defaultValue={
                  profile?.traditionalContributionPct ??
                  0
                }
              />
            </label>

            <label>
              <span>Roth % of basic pay</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                name="rothContributionPct"
                defaultValue={
                  profile?.rothContributionPct ??
                  0
                }
              />
            </label>

            <label>
              <span>Other 401(k)-type deferrals YTD</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="externalDeferralsYtd"
                defaultValue={
                  profile?.externalDeferralsYtd ??
                  0
                }
              />
            </label>

            <label>
              <span>Prior-year plan wages</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="priorYearPlanWages"
                defaultValue={
                  profile?.priorYearPlanWages ??
                  0
                }
              />
            </label>

            <button
              className="research-button"
              type="submit"
            >
              Save TSP profile
            </button>
          </form>
        </section>

        <section className="card page-card">
          <div className="section-title-row">
            <div>
              <span className="card-kicker">
                TSP SNAPSHOT
              </span>
              <h2>
                Add statement / account values
              </h2>
            </div>
          </div>

          <form
            action={saveTspSnapshot}
            className="tsp-form"
          >
            <label>
              <span>Snapshot date</span>
              <input
                type="date"
                name="snapshotDate"
                defaultValue={
                  snapshot?.date ??
                  snapshotDefaultDate
                }
                required
              />
            </label>

            <label>
              <span>Traditional balance</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="traditionalBalance"
                defaultValue={
                  snapshot?.traditionalBalance ??
                  0
                }
              />
            </label>

            <label>
              <span>Roth balance</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="rothBalance"
                defaultValue={
                  snapshot?.rothBalance ??
                  0
                }
              />
            </label>

            <label>
              <span>TSP loan outstanding</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="outstandingLoan"
                defaultValue={
                  snapshot?.outstandingLoan ??
                  0
                }
              />
            </label>

            <label>
              <span>Employee contributions YTD</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="employeeContribYtd"
                defaultValue={
                  snapshot?.employeeContribYtd ??
                  0
                }
              />
            </label>

            <label>
              <span>Service automatic 1% YTD</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="serviceAutoYtd"
                defaultValue={
                  snapshot?.serviceAutoYtd ??
                  0
                }
              />
            </label>

            <label>
              <span>Service matching YTD</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="serviceMatchYtd"
                defaultValue={
                  snapshot?.serviceMatchYtd ??
                  0
                }
              />
            </label>

            {["G", "F", "C", "S", "I"].map(
              (code) => {
                const current =
                  tracker.funds.find(
                    (fund) =>
                      fund.code === code
                  );
                return (
                  <label key={code}>
                    <span>
                      {code} Fund balance
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      name={`fund${code}`}
                      defaultValue={
                        current?.balance ??
                        0
                      }
                    />
                  </label>
                );
              }
            )}

            <label>
              <span>Lifecycle fund name</span>
              <input
                type="text"
                name="lifecycleCode"
                placeholder="L 2050, L 2065, L Income..."
                defaultValue={
                  tracker.funds.find(
                    (fund) =>
                      fund.code.startsWith(
                        "L"
                      )
                  )?.code ?? ""
                }
              />
            </label>

            <label>
              <span>Lifecycle fund balance</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="lifecycleBalance"
                defaultValue={
                  tracker.funds.find(
                    (fund) =>
                      fund.code.startsWith(
                        "L"
                      )
                  )?.balance ?? 0
                }
              />
            </label>

            <label className="tsp-note-field">
              <span>Note</span>
              <textarea
                name="note"
                maxLength={2000}
                defaultValue={
                  snapshot?.note ??
                  ""
                }
                placeholder="Optional statement note."
              />
            </label>

            <button
              className="research-button"
              type="submit"
            >
              Save TSP snapshot
            </button>
          </form>
        </section>
      </div>

      <div className="bottom-note">
        <Landmark size={15} />
        <span>
          V1.7.1 stores no TSP.gov username or password and does not change TSP elections.
          Annual-limit and BRS calculations are planning aids; payroll/TSP records remain authoritative.
        </span>
      </div>
    </div>
  );
}
