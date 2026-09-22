# Solpient Money

Solpient Money is the private household-finance side of the Solpient platform.

## V0.5 status

**Application architecture: complete.**  
**Dedicated Supabase project: pending an available free-project slot.**

The Nexus Supabase organization currently has an older inactive project plus Solpient Research, and Supabase rejected creation of a third free project. V0.5 therefore remains in deterministic demo mode until the dedicated Money project can be created. No personal household data has been moved into Solpient Research.

## What V0.5 adds

### Dedicated private Money data model

The committed migration creates:

- profiles
- households
- household_members
- accounts
- transactions
- holdings
- goals
- planning_assumptions
- net_worth_snapshots
- portfolio_snapshots
- user_preferences

Every exposed Money table has Row Level Security enabled. Anonymous access is revoked. Household financial rows are authorized through household membership.

### Authentication

V0.5 uses the current Supabase SSR pattern:

- `@supabase/ssr` pinned to `0.12.7`
- `@supabase/supabase-js` pinned to `2.116.0`
- request-scoped browser/server clients
- Next.js 16 `proxy.ts`
- `auth.getClaims()` for protected-route identity validation
- password signup/sign-in
- PKCE confirmation callback
- sign-out route

No service-role key is used by the application.

### Household onboarding

After the dedicated project is connected, the first signed-in user can:

1. Create a household.
2. Become its owner through an atomic private database trigger.
3. Load the existing synthetic demo model into the Money database.
4. Use the same dashboard and V0.4 intelligence engine against persisted data.

### Persistence before Plaid

The **Data** page supports manual creation of:

- accounts
- transactions
- holdings
- goals
- planning assumptions

This makes V0.5 usable before bank aggregation is added.

### One MoneyDataset path

The V0.4 deterministic engine no longer imports financial globals directly. Pages now request one `MoneyDataset`:

```
Dedicated Money Supabase
        │
        ▼
 authenticated household
        │
        ▼
    MoneyDataset
        │
        ├── Financial Health
        ├── Cash Flow
        ├── Debt Intelligence
        ├── Portfolio
        ├── Retirement
        ├── Scenario Lab
        └── Attention Feed
```

If the Money Supabase project is not configured, the same adapter intentionally returns the deterministic demo dataset.

### Research remains separate

```
PRIVATE MONEY DATABASE             SOLPIENT RESEARCH
accounts                            companies
transactions                        scores
holdings                   ← read   valuation
debt                                thesis
goals                               evidence
planning                            risks / changes
```

Research never receives household account, transaction, debt, goal, or authentication data.

## Environment

Copy `.env.example` to `.env.local`.

The dedicated Money project will supply:

```bash
NEXT_PUBLIC_MONEY_SUPABASE_URL=...
NEXT_PUBLIC_MONEY_SUPABASE_PUBLISHABLE_KEY=...
```

Never use a secret/service-role key in the browser or commit one to GitHub.

## Database migration

The V0.5 schema is committed at:

```
supabase/migrations/20260922050000_v05_money_schema.sql
```

It has **not** been applied to Solpient Research. Apply it only to the dedicated Solpient Money project.

## Run locally

```bash
git clone https://github.com/ngkenzy/solpient-money.git
cd solpient-money
npm install
npm run test:research
npm run test:v04
npm run test:v05
npm run dev
```

Then open:

```
http://localhost:3000
```

## Release sequence

1. V0.1 — dashboard shell + deterministic demo data ✅
2. V0.2 — functional navigation, portfolio engine, holdings, transactions, charts ✅
3. V0.3 — live Solpient Research read integration ✅
4. V0.4 — financial intelligence, attention feed, Research alerts, Scenario Lab ✅
5. V0.5 — auth, household schema, RLS, persistence adapter, onboarding, manual data entry ✅ code / ⏳ project slot
6. V0.6 — Plaid Sandbox
7. V0.7 — personal live-account testing
8. V1.0 — personal Solpient Money

## Security principles

- Never commit bank credentials, Plaid secrets, Supabase secret/service-role keys, or personal financial exports.
- Personal financial data stays in the dedicated Money database.
- Solpient Research is read-only from Money.
- Authenticated routes are dynamic and are not ISR-cached.
- Household authorization is enforced in PostgreSQL RLS, not only in the UI.
- Research score and evidence confidence remain separate signals.
