"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  LineChart,
  PiggyBank,
  RotateCcw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import InteractiveLineChart from "@/components/InteractiveLineChart";
import {
  baselineMonthlySurplus,
  buildForecastBands,
  compareStrategies,
  maxDeployableCash,
  runForecast,
  type AllocationStrategy,
  type ForecastInputs,
} from "@/lib/forecast-scenario-engine";

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function payoffLabel(month: number | null, horizonMonths: number) {
  if (month === 0) return "Paid off";
  if (month == null) return `>${Math.ceil(horizonMonths / 12)} yr`;
  if (month < 12) return `${month} mo`;
  const years = Math.floor(month / 12);
  const remaining = month % 12;
  return remaining ? `${years} yr ${remaining} mo` : `${years} yr`;
}

function strategyLabel(strategy: AllocationStrategy) {
  if (strategy === "invest") return "Invest surplus";
  if (strategy === "debt") return "Pay debt";
  return "Keep cash";
}

function strategyIcon(strategy: AllocationStrategy) {
  if (strategy === "invest") return <LineChart size={16} />;
  if (strategy === "debt") return <CreditCard size={16} />;
  return <Wallet size={16} />;
}

export default function ScenarioLab({
  inputs,
}: {
  inputs: ForecastInputs;
}) {
  const observedSurplus = Math.max(0, baselineMonthlySurplus(inputs));
  const deployableCash = maxDeployableCash(inputs);
  const defaultAllocation = Math.round(observedSurplus / 100) * 100;
  const allocationMax = Math.max(
    1000,
    Math.ceil(Math.max(observedSurplus * 1.5, 5000) / 500) * 500
  );

  const [horizonYears, setHorizonYears] = useState(5);
  const [strategy, setStrategy] =
    useState<AllocationStrategy>("invest");
  const [monthlyAllocation, setMonthlyAllocation] =
    useState(defaultAllocation);
  const [oneTimeDeployCash, setOneTimeDeployCash] = useState(0);
  const [annualReturnPct, setAnnualReturnPct] = useState(
    inputs.expectedAnnualReturnPct
  );
  const [incomeChangePct, setIncomeChangePct] = useState(0);
  const [spendingChangePct, setSpendingChangePct] = useState(0);
  const [marketShockPct, setMarketShockPct] = useState(0);

  const horizonMonths = horizonYears * 12;

  const baseline12 = useMemo(
    () =>
      runForecast(inputs, {
        horizonMonths: 12,
        annualReturnPct: inputs.expectedAnnualReturnPct,
        incomeChangePct: 0,
        spendingChangePct: 0,
        monthlyAllocation: observedSurplus,
        strategy: "cash",
        oneTimeDeployCash: 0,
        immediateMarketShockPct: 0,
      }),
    [inputs, observedSurplus]
  );

  const baselineBands = useMemo(
    () =>
      buildForecastBands(
        inputs,
        {
          horizonMonths: 12,
          annualReturnPct: inputs.expectedAnnualReturnPct,
          incomeChangePct: 0,
          spendingChangePct: 0,
          monthlyAllocation: observedSurplus,
          strategy: "cash",
          oneTimeDeployCash: 0,
          immediateMarketShockPct: 0,
        },
        5
      ),
    [inputs, observedSurplus]
  );

  const scenario = useMemo(
    () =>
      runForecast(inputs, {
        horizonMonths,
        annualReturnPct,
        incomeChangePct,
        spendingChangePct,
        monthlyAllocation,
        strategy,
        oneTimeDeployCash,
        immediateMarketShockPct: marketShockPct,
      }),
    [
      annualReturnPct,
      horizonMonths,
      incomeChangePct,
      inputs,
      marketShockPct,
      monthlyAllocation,
      oneTimeDeployCash,
      spendingChangePct,
      strategy,
    ]
  );

  const scenarioBands = useMemo(
    () =>
      buildForecastBands(
        inputs,
        {
          horizonMonths,
          annualReturnPct,
          incomeChangePct,
          spendingChangePct,
          monthlyAllocation,
          strategy,
          oneTimeDeployCash,
          immediateMarketShockPct: marketShockPct,
        },
        5
      ),
    [
      annualReturnPct,
      horizonMonths,
      incomeChangePct,
      inputs,
      marketShockPct,
      monthlyAllocation,
      oneTimeDeployCash,
      spendingChangePct,
      strategy,
    ]
  );

  const comparisonAllocation = Math.min(
    monthlyAllocation,
    observedSurplus
  );

  const comparisons = useMemo(
    () =>
      compareStrategies(
        inputs,
        horizonMonths,
        comparisonAllocation
      ),
    [comparisonAllocation, horizonMonths, inputs]
  );

  const currentDebt = inputs.debts.reduce(
    (sum, debt) => sum + debt.balance,
    0
  );

  function reset() {
    setHorizonYears(5);
    setStrategy("invest");
    setMonthlyAllocation(defaultAllocation);
    setOneTimeDeployCash(0);
    setAnnualReturnPct(inputs.expectedAnnualReturnPct);
    setIncomeChangePct(0);
    setSpendingChangePct(0);
    setMarketShockPct(0);
  }

  return (
    <div className="forecast-lab">
      <section className="card forecast-baseline-hero">
        <div className="forecast-baseline-icon">
          <ShieldCheck size={25} />
        </div>
        <div>
          <span className="card-kicker">12-MONTH BASELINE</span>
          <h2>{currency(baseline12.endingNetWorth)} projected net worth</h2>
          <p>
            Uses observed income/spending, current balances, required debt payments,
            and the household {inputs.expectedAnnualReturnPct}% investment-return assumption.
          </p>
        </div>
        <div className="forecast-baseline-surplus">
          <span>Observed monthly surplus</span>
          <strong>{currency(observedSurplus)}</strong>
          <small>
            {currency(inputs.monthlyIncome)} income · {currency(inputs.monthlySpending)} spending
          </small>
        </div>
      </section>

      <section className="forecast-metric-grid">
        <div className="card forecast-metric">
          <Banknote size={18} />
          <span>12-mo ending cash</span>
          <strong>{currency(baseline12.endingCash)}</strong>
          <small>baseline keeps observed surplus in cash</small>
        </div>
        <div className="card forecast-metric">
          <PiggyBank size={18} />
          <span>12-mo investments</span>
          <strong>{currency(baseline12.endingInvestments)}</strong>
          <small>base return assumption</small>
        </div>
        <div className="card forecast-metric">
          <CreditCard size={18} />
          <span>12-mo debt</span>
          <strong>{currency(baseline12.endingDebt)}</strong>
          <small>{currency(baseline12.interestPaid)} modeled interest</small>
        </div>
        <div className="card forecast-metric">
          <ShieldCheck size={18} />
          <span>Reserve status</span>
          <strong>{baseline12.reserveBreached ? "Below target" : "Maintained"}</strong>
          <small>lowest cash {currency(baseline12.lowestCash)}</small>
        </div>
      </section>

      <section className="card page-card forecast-chart-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">12-MONTH FORECAST RANGE</span>
            <h2>Net worth under lower, base, and higher return assumptions</h2>
            <p className="empty-copy">
              These are deterministic return bands, not probabilities. Lower and higher paths use
              five percentage points below and above the household return assumption.
            </p>
          </div>
        </div>
        <InteractiveLineChart
          data={baselineBands}
          series={[
            { key: "lower", label: "Lower return", format: "currency" },
            { key: "base", label: "Base", format: "currency" },
            { key: "higher", label: "Higher return", format: "currency" },
          ]}
          defaultRange="ALL"
          height={270}
        />
      </section>

      <section className="forecast-workbench">
        <section className="card forecast-controls">
          <div className="scenario-control-head">
            <div>
              <span className="card-kicker">WHAT-IF CONTROLS</span>
              <h2>Change the household assumptions</h2>
            </div>
            <button className="scenario-reset" type="button" onClick={reset}>
              <RotateCcw size={14} />
              Reset
            </button>
          </div>

          <div className="forecast-strategy-picker">
            {(["cash", "invest", "debt"] as AllocationStrategy[]).map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  className={strategy === option ? "active" : ""}
                  onClick={() => setStrategy(option)}
                >
                  {strategyIcon(option)}
                  <span>{strategyLabel(option)}</span>
                </button>
              )
            )}
          </div>

          <label className="scenario-control">
            <div>
              <span>Forecast horizon</span>
              <strong>{horizonYears} years</strong>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={horizonYears}
              onChange={(event) =>
                setHorizonYears(Number(event.target.value))
              }
            />
            <small>Used for the custom scenario and strategy comparison.</small>
          </label>

          <label className="scenario-control">
            <div>
              <span>Monthly surplus allocated</span>
              <strong>{currency(monthlyAllocation)}</strong>
            </div>
            <input
              type="range"
              min="0"
              max={allocationMax}
              step="100"
              value={Math.min(monthlyAllocation, allocationMax)}
              onChange={(event) =>
                setMonthlyAllocation(Number(event.target.value))
              }
            />
            <small>
              The same dollars go to {strategyLabel(strategy).toLowerCase()}; any
              remaining positive surplus stays in cash.
            </small>
          </label>

          <label className="scenario-control">
            <div>
              <span>Deploy cash above reserve</span>
              <strong>{currency(oneTimeDeployCash)}</strong>
            </div>
            <input
              type="range"
              min="0"
              max={Math.max(1, Math.floor(deployableCash))}
              step="1000"
              value={Math.min(
                oneTimeDeployCash,
                Math.max(1, Math.floor(deployableCash))
              )}
              onChange={(event) =>
                setOneTimeDeployCash(Number(event.target.value))
              }
            />
            <small>
              Maximum {currency(deployableCash)} while preserving the configured reserve.
            </small>
          </label>

          <label className="scenario-control">
            <div>
              <span>Investment return</span>
              <strong>{annualReturnPct.toFixed(1)}%</strong>
            </div>
            <input
              type="range"
              min="-10"
              max="15"
              step="0.5"
              value={annualReturnPct}
              onChange={(event) =>
                setAnnualReturnPct(Number(event.target.value))
              }
            />
            <small>Constant annual return assumption, compounded monthly.</small>
          </label>

          <label className="scenario-control">
            <div>
              <span>Income change</span>
              <strong>{percent(incomeChangePct)}</strong>
            </div>
            <input
              type="range"
              min="-30"
              max="30"
              step="1"
              value={incomeChangePct}
              onChange={(event) =>
                setIncomeChangePct(Number(event.target.value))
              }
            />
            <small>Applied to the observed monthly income baseline.</small>
          </label>

          <label className="scenario-control">
            <div>
              <span>Spending change</span>
              <strong>{percent(spendingChangePct)}</strong>
            </div>
            <input
              type="range"
              min="-30"
              max="30"
              step="1"
              value={spendingChangePct}
              onChange={(event) =>
                setSpendingChangePct(Number(event.target.value))
              }
            />
            <small>Applied to the observed monthly spending baseline.</small>
          </label>

          <label className="scenario-control">
            <div>
              <span>Immediate market shock</span>
              <strong>{percent(marketShockPct)}</strong>
            </div>
            <input
              type="range"
              min="-40"
              max="20"
              step="5"
              value={marketShockPct}
              onChange={(event) =>
                setMarketShockPct(Number(event.target.value))
              }
            />
            <small>One-time change to invested assets at the start of the scenario.</small>
          </label>
        </section>

        <section className="forecast-results">
          <section className="card forecast-result-hero">
            <span className="card-kicker">CUSTOM SCENARIO</span>
            <strong>{currency(scenario.endingNetWorth)}</strong>
            <span>
              {strategyLabel(strategy)} · {horizonYears}-year horizon
            </span>
            <small>
              Adjusted surplus {currency(scenario.monthlySurplus)}/mo · ending debt{" "}
              {currency(scenario.endingDebt)}
            </small>
          </section>

          <section className="card page-card forecast-chart-card">
            <div className="section-title-row">
              <div>
                <span className="card-kicker">CUSTOM NET-WORTH PATH</span>
                <h2>Return-sensitivity band</h2>
              </div>
            </div>
            <InteractiveLineChart
              data={scenarioBands}
              series={[
                { key: "lower", label: "Lower return", format: "currency" },
                { key: "base", label: "Scenario", format: "currency" },
                { key: "higher", label: "Higher return", format: "currency" },
              ]}
              defaultRange="ALL"
              height={250}
            />
          </section>

          <div className="forecast-result-grid">
            <div className="card">
              <span>Ending cash</span>
              <strong>{currency(scenario.endingCash)}</strong>
              <small>
                {scenario.reserveBreached
                  ? "Reserve falls below target"
                  : "Reserve remains at or above target"}
              </small>
            </div>
            <div className="card">
              <span>Ending investments</span>
              <strong>{currency(scenario.endingInvestments)}</strong>
              <small>{annualReturnPct.toFixed(1)}% modeled annual return</small>
            </div>
            <div className="card">
              <span>Debt payoff</span>
              <strong>{payoffLabel(scenario.debtPayoffMonth, horizonMonths)}</strong>
              <small>{currency(scenario.interestPaid)} modeled interest</small>
            </div>
            <div className="card">
              <span>Debt reduction</span>
              <strong>{currency(Math.max(0, currentDebt - scenario.endingDebt))}</strong>
              <small>from {currency(currentDebt)} current balance</small>
            </div>
          </div>
        </section>
      </section>

      <section className="card page-card forecast-compare-card">
        <div className="section-title-row">
          <div>
            <span className="card-kicker">SAME DOLLARS, DIFFERENT USE</span>
            <h2>Cash vs invest vs debt</h2>
            <p className="empty-copy">
              Each path uses the same {currency(comparisonAllocation)} monthly allocation for{" "}
              {horizonYears} years. The comparison describes modeled outcomes; it does not select
              an action for you.
            </p>
          </div>
        </div>

        <div className="forecast-strategy-grid">
          {comparisons.map((item) => (
            <div className="forecast-strategy-card" key={item.strategy}>
              <span className={`forecast-strategy-icon ${item.strategy}`}>
                {strategyIcon(item.strategy)}
              </span>
              <div>
                <span>{strategyLabel(item.strategy)}</span>
                <strong>{currency(item.endingNetWorth)}</strong>
              </div>
              <dl>
                <div>
                  <dt>vs keep cash</dt>
                  <dd className={item.deltaVsCash >= 0 ? "positive-text" : "negative-text"}>
                    {item.deltaVsCash >= 0 ? "+" : ""}
                    {currency(item.deltaVsCash)}
                  </dd>
                </div>
                <div>
                  <dt>Ending debt</dt>
                  <dd>{currency(item.endingDebt)}</dd>
                </div>
                <div>
                  <dt>Modeled interest</dt>
                  <dd>{currency(item.interestPaid)}</dd>
                </div>
                <div>
                  <dt>Debt payoff</dt>
                  <dd>{payoffLabel(item.debtPayoffMonth, horizonMonths)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="forecast-method-note">
        <ArrowDownRight size={14} />
        <span>
          <strong>HOW THIS IS CALCULATED</strong><br />
          Debt uses highest-APR-first after each account&apos;s minimum payment. Property value is
          held constant. New borrowing, taxes, inflation, Social Security, pensions, and changing
          interest rates are not modeled.
        </span>
        <ArrowUpRight size={14} />
      </section>
    </div>
  );
}
