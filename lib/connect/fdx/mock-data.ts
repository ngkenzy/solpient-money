export const mockFdxAccounts = [
  {
    accountId: "fdx-checking-001",
    nickname: "FDX Sandbox Checking",
    productName: "Checking",
    accountType: "CHECKING",
    currentBalance: 8420.55,
    availableBalance: 8170.55,
    accountNumberDisplay: "0011",
    institutionName: "Solpient FDX Sandbox",
  },
  {
    accountId: "fdx-invest-001",
    nickname: "FDX Sandbox Brokerage",
    productName: "Brokerage",
    accountType: "INVESTMENT",
    currentBalance: 28640.2,
    accountNumberDisplay: "7788",
    institutionName: "Solpient FDX Sandbox",
    holdings: [
      {
        securityId: "sec-vti",
        symbol: "VTI",
        securityName:
          "Vanguard Total Stock Market ETF",
        securityType: "ETF",
        units: 40,
        unitPrice: 301.25,
        marketValue: 12050,
        costBasis: 10400,
      },
      {
        securityId: "sec-adbe",
        symbol: "ADBE",
        securityName: "Adobe Inc.",
        securityType: "STOCK",
        units: 30,
        unitPrice: 553.0066667,
        marketValue: 16590.2,
        costBasis: 15150,
      },
    ],
  },
];

export const mockFdxTransactions: Record<
  string,
  Record<string, unknown>[]
> = {
  "fdx-checking-001": [
    {
      transactionId: "fdx-tx-001",
      postedTimestamp:
        "2026-09-20T12:00:00Z",
      description: "Kroger",
      category: "Groceries",
      amount: -86.42,
    },
    {
      transactionId: "fdx-tx-002",
      postedTimestamp:
        "2026-09-19T12:00:00Z",
      description: "Army payroll",
      category: "Income",
      amount: 5125,
    },
  ],
  "fdx-invest-001": [
    {
      transactionId: "fdx-tx-003",
      postedTimestamp:
        "2026-09-18T12:00:00Z",
      description: "VTI purchase",
      category: "Investment",
      amount: -1205,
    },
  ],
};
