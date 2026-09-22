# Solpient Money

Solpient Money is the personal-finance side of the Solpient platform.

This repository currently contains **V0.3**. Household accounts, transactions, holdings, and cash-flow values are still deterministic demo data. **Company Research is now live** from the existing Solpient Research system through a versioned read-only contract.

## Current V0.3

- Working route-based sidebar navigation
- Interactive net-worth and portfolio-performance charts
- Accounts page with grouped assets and liabilities
- Searchable/filterable transactions explorer
- Cash-flow analysis
- Portfolio holdings table and allocation analysis
- Individual holding pages
- Deterministic concentration and portfolio-intelligence calculations
- Live published Solpient Research score
- Live published bear/base/bull valuation and fair value
- Live thesis health and thesis-variable status
- Live current evidence-confidence and coverage-readiness metrics
- Live published risk register
- Live published “what changed” history
- Explicit timestamps separating frozen published research from current evidence/coverage metrics
- Retirement, goals, debt, insights, and Research integration surfaces
- Responsive desktop/tablet/mobile layout

## Research integration contract

Solpient Research exposes:

```
public.money_research_snapshots_v1
```

The view is **read-only** and uses `security_invoker = true`. Money reads only the latest **published** research run for company score, valuation, thesis, risks, and version changes.

Current Research ranking/coverage fields such as evidence confidence and decision readiness are also exposed, but they carry their own as-of timestamps so they are not mistaken for frozen publication-time facts.

Money does **not** read:

- baseline drafts
- research-composer drafts
- review-workbench records
- unpublished research runs
- service-role-only data

If the live Research contract is unavailable, Money shows Research as unavailable rather than substituting synthetic scores or valuations.

## Run locally

```bash
git clone https://github.com/ngkenzy/solphient-money.git
cd solphient-money
npm install
npm run test:research
npm run dev
```

Then open:

```
http://localhost:3000
```

## Product architecture

```
Solpient Research
├── immutable published research
├── score
├── valuation
├── thesis variables
├── risk register
├── research changes
├── evidence confidence
└── coverage readiness
        │
        │ read-only contract
        ▼
Solpient Money
├── Accounts
├── Transactions
├── Cash Flow
├── Portfolio
├── Planning
└── Intelligence
```

Personal financial data should remain isolated from the Research database. V0.3 reads public Research intelligence only.

## Release sequence

1. V0.1 — dashboard shell + deterministic demo data ✅
2. V0.2 — functional navigation, portfolio engine, holdings, transactions, interactive charts, intelligence ✅
3. V0.3 — live Solpient Research read integration ✅
4. V0.4 — deeper deterministic household financial-intelligence rules
5. V0.5 — dedicated Money Supabase auth/persistence
6. V0.6 — Plaid Sandbox
7. V0.7 — personal live-account testing
8. V1.0 — personal Solpient Money

## Security principle

Never commit bank credentials, Plaid secrets, Supabase secret/service-role keys, or personal financial exports. Supabase publishable keys are intentionally public client credentials; database access remains controlled by grants and RLS.
