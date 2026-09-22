"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

type Debt = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minimumPayment: number;
};

type Inputs = {
  currentAge: number;
  defaultRetirementAge: number;
  investedAssets: number;
  bankCash: number;
  propertyValue: number;
  monthlySavings: number;
  reserveTarget: number;
  expectedAnnualReturnPct: number;
  debts: Debt[];
};

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function futureValue(
  principal: number,
  monthlyContribution: number,
  annualReturnPct: number,
  months: number
) {
  const monthlyRate = annualReturnPct / 100 / 12;
  if (months <= 0) return principal;
  if (Math.abs(monthlyRate) < 0.0000001) return principal + monthlyContribution * months;
  const growth = Math.pow(1 + monthlyRate, months);
  return principal * growth + monthlyContribution * ((growth - 1) / monthlyRate);
}

function simulateDebt(debts: Debt[], extraMonthlyPayment: number, months: number) {
  const balances = debts
    .map((debt) => ({ ...debt }))
    .sort((a, b) => b.apr - a.apr);

  let interestPaid = 0;
  let payoffMonth: number | null = null;

  for (let month = 1; month <= months; month += 1) {
    let extra = extraMonthlyPayment;

    for (const debt of balances) {
      if (debt.balance <= 0) continue;
      const interest = debt.balance * (debt.apr / 100 / 12);
      debt.balance += interest;
      interestPaid += interest;
    }

    for (const debt of balances) {
      if (debt.balance <= 0) continue;
      const required = Math.min(debt.balance, debt.minimumPayment);
      debt.balance -= required;
    }

    for (const debt of balances) {
      if (debt.balance <= 0 || extra <= 0) continue;
      const payment = Math.min(debt.balance, extra);
      debt.balance -= payment;
      extra -= payment;
    }

    if (balances.every((debt) => debt.balance <= 0.01) && payoffMonth == null) {
      payoffMonth = month;
      break;
    }
  }

  return {
    remaining: balances.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0),
    interestPaid,
    payoffMonth,
  };
}

