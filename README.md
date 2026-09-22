# Solpient Money

Solpient Money is the personal-finance side of the Solpient platform.

This repository currently contains **V0.2**, a local-first dashboard prototype using deterministic demo data. No live bank credentials, Plaid connections, or real financial accounts are stored or used.

## Current V0.2

- Working route-based sidebar navigation
- Interactive net-worth and portfolio-performance charts
- Accounts page with grouped assets and liabilities
- Searchable/filterable transactions explorer
- Cash-flow analysis
- Portfolio holdings table and allocation analysis
- Individual holding pages
- Deterministic concentration, research-coverage, cash-weight, and portfolio-intelligence calculations
- Retirement, goals, debt, insights, and Research-integration surfaces
- Responsive desktop/tablet/mobile layout
- Clear demo-data labeling

## Run locally

```bash
git clone https://github.com/ngkenzy/solpient-money.git
cd solpient-money
npm install
npm run dev
```

Then open:

```
http://localhost:3000
```

## Product architecture

```
Solpient
├── Research
│   ├── Companies
│   ├── Valuation
│   ├── Thesis
│   ├── Risk
│   └── Evidence
└── Money
    ├── Accounts
    ├── Transactions
    ├── Cash Flow
    ├── Investments
    ├── Planning
    └── Intelligence
```

The intended integration boundary is controlled read access from Money into selected Research outputs. Personal financial data should remain isolated from the Research database.

## Planned sequence

1. V0.1 — dashboard shell + deterministic demo data ✅
2. V0.2 — functional navigation, portfolio engine, holdings, transactions, interactive charts, intelligence ✅
3. V0.3 — Solpient Research read integration
4. V0.4 — deterministic financial-intelligence rules
5. V0.5 — dedicated Supabase auth/persistence
6. V0.6 — Plaid Sandbox
7. V0.7 — personal live-account testing
8. V1.0 — personal Solpient Money

## Security principle

Never commit API keys, bank credentials, Plaid secrets, Supabase service-role keys, or personal financial exports to this repository.
