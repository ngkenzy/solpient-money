export const netWorthSeries = [
  842, 860, 855, 888, 910, 904, 945, 958, 982, 971, 1008, 1021,
  1048, 1034, 1072, 1090, 1082, 1125, 1144, 1131, 1170, 1160, 1198, 1215,
  1208, 1239, 1260, 1250, 1284,
];

export const allocation = [
  { label: "U.S. Equities", value: 61, tone: "navy" },
  { label: "International", value: 8, tone: "blue" },
  { label: "Bonds", value: 4, tone: "sky" },
  { label: "Cash", value: 22, tone: "green" },
  { label: "Other", value: 5, tone: "slate" },
] as const;

export const healthItems = [
  { label: "Emergency fund", status: "Healthy", level: "good" },
  { label: "Debt", status: "Manageable", level: "good" },
  { label: "Retirement", status: "On track", level: "good" },
  { label: "Portfolio concentration", status: "One position exceeds target", level: "warn" },
  { label: "Cash allocation", status: "More cash than your target", level: "warn" },
] as const;

export const transactions = [
  { merchant: "Whole Foods", category: "Groceries", amount: -142.32, date: "Sep 20" },
  { merchant: "Delta Air Lines", category: "Travel", amount: -628.4, date: "Sep 19" },
  { merchant: "Direct Deposit", category: "Income", amount: 5250, date: "Sep 18" },
  { merchant: "Amazon", category: "Shopping", amount: -89.99, date: "Sep 17" },
  { merchant: "Credit Card Payment", category: "Transfer", amount: -2500, date: "Sep 16" },
] as const;

export const attention = [
  {
    title: "Portfolio concentration",
    detail: "One position is above the target allocation you set for individual holdings.",
  },
  {
    title: "Cash allocation",
    detail: "Your liquid reserve is above the current emergency-fund target.",
  },
  {
    title: "Research coverage",
    detail: "Three holdings have new Solpient Research updates ready for review.",
  },
] as const;
