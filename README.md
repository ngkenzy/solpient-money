# Solpient Money

Solpient Money is the personal-finance side of the Solpient platform.

This repository currently contains **V0.4**. Household accounts, transactions, holdings, cash flow, debt, goals, and planning inputs remain deterministic demo data. **Company Research is live** from Solpient Research through the V0.3 read-only contract.

## Current V0.4

### Financial Intelligence Engine

- Transparent 0–100 financial-health score
- Liquidity / emergency-fund months
- Six-month average savings rate
- Debt-to-assets and high-interest-debt review
- Portfolio concentration and cash-weight checks
- Live Research coverage and evidence-confidence component
- Goal-funding component
- Every component exposes inputs and its calculation

### Attention Feed

Solpient now prioritizes household observations into:

- Critical
- Review
- Opportunity
- Healthy

Attention items explain **why they appeared**, the **inputs used**, and the **calculation** behind the flag.

### Research-change alerts

Owned direct-stock holdings are matched to live published Solpient Research. The feed surfaces:

- Published Research changes
- Thesis-health watch/monitor states
- Low evidence-confidence flags
- Research score separately from evidence confidence

Synthetic Research scores and fair values are not allowed in Money.

### Scenario Lab

Interactive deterministic scenarios now allow changes to:

- Cash deployed above the reserve target
- Extra monthly savings
- Extra monthly debt payments
- One-time market shock
- Target age

The model shows projected investments, debt remaining, bank cash, projected demo net worth, and change versus baseline. It explicitly shows its assumptions and does not claim to be a forecast or recommendation.

### Debt intelligence

- APR-aware debt table
- Annualized interest estimate
- High-interest debt flag
- Highest-APR-first demo payoff sequence
- Scenario Lab integration

### Cash and balance-sheet intelligence

- Household net worth
- Invested assets
- Property
- Bank cash
- Liabilities
- Emergency-fund months
- Explicit reserve target
- Cash above the reserve target without automatically labeling it investable

## Research integration contract

Solpient Research exposes:

```
public.money_research_snapshots_v1
```

Money reads only the latest **published** Research package for score, valuation, thesis, risks, and version changes. Current evidence confidence and coverage readiness remain separately timestamped.

If Research is unavailable, Money shows it as unavailable rather than substituting synthetic values.

## Run locally

```bash
git clone https://github.com/ngkenzy/solpient-money.git
cd solpient-money
npm install
npm run test:research
npm run test:v04
npm run dev
```

Then open:

```
http://localhost:3000
```

## Release sequence

1. V0.1 — dashboard shell + deterministic demo data ✅
2. V0.2 — functional navigation, portfolio engine, holdings, transactions, interactive charts ✅
3. V0.3 — live Solpient Research read integration ✅
4. V0.4 — financial intelligence, attention feed, Research alerts, Scenario Lab ✅
5. V0.5 — dedicated Money Supabase auth/persistence
6. V0.6 — Plaid Sandbox
7. V0.7 — personal live-account testing
8. V1.0 — personal Solpient Money

## Security principle

Never commit bank credentials, Plaid secrets, Supabase secret/service-role keys, or personal financial exports. Personal financial data should remain isolated from the Research database.
