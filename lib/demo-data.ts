export type AccountType = "cash" | "investment" | "retirement" | "property" | "debt";
export type HoldingKind = "stock" | "etf" | "bond" | "cash";

export type Account = {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  balance: number;
  changeYtd: number;
  owner: "Household" | "Primary" | "Joint";
  lastFour: string;
  apr?: number;
  minimumPayment?: number;
  source?: "manual" | "demo" | "plaid" | "file" | "ofx_direct";
};

export type Holding = {
  ticker: string;
  name: string;
  kind: HoldingKind;
  shares: number;
  price: number;
  costBasis: number;
  value: number;
  dayChange: number;
  ytdReturn: number;
  sector: string;
  source?: "manual" | "demo" | "plaid" | "file" | "ofx_direct";
};

export type Transaction = {
  id: string;
  date: string;
  merchant: string;
  category: string;
  account: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  source?: "manual" | "demo" | "plaid" | "file" | "ofx_direct";
};

export const dataAsOf = "September 21, 2026";
export const demoRefresh = "4:00 PM ET";

export const accounts: Account[] = [
  { id: "cash-checking", name: "Everyday Checking", institution: "Demo Bank", type: "cash", balance: 27400, changeYtd: 5.2, owner: "Joint", lastFour: "1842" },
  { id: "cash-savings", name: "High-Yield Savings", institution: "Demo Bank", type: "cash", balance: 54600, changeYtd: 9.8, owner: "Joint", lastFour: "4806" },
  { id: "taxable", name: "Taxable Brokerage", institution: "Solpient Brokerage Demo", type: "investment", balance: 486000, changeYtd: 12.8, owner: "Primary", lastFour: "2241" },
  { id: "retirement", name: "Employer Retirement", institution: "Retirement Provider Demo", type: "retirement", balance: 378000, changeYtd: 10.4, owner: "Primary", lastFour: "7710" },
  { id: "home", name: "Primary Residence", institution: "Manual Asset", type: "property", balance: 485000, changeYtd: 3.2, owner: "Joint", lastFour: "HOME" },
  { id: "mortgage", name: "Mortgage", institution: "Demo Mortgage", type: "debt", balance: -142000, changeYtd: -7.1, owner: "Joint", lastFour: "6018", apr: 3.25, minimumPayment: 1150 },
  { id: "auto", name: "Auto Loan", institution: "Demo Credit Union", type: "debt", balance: -21000, changeYtd: -18.2, owner: "Joint", lastFour: "9134", apr: 4.9, minimumPayment: 620 },
  { id: "card", name: "Credit Card", institution: "Demo Card", type: "debt", balance: -4500, changeYtd: -21.4, owner: "Joint", lastFour: "1157", apr: 21.99, minimumPayment: 150 },
];

export const holdings: Holding[] = [
  { ticker: "VTI", name: "Vanguard Total Stock Market ETF", kind: "etf", shares: 820.5, price: 292.50, costBasis: 204100, value: 240000, dayChange: 0.6, ytdReturn: 11.8, sector: "Broad Market" },
  { ticker: "ADBE", name: "Adobe", kind: "stock", shares: 372.2, price: 317.03, costBasis: 132500, value: 118000, dayChange: -0.8, ytdReturn: -10.9, sector: "Technology" },
  { ticker: "MSFT", name: "Microsoft", kind: "stock", shares: 190.4, price: 504.20, costBasis: 77100, value: 96000, dayChange: 0.4, ytdReturn: 24.5, sector: "Technology" },
  { ticker: "DECK", name: "Deckers Outdoor", kind: "stock", shares: 1187.1, price: 77.50, costBasis: 104300, value: 92000, dayChange: -1.2, ytdReturn: -11.8, sector: "Consumer Discretionary" },
  { ticker: "VXUS", name: "Vanguard Total International Stock ETF", kind: "etf", shares: 1124.2, price: 76.50, costBasis: 75200, value: 86000, dayChange: 0.3, ytdReturn: 14.4, sector: "International" },
  { ticker: "BND", name: "Vanguard Total Bond Market ETF", kind: "bond", shares: 967.7, price: 74.40, costBasis: 73500, value: 72000, dayChange: 0.1, ytdReturn: 3.5, sector: "Fixed Income" },
  { ticker: "PFE", name: "Pfizer", kind: "stock", shares: 2519.7, price: 25.40, costBasis: 70200, value: 64000, dayChange: 0.9, ytdReturn: 8.1, sector: "Health Care" },
  { ticker: "CASH", name: "Money Market", kind: "cash", shares: 96000, price: 1, costBasis: 96000, value: 96000, dayChange: 0, ytdReturn: 4.2, sector: "Cash" },
];

