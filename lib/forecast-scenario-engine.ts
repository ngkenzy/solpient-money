export type ForecastDebt = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minimumPayment: number;
};

export type ForecastInputs = {
  investedAssets: number;
  bankCash: number;
  propertyValue: number;
  monthlyIncome: number;
  monthlySpending: number;
  reserveTarget: number;
  expectedAnnualReturnPct: number;
  debts: ForecastDebt[];
};

export type AllocationStrategy = "cash" | "invest" | "debt";

export type ForecastAssumptions = {
  horizonMonths: number;
  annualReturnPct: number;
  incomeChangePct: number;
  spendingChangePct: number;
  monthlyAllocation: number;
  strategy: AllocationStrategy;
  oneTimeDeployCash: number;
  immediateMarketShockPct: number;
};

export type ForecastPoint = {
  month: number;
  label: string;
  cash: number;
  investments: number;
  debt: number;
  netWorth: number;
  interestPaid: number;
};

export type ForecastResult = {
  points: ForecastPoint[];
  endingCash: number;
  endingInvestments: number;
  endingDebt: number;
  endingNetWorth: number;
  interestPaid: number;
  debtPayoffMonth: number | null;
  lowestCash: number;
  reserveBreached: boolean;
  monthlyIncome: number;
  monthlySpending: number;
  monthlySurplus: number;
};

export type StrategyComparison = {
  strategy: AllocationStrategy;
  endingNetWorth: number;
  endingCash: number;
  endingInvestments: number;
  endingDebt: number;
  interestPaid: number;
  debtPayoffMonth: number | null;
  deltaVsCash: number;
};