export default function ScenarioLab({ inputs }: { inputs: Inputs }) {
  const maxDeployableCash = Math.max(0, Math.floor(inputs.bankCash - inputs.reserveTarget));
  const [cashToDeploy, setCashToDeploy] = useState(Math.min(20000, maxDeployableCash));
  const [extraMonthlySavings, setExtraMonthlySavings] = useState(0);
  const [extraDebtPayment, setExtraDebtPayment] = useState(0);
  const [marketShockPct, setMarketShockPct] = useState(0);
  const [retirementAge, setRetirementAge] = useState(inputs.defaultRetirementAge);

  const years = Math.max(1, retirementAge - inputs.currentAge);
  const months = years * 12;

  const result = useMemo(() => {
    const postShockPrincipal =
      (inputs.investedAssets + cashToDeploy) * (1 + marketShockPct / 100);
    const scenarioPortfolio = futureValue(
      postShockPrincipal,
      inputs.monthlySavings + extraMonthlySavings,
      inputs.expectedAnnualReturnPct,
      months
    );
    const baselinePortfolio = futureValue(
      inputs.investedAssets,
      inputs.monthlySavings,
      inputs.expectedAnnualReturnPct,
      months
    );

    const scenarioDebt = simulateDebt(inputs.debts, extraDebtPayment, months);
    const baselineDebt = simulateDebt(inputs.debts, 0, months);
    const remainingCash = inputs.bankCash - cashToDeploy;

    const scenarioNetWorth =
      scenarioPortfolio + remainingCash + inputs.propertyValue - scenarioDebt.remaining;
    const baselineNetWorth =
      baselinePortfolio + inputs.bankCash + inputs.propertyValue - baselineDebt.remaining;

    return {
      scenarioPortfolio,
      baselinePortfolio,
      scenarioDebt,
      baselineDebt,
      remainingCash,
      scenarioNetWorth,
      baselineNetWorth,
      delta: scenarioNetWorth - baselineNetWorth,
    };
  }, [
    cashToDeploy,
    extraDebtPayment,
    extraMonthlySavings,
    inputs,
    marketShockPct,
    months,
  ]);

  function reset() {
    setCashToDeploy(Math.min(20000, maxDeployableCash));
    setExtraMonthlySavings(0);
    setExtraDebtPayment(0);
    setMarketShockPct(0);
    setRetirementAge(inputs.defaultRetirementAge);
  }

  return (
    <div className="scenario-lab">
      <div className="scenario-controls card">
        <div className="scenario-control-head">
          <div>
            <span className="card-kicker">SCENARIO INPUTS</span>
            <h2>Change the assumptions</h2>
          </div>
          <button className="scenario-reset" onClick={reset}><RotateCcw size={14} /> Reset</button>
        </div>

        <label className="scenario-control">
          <div><span>Deploy bank cash</span><strong>{currency(cashToDeploy)}</strong></div>
          <input
            type="range"
            min="0"
            max={Math.max(maxDeployableCash, 1)}
            step="1000"
            value={Math.min(cashToDeploy, Math.max(maxDeployableCash, 1))}
            onChange={(event) => setCashToDeploy(Number(event.target.value))}
          />
          <small>Limited to cash above the demo six-month reserve target.</small>
        </label>

        <label className="scenario-control">
          <div><span>Extra monthly savings</span><strong>{currency(extraMonthlySavings)}</strong></div>
          <input type="range" min="0" max="3000" step="100" value={extraMonthlySavings} onChange={(event) => setExtraMonthlySavings(Number(event.target.value))} />
          <small>Added to the six-month average household surplus.</small>
        </label>

        <label className="scenario-control">
          <div><span>Extra monthly debt payment</span><strong>{currency(extraDebtPayment)}</strong></div>
          <input type="range" min="0" max="2000" step="100" value={extraDebtPayment} onChange={(event) => setExtraDebtPayment(Number(event.target.value))} />
          <small>Applied highest APR first after required demo payments.</small>
        </label>

        <label className="scenario-control">
          <div><span>Immediate market shock</span><strong>{marketShockPct}%</strong></div>
          <input type="range" min="-40" max="10" step="5" value={marketShockPct} onChange={(event) => setMarketShockPct(Number(event.target.value))} />
          <small>One-time change to invested assets before long-run compounding.</small>
        </label>

        <label className="scenario-control">
          <div><span>Target age</span><strong>{retirementAge}</strong></div>
          <input type="range" min={inputs.currentAge + 1} max="65" step="1" value={retirementAge} onChange={(event) => setRetirementAge(Number(event.target.value))} />
          <small>{years} years from the synthetic demo age of {inputs.currentAge}.</small>
        </label>
      </div>

      <div className="scenario-results">
        <section className="card scenario-hero">
          <span className="card-kicker">PROJECTED DEMO NET WORTH</span>
          <strong>{currency(result.scenarioNetWorth)}</strong>
          <span className={result.delta >= 0 ? "positive-text" : "negative-text"}>
            {result.delta >= 0 ? "+" : ""}{currency(result.delta)} vs baseline
          </span>
          <small>Illustrative deterministic projection, not a forecast or recommendation.</small>
        </section>

        <div className="metric-grid two">
          <div className="metric-card">
            <span>Projected investments</span>
            <strong>{currency(result.scenarioPortfolio)}</strong>
            <small>Baseline {currency(result.baselinePortfolio)}</small>
          </div>
          <div className="metric-card">
            <span>Debt remaining</span>
            <strong>{currency(result.scenarioDebt.remaining)}</strong>
            <small>Estimated interest paid {currency(result.scenarioDebt.interestPaid)}</small>
          </div>
          <div className="metric-card">
            <span>Bank cash after deployment</span>
            <strong>{currency(result.remainingCash)}</strong>
            <small>Reserve target {currency(inputs.reserveTarget)}</small>
          </div>
          <div className="metric-card">
            <span>Debt payoff</span>
            <strong>{result.scenarioDebt.payoffMonth ? `${Math.ceil(result.scenarioDebt.payoffMonth / 12)} yr` : `>${years} yr`}</strong>
            <small>Demo avalanche sequence</small>
          </div>
        </div>

        <section className="card scenario-method">
          <span className="card-kicker">HOW THIS IS CALCULATED</span>
          <h3>Deterministic, inspectable assumptions</h3>
          <p>
            Investments use a constant {inputs.expectedAnnualReturnPct}% annual demo return after the selected one-time shock.
            Monthly contributions compound monthly. Debt accrues each account&apos;s demo APR, makes required payments,
            then sends any extra payment to the highest APR balance first. Property value is held constant.
          </p>
        </section>
      </div>
    </div>
  );
}