export const transactions: Transaction[] = [
  { id: "t01", date: "Sep 20, 2026", merchant: "Fresh Market", category: "Groceries", account: "Everyday Checking", amount: -142.32, type: "expense" },
  { id: "t02", date: "Sep 19, 2026", merchant: "Airline Travel", category: "Travel", account: "Credit Card", amount: -628.40, type: "expense" },
  { id: "t03", date: "Sep 18, 2026", merchant: "Payroll Deposit", category: "Income", account: "Everyday Checking", amount: 5250, type: "income" },
  { id: "t04", date: "Sep 17, 2026", merchant: "Online Retail", category: "Shopping", account: "Credit Card", amount: -89.99, type: "expense" },
  { id: "t05", date: "Sep 16, 2026", merchant: "Card Payment", category: "Transfer", account: "Everyday Checking", amount: -2500, type: "transfer" },
  { id: "t06", date: "Sep 15, 2026", merchant: "Home Utility", category: "Utilities", account: "Everyday Checking", amount: -218.76, type: "expense" },
  { id: "t07", date: "Sep 14, 2026", merchant: "Fuel Station", category: "Transportation", account: "Credit Card", amount: -71.42, type: "expense" },
  { id: "t08", date: "Sep 13, 2026", merchant: "Restaurant", category: "Dining", account: "Credit Card", amount: -96.15, type: "expense" },
  { id: "t09", date: "Sep 12, 2026", merchant: "Payroll Deposit", category: "Income", account: "Everyday Checking", amount: 5250, type: "income" },
  { id: "t10", date: "Sep 11, 2026", merchant: "Mortgage Payment", category: "Housing", account: "Everyday Checking", amount: -2100, type: "expense" },
  { id: "t11", date: "Sep 10, 2026", merchant: "Streaming Service", category: "Subscriptions", account: "Credit Card", amount: -21.99, type: "expense" },
  { id: "t12", date: "Sep 09, 2026", merchant: "Insurance Premium", category: "Insurance", account: "Everyday Checking", amount: -284.20, type: "expense" },
  { id: "t13", date: "Sep 08, 2026", merchant: "Coffee Shop", category: "Dining", account: "Credit Card", amount: -8.40, type: "expense" },
  { id: "t14", date: "Sep 07, 2026", merchant: "Interest Credit", category: "Income", account: "High-Yield Savings", amount: 186.42, type: "income" },
  { id: "t15", date: "Sep 06, 2026", merchant: "Auto Loan Payment", category: "Debt", account: "Everyday Checking", amount: -620, type: "expense" },
];

export const monthlyCashFlow = [
  { label: "Apr", income: 15100, spending: 9100 },
  { label: "May", income: 15550, spending: 10300 },
  { label: "Jun", income: 16020, spending: 9700 },
  { label: "Jul", income: 16400, spending: 11200 },
  { label: "Aug", income: 15950, spending: 10150 },
  { label: "Sep", income: 16800, spending: 9200 },
];

export const netWorthSeries = [
  { label: "Jan", value: 1121000 },
  { label: "Feb", value: 1138000 },
  { label: "Mar", value: 1159000 },
  { label: "Apr", value: 1172000 },
  { label: "May", value: 1164000 },
  { label: "Jun", value: 1191000 },
  { label: "Jul", value: 1210000 },
  { label: "Aug", value: 1227800 },
  { label: "Sep", value: 1263500 },
];

export const portfolioPerformance = [
  { label: "Jan", portfolio: 0, benchmark: 0 },
  { label: "Feb", portfolio: 1.6, benchmark: 1.2 },
  { label: "Mar", portfolio: 3.1, benchmark: 2.4 },
  { label: "Apr", portfolio: 4.4, benchmark: 3.7 },
  { label: "May", portfolio: 3.8, benchmark: 4.1 },
  { label: "Jun", portfolio: 6.9, benchmark: 5.9 },
  { label: "Jul", portfolio: 8.8, benchmark: 7.2 },
  { label: "Aug", portfolio: 10.1, benchmark: 8.9 },
  { label: "Sep", portfolio: 12.4, benchmark: 10.6 },
];

export const allocation = [
  { label: "U.S. equities", value: 70, tone: "navy" },
  { label: "International", value: 10, tone: "blue" },
  { label: "Bonds", value: 8, tone: "sky" },
  { label: "Cash", value: 11, tone: "green" },
  { label: "Other", value: 1, tone: "slate" },
] as const;


export type HouseholdPlan = {
  demoCurrentAge: number;
  targetRetirementAge: number;
  emergencyFundTargetMonths: number;
  expectedAnnualReturnPct: number;
  targetRetirementAssets: number;
  singleStockReviewPct: number;
  topThreeStockReviewPct: number;
  portfolioCashReviewPct: number;
  highInterestDebtAprPct: number;
};

export const householdPlan: HouseholdPlan = {
  demoCurrentAge: 45,
  targetRetirementAge: 50,
  emergencyFundTargetMonths: 6,
  expectedAnnualReturnPct: 6,
  targetRetirementAssets: 1800000,
  singleStockReviewPct: 15,
  topThreeStockReviewPct: 35,
  portfolioCashReviewPct: 15,
  highInterestDebtAprPct: 8,
};

export const householdGoals = [
  { id: "reserve", name: "Emergency reserve", current: 82000, target: 60000 },
  { id: "travel", name: "Annual travel", current: 7000, target: 12000 },
  { id: "home", name: "Home projects", current: 18000, target: 30000 },
] as const;


export type MoneyDataset = {
  accounts: Account[];
  holdings: Holding[];
  transactions: Transaction[];
  monthlyCashFlow: Array<{ label: string; income: number; spending: number }>;
  netWorthSeries: Array<{ label: string; value: number }>;
  portfolioPerformance: Array<{ label: string; portfolio: number; benchmark: number }>;
  allocation: Array<{ label: string; value: number; tone: string }>;
  householdPlan: HouseholdPlan;
  householdGoals: Array<{ id: string; name: string; current: number; target: number }>;
};

export const demoMoneyDataset: MoneyDataset = {
  accounts,
  holdings,
  transactions: [...transactions],
  monthlyCashFlow: [...monthlyCashFlow],
  netWorthSeries: [...netWorthSeries],
  portfolioPerformance: [...portfolioPerformance],
  allocation: [...allocation],
  householdPlan,
  householdGoals: householdGoals.map((goal) => ({ ...goal })),
};