export type ForecastBandPoint = {
  label: string;
  lower: number;
  base: number;
  higher: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function monthlyRate(annualPct: number) {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

function monthLabel(offset: number) {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function totalDebt(debts: ForecastDebt[]) {
  return debts.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0);
}

function prepareDebts(debts: ForecastDebt[]) {
  return debts
    .map((debt) => ({
      ...debt,
      balance: Math.max(0, debt.balance),
      apr: Math.max(0, debt.apr),
      minimumPayment: Math.max(0, debt.minimumPayment),
    }))
    .sort((a, b) => b.apr - a.apr);
}

function payDebtAvalanche(
  debts: ForecastDebt[],
  amount: number
) {
  let remaining = Math.max(0, amount);

  for (const debt of debts) {
    if (remaining <= 0 || debt.balance <= 0) continue;
    const payment = Math.min(debt.balance, remaining);
    debt.balance -= payment;
    remaining -= payment;
  }

  return remaining;
}

function accrueAndPayMinimums(debts: ForecastDebt[]) {
  let interest = 0;

  for (const debt of debts) {
    if (debt.balance <= 0) continue;
    const monthlyInterest = debt.balance * (debt.apr / 100 / 12);
    debt.balance += monthlyInterest;
    interest += monthlyInterest;
  }

  for (const debt of debts) {
    if (debt.balance <= 0) continue;
    const payment = Math.min(debt.balance, debt.minimumPayment);
    debt.balance -= payment;
  }

  return interest;
}

export function baselineMonthlySurplus(inputs: ForecastInputs) {
  return inputs.monthlyIncome - inputs.monthlySpending;
}

export function maxDeployableCash(inputs: ForecastInputs) {
  return Math.max(0, inputs.bankCash - inputs.reserveTarget);
}

export function runForecast(
  inputs: ForecastInputs,
  assumptions: ForecastAssumptions
): ForecastResult {
  const months = Math.max(1, Math.round(assumptions.horizonMonths));
  const debts = prepareDebts(inputs.debts);

  const adjustedIncome =
    inputs.monthlyIncome * (1 + assumptions.incomeChangePct / 100);
  const adjustedSpending =
    inputs.monthlySpending * (1 + assumptions.spendingChangePct / 100);
  const monthlySurplus = adjustedIncome - adjustedSpending;

  const deployable = Math.min(
    Math.max(0, assumptions.oneTimeDeployCash),
    maxDeployableCash(inputs)
  );

  let cash = Math.max(0, inputs.bankCash - deployable);
  let investments =
    Math.max(0, inputs.investedAssets) *
    (1 + assumptions.immediateMarketShockPct / 100);

  if (assumptions.strategy === "invest") {
    investments += deployable;
  } else if (assumptions.strategy === "debt") {
    const unused = payDebtAvalanche(debts, deployable);
    cash += unused;
  } else {
    cash += deployable;
  }

  const investmentMonthlyRate = monthlyRate(
    assumptions.annualReturnPct
  );

  let interestPaid = 0;
  let debtPayoffMonth: number | null =
    totalDebt(debts) <= 0.01 ? 0 : null;
  let lowestCash = cash;

  const points: ForecastPoint[] = [
    {
      month: 0,
      label: "Now",
      cash,
      investments,
      debt: totalDebt(debts),
      netWorth:
        cash +
        investments +
        Math.max(0, inputs.propertyValue) -
        totalDebt(debts),
      interestPaid: 0,
    },
  ];

  for (let month = 1; month <= months; month += 1) {
    investments *= 1 + investmentMonthlyRate;
    interestPaid += accrueAndPayMinimums(debts);

    if (monthlySurplus >= 0) {
      const allocation = Math.min(
        monthlySurplus,
        Math.max(0, assumptions.monthlyAllocation)
      );
      const unallocated = monthlySurplus - allocation;

      if (assumptions.strategy === "invest") {
        investments += allocation;
      } else if (assumptions.strategy === "debt") {
        const unused = payDebtAvalanche(debts, allocation);
        cash += unused;
      } else {
        cash += allocation;
      }

      cash += unallocated;
    } else {
      cash += monthlySurplus;
    }

    if (cash < 0) cash = 0;

    const debt = totalDebt(debts);
    if (debt <= 0.01 && debtPayoffMonth == null) {
      debtPayoffMonth = month;
    }

    lowestCash = Math.min(lowestCash, cash);

    points.push({
      month,
      label: monthLabel(month),
      cash,
      investments,
      debt,
      netWorth:
        cash +
        investments +
        Math.max(0, inputs.propertyValue) -
        debt,
      interestPaid,
    });
  }

  const final = points.at(-1)!;

  return {
    points,
    endingCash: final.cash,
    endingInvestments: final.investments,
    endingDebt: final.debt,
    endingNetWorth: final.netWorth,
    interestPaid,
    debtPayoffMonth,
    lowestCash,
    reserveBreached: lowestCash < inputs.reserveTarget,
    monthlyIncome: adjustedIncome,
    monthlySpending: adjustedSpending,
    monthlySurplus,
  };
}

export function compareStrategies(
  inputs: ForecastInputs,
  horizonMonths: number,
  monthlyAllocation = Math.max(0, baselineMonthlySurplus(inputs))
): StrategyComparison[] {
  const common = {
    horizonMonths,
    annualReturnPct: inputs.expectedAnnualReturnPct,
    incomeChangePct: 0,
    spendingChangePct: 0,
    monthlyAllocation,
    oneTimeDeployCash: 0,
    immediateMarketShockPct: 0,
  };

  const cash = runForecast(inputs, {
    ...common,
    strategy: "cash",
  });

  return (["cash", "invest", "debt"] as AllocationStrategy[]).map(
    (strategy) => {
      const result =
        strategy === "cash"
          ? cash
          : runForecast(inputs, {
              ...common,
              strategy,
            });

      return {
        strategy,
        endingNetWorth: result.endingNetWorth,
        endingCash: result.endingCash,
        endingInvestments: result.endingInvestments,
        endingDebt: result.endingDebt,
        interestPaid: result.interestPaid,
        debtPayoffMonth: result.debtPayoffMonth,
        deltaVsCash: result.endingNetWorth - cash.endingNetWorth,
      };
    }
  );
}

export function buildForecastBands(
  inputs: ForecastInputs,
  assumptions: ForecastAssumptions,
  spreadPct = 5
): ForecastBandPoint[] {
  const base = runForecast(inputs, assumptions);
  const lower = runForecast(inputs, {
    ...assumptions,
    annualReturnPct: clamp(
      assumptions.annualReturnPct - Math.abs(spreadPct),
      -50,
      50
    ),
  });
  const higher = runForecast(inputs, {
    ...assumptions,
    annualReturnPct: clamp(
      assumptions.annualReturnPct + Math.abs(spreadPct),
      -50,
      50
    ),
  });

  return base.points.map((point, index) => ({
    label: point.label,
    lower: lower.points[index]?.netWorth ?? point.netWorth,
    base: point.netWorth,
    higher: higher.points[index]?.netWorth ?? point.netWorth,
  }));
}
