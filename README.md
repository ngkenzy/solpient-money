# Solpient Money

Solpient Money is the personal-finance side of the Solpient platform.

This repository currently contains **V0.1**, a local-first dashboard prototype using deterministic demo data. No live bank credentials, Plaid connections, or real financial accounts are stored or used.

## Current V0.1

- Net worth overview and history
- Assets and liabilities
- Cash-flow summary
- Investment allocation
- Recent transactions
- Solpient Intelligence financial-health panel
- Solpient Research integration placeholder
- Responsive desktop/tablet/mobile layout
- Clear demo-data labeling

## Run locally

```bash
git clone https://github.com/ngkenzy/solphien-money.git
cd solphien-money
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

1. V0.1 — dashboard shell + deterministic demo data
2. V0.2 — portfolio engine + holdings pages
3. V0.3 — Solpient Research read integration
4. V0.4 — deterministic financial-intelligence rules
5. V0.5 — dedicated Supabase auth/persistence
6. V0.6 — Plaid Sandbox
7. V0.7 — personal live-account testing
8. V1.0 — personal Solpient Money

## Security principle

Never commit API keys, bank credentials, Plaid secrets, Supabase service-role keys, or personal financial exports to this repository.
